import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { CutoverFreezeService } from './CutoverFreezeService';
import { getInventoryMode, getCutoverSettings } from './InventoryMode';
import { LegacyOrderTransitionService } from './LegacyOrderTransitionService';
import { OpeningInventoryService } from './OpeningInventoryService';

export type ReadinessCheckStatus = 'PASS' | 'WARNING' | 'BLOCKED';

export type ReadinessCheck = {
  name: string;
  status: ReadinessCheckStatus;
  severity: 'P0' | 'P1' | 'P2' | 'INFO';
  message: string;
};

/**
 * Read-only cutover readiness report (TASK 15).
 * Never executes cutover or mutates stock.
 */
export class CutoverReadinessService {
  private readonly freeze: CutoverFreezeService;
  private readonly legacy: LegacyOrderTransitionService;
  private readonly opening: OpeningInventoryService;

  constructor(private readonly prisma: PrismaClient) {
    this.freeze = new CutoverFreezeService(prisma);
    this.legacy = new LegacyOrderTransitionService(prisma);
    this.opening = new OpeningInventoryService(prisma);
  }

  async getReadinessReport(options?: { openingFilePath?: string }) {
    const checks: ReadinessCheck[] = [];
    const mode = await getInventoryMode(this.prisma);
    const settings = await getCutoverSettings(this.prisma);
    const freezeStatus = await this.freeze.getStatus();

    // Database
    checks.push({
      name: 'cutover_settings_row',
      status: settings ? 'PASS' : 'BLOCKED',
      severity: settings ? 'INFO' : 'P0',
      message: settings
        ? `InventoryCutoverSettings present (status=${freezeStatus.cutoverStatus})`
        : 'InventoryCutoverSettings missing',
    });

    const wh = await this.prisma.location.findFirst({ where: { code: 'WH-MAIN' } });
    const sr = await this.prisma.location.findFirst({ where: { code: 'SR-MAIN' } });
    checks.push({
      name: 'location_wh_main',
      status: wh?.active && wh.isSellable ? 'PASS' : 'BLOCKED',
      severity: 'P0',
      message: wh
        ? `WH-MAIN id=${wh.id} active=${wh.active} sellable=${wh.isSellable}`
        : 'WH-MAIN missing',
    });
    checks.push({
      name: 'location_sr_main',
      status: sr?.active && sr.isSellable ? 'PASS' : 'BLOCKED',
      severity: 'P0',
      message: sr
        ? `SR-MAIN id=${sr.id} active=${sr.active} sellable=${sr.isSellable}`
        : 'SR-MAIN missing',
    });

    // Inventory tables (pre-cutover expect empty)
    const [balanceCount, movementCount, transferCount, docCount, reservationCount] =
      await Promise.all([
        this.prisma.inventoryBalance.count(),
        this.prisma.stockMovement.count(),
        this.prisma.transfer.count(),
        this.prisma.stockDocument.count(),
        this.prisma.reservation.count(),
      ]);

    if (mode === 'LEGACY') {
      checks.push({
        name: 'inventory_tables_empty',
        status:
          balanceCount === 0 &&
          movementCount === 0 &&
          transferCount === 0 &&
          docCount === 0 &&
          reservationCount === 0
            ? 'PASS'
            : 'WARNING',
        severity: 'P1',
        message: `balances=${balanceCount} movements=${movementCount} transfers=${transferCount} docs=${docCount} reservations=${reservationCount}`,
      });
      checks.push({
        name: 'inventory_mode',
        status: 'PASS',
        severity: 'INFO',
        message: 'inventoryMode=LEGACY (expected before cutover)',
      });
    } else {
      checks.push({
        name: 'inventory_mode',
        status: 'WARNING',
        severity: 'P0',
        message: 'inventoryMode already INVENTORY — cutover may already be complete',
      });
    }

    // Legacy orders
    const diag = await this.legacy.listDiagnostic();
    const unresolved = diag.summary.transitionRequired;
    checks.push({
      name: 'legacy_accessory_orders',
      status: unresolved === 0 ? 'PASS' : 'BLOCKED',
      severity: 'P1',
      message:
        unresolved === 0
          ? 'All open accessory flows have explicit transition or reservation'
          : `${unresolved} open accessory flow(s) still require admin transition (CLOSE/FREEZE)`,
    });

    const nullLocationOpen = [...diag.mattressOrders, ...diag.pillowOrders].filter(
      (o) => o.locationId == null && !['CLOSED_UNDER_LEGACY', 'FROZEN', 'HAS_RESERVATION'].includes(o.classification)
    ).length;
    checks.push({
      name: 'orders_missing_location',
      status: nullLocationOpen === 0 ? 'PASS' : 'WARNING',
      severity: 'P2',
      message: `${nullLocationOpen} unresolved open accessory order(s) have locationId=null`,
    });

    // Operational opening file
    const defaultFile = path.resolve(__dirname, '../../data/opening-inventory.json');
    const filePath = options?.openingFilePath
      ? path.resolve(options.openingFilePath)
      : defaultFile;
    const fileExists = fs.existsSync(filePath);
    checks.push({
      name: 'opening_inventory_file',
      status: fileExists ? 'WARNING' : 'BLOCKED',
      severity: 'P1',
      message: fileExists
        ? `Opening file present at ${filePath} — must be filled from physical count (not legacy stock)`
        : `Opening inventory file missing: ${filePath}. Generate template and fill from physical count.`,
    });

    if (fileExists) {
      try {
        const { plan, fileHash } = await this.opening.dryRun(filePath);
        const allZero = plan.rows.every(
          (r) => r.warehousePhysical === 0 && r.showroomPhysical === 0
        );
        checks.push({
          name: 'opening_inventory_validation',
          status: plan.canExecute ? (allZero ? 'WARNING' : 'PASS') : 'BLOCKED',
          severity: plan.canExecute ? 'P1' : 'P0',
          message: plan.canExecute
            ? allZero
              ? `File validates but all physical counts are 0 (hash=${fileHash}). Confirm this matches real count.`
              : `Opening file validates (hash=${fileHash}, canExecute=true)`
            : `Opening file invalid: ${(plan.errors || []).slice(0, 5).join('; ') || 'see dry-run'}`,
        });
      } catch (e) {
        checks.push({
          name: 'opening_inventory_validation',
          status: 'BLOCKED',
          severity: 'P0',
          message: `Opening file error: ${(e as Error).message}`,
        });
      }
    }

    checks.push({
      name: 'backup_confirmation',
      status: freezeStatus.backupConfirmedAt ? 'PASS' : 'BLOCKED',
      severity: 'P0',
      message: freezeStatus.backupConfirmedAt
        ? `Backup confirmed at ${freezeStatus.backupConfirmedAt.toISOString()}`
        : 'backupConfirmedAt is null — production backup must be confirmed before execute (never fake this)',
    });

    checks.push({
      name: 'cutover_freeze',
      status:
        freezeStatus.cutoverStatus === 'FROZEN'
          ? 'PASS'
          : freezeStatus.cutoverStatus === 'OPEN'
            ? 'WARNING'
            : 'WARNING',
      severity: 'P2',
      message: `cutoverStatus=${freezeStatus.cutoverStatus}. Activate FROZEN during physical count window.`,
    });

    checks.push({
      name: 'physical_count',
      status: freezeStatus.countFinalizedAt ? 'PASS' : 'BLOCKED',
      severity: 'P1',
      message: freezeStatus.countFinalizedAt
        ? `Count finalized at ${freezeStatus.countFinalizedAt.toISOString()}`
        : 'Physical count not finalized (countFinalizedAt is null)',
    });

    checks.push({
      name: 'code_safety_note',
      status: 'PASS',
      severity: 'INFO',
      message:
        'Accessory writers are mode-gated (TASK 14.2). Uncontrolled INVENTORY Pillow.stock writers not expected.',
    });

    checks.push({
      name: 'test_suites_note',
      status: 'WARNING',
      severity: 'INFO',
      message:
        'Re-run inventory regression suites before production execute (see runbook). This report does not execute tests.',
    });

    const blockers = checks.filter((c) => c.status === 'BLOCKED');
    const warnings = checks.filter((c) => c.status === 'WARNING');

    return {
      ready: blockers.length === 0,
      inventoryMode: mode,
      cutoverStatus: freezeStatus.cutoverStatus,
      blockers: blockers.map((b) => ({ name: b.name, message: b.message, severity: b.severity })),
      warnings: warnings.map((w) => ({ name: w.name, message: w.message, severity: w.severity })),
      checks,
      legacyOrderSummary: diag.summary,
      generatedAt: new Date().toISOString(),
    };
  }
}
