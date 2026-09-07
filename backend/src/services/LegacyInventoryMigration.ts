import fs from 'fs';
import path from 'path';
import { Prisma, PrismaClient } from '@prisma/client';
import { computeAvailable } from '../utils/inventory-balance';

export const MIGRATION_REF = 'LEGACY_INVENTORY_MIGRATION_V1';
export const MIGRATION_VERSION = 1;

export type AllocationEntry = {
  warehouse: number;
  showroom: number;
  presentation: number;
  notes?: string;
};

export type AllocationFile = {
  version: number;
  notes?: string;
  allocations: Record<
    string,
    | AllocationEntry
    | {
        warehouse: number | null;
        showroom: number | null;
        presentation?: number | null;
        notes?: string;
      }
  >;
};

export type PillowAuditRow = {
  pillowId: number;
  name: string;
  sku: null;
  legacyStock: number;
  historyCount: number;
  byType: Record<string, number>;
  reconstructed: number;
  reconstructionStatus: 'MATCH' | 'DISCREPANCY';
  difference: number;
  locationEvidence: 'LOCATION_UNKNOWN' | 'HAS_HINTS';
  locationHints: Array<{ id: number; reason: string | null; type: string }>;
  pillowOrderItemQty: number;
  orderPillowItemQty: number;
  alreadyMigrated: boolean;
  balanceConflict: boolean;
};

export type ValidatedAllocation = {
  pillowId: number;
  name: string;
  legacyStock: number;
  warehouse: number;
  showroom: number;
  presentation: number;
  reserved: number;
  availableWh: number;
  availableSr: number;
  companyPhysical: number;
  targetPhysicalTotal: number;
  status: 'OK' | 'NEEDS_ALLOCATION' | 'INVALID' | 'ALREADY_MIGRATED' | 'CONFLICT';
  errors: string[];
};

export type ExpectedMovement = {
  pillowId: number;
  name: string;
  locationCode: 'WH-MAIN' | 'SR-MAIN';
  quantity: number;
  presentation: number;
  type: 'INITIAL';
  referenceNumber: string;
};

export class MigrationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MigrationValidationError';
  }
}

export function reconstructFromHistory(byType: Record<string, number>): number {
  return (
    (byType.INITIAL || 0) +
    (byType.SUPPLY || 0) +
    (byType.OUTGOING || 0) +
    (byType.ADJUSTMENT || 0)
  );
}

export function validateAllocationAgainstStock(
  legacyStock: number,
  warehouse: number,
  showroom: number,
  presentation: number
): string[] {
  const errors: string[] = [];
  if (!Number.isInteger(warehouse) || warehouse < 0) errors.push('warehouse must be a non-negative integer');
  if (!Number.isInteger(showroom) || showroom < 0) errors.push('showroom must be a non-negative integer');
  if (!Number.isInteger(presentation) || presentation < 0) errors.push('presentation must be a non-negative integer');
  if (presentation > showroom) errors.push('presentation must be <= showroom');
  if (warehouse + showroom !== legacyStock) {
    errors.push(`warehouse + showroom (${warehouse + showroom}) must equal Pillow.stock (${legacyStock})`);
  }
  return errors;
}

export function isAllocationComplete(
  entry: AllocationFile['allocations'][string] | undefined
): entry is AllocationEntry {
  if (!entry) return false;
  return (
    typeof entry.warehouse === 'number' &&
    typeof entry.showroom === 'number' &&
    Number.isInteger(entry.warehouse) &&
    Number.isInteger(entry.showroom) &&
    (entry.presentation === undefined ||
      entry.presentation === null ||
      (typeof entry.presentation === 'number' && Number.isInteger(entry.presentation)))
  );
}

export function migrationReferenceNumber(pillowId: number, label: 'WH' | 'SR'): string {
  return `${MIGRATION_REF}:pillow:${pillowId}:${label}`;
}

export class LegacyInventoryMigration {
  constructor(private readonly prisma: PrismaClient) {}

  async auditAll(): Promise<{
    cutoverHint: string;
    totals: { pillowCount: number; stockSum: number; historyCount: number };
    locations: Array<{ id: number; code: string; type: string; active: boolean }>;
    inventoryBalanceCount: number;
    stockMovementCount: number;
    transferCount: number;
    pillows: PillowAuditRow[];
  }> {
    const pillows = await this.prisma.pillow.findMany({ orderBy: { id: 'asc' } });
    const locations = await this.prisma.location.findMany({
      select: { id: true, code: true, type: true, active: true },
      orderBy: { sortOrder: 'asc' },
    });
    const rows: PillowAuditRow[] = [];
    let historyCount = 0;

    for (const pillow of pillows) {
      const hist = await this.prisma.pillowStockHistory.findMany({
        where: { pillowId: pillow.id },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      historyCount += hist.length;

      const byType: Record<string, number> = {};
      for (const h of hist) {
        byType[h.type] = (byType[h.type] || 0) + h.quantity;
      }
      const reconstructed = reconstructFromHistory(byType);
      const locationHints = hist
        .filter((h) => {
          const r = (h.reason || '').toLowerCase();
          return (
            r.includes('warehouse') ||
            r.includes('showroom') ||
            r.includes('entrepot') ||
            r.includes('entrepôt') ||
            r.includes('wh-main') ||
            r.includes('sr-main')
          );
        })
        .map((h) => ({ id: h.id, reason: h.reason, type: h.type }));

      const poiQty = await this.prisma.pillowOrderItem.aggregate({
        where: { pillowId: pillow.id },
        _sum: { quantity: true },
      });
      const opiQty = await this.prisma.orderPillowItem.aggregate({
        where: { pillowId: pillow.id },
        _sum: { quantity: true },
      });

      const alreadyMigrated =
        (await this.prisma.stockMovement.count({
          where: {
            pillowId: pillow.id,
            referenceType: MIGRATION_REF,
            type: 'INITIAL',
          },
        })) > 0;

      const bals = await this.prisma.inventoryBalance.findMany({ where: { pillowId: pillow.id } });
      const balanceConflict =
        !alreadyMigrated && bals.some((b) => b.physical !== 0 || b.presentation !== 0 || b.reserved !== 0);

      rows.push({
        pillowId: pillow.id,
        name: pillow.name,
        sku: null,
        legacyStock: pillow.stock,
        historyCount: hist.length,
        byType,
        reconstructed,
        reconstructionStatus: reconstructed === pillow.stock ? 'MATCH' : 'DISCREPANCY',
        difference: pillow.stock - reconstructed,
        locationEvidence: locationHints.length ? 'HAS_HINTS' : 'LOCATION_UNKNOWN',
        locationHints,
        pillowOrderItemQty: poiQty._sum.quantity || 0,
        orderPillowItemQty: opiQty._sum.quantity || 0,
        alreadyMigrated,
        balanceConflict,
      });
    }

    return {
      cutoverHint:
        'Before CUTOVER: PillowStockHistory is legacy evidence. After CUTOVER: StockMovement is the new ledger. Do not fabricate location history.',
      totals: {
        pillowCount: pillows.length,
        stockSum: pillows.reduce((s, p) => s + p.stock, 0),
        historyCount,
      },
      locations,
      inventoryBalanceCount: await this.prisma.inventoryBalance.count(),
      stockMovementCount: await this.prisma.stockMovement.count(),
      transferCount: await this.prisma.transfer.count(),
      pillows: rows,
    };
  }

  generateTemplate(audit: Awaited<ReturnType<LegacyInventoryMigration['auditAll']>>): AllocationFile {
    const allocations: AllocationFile['allocations'] = {};
    for (const p of audit.pillows) {
      allocations[String(p.pillowId)] = {
        warehouse: null,
        showroom: null,
        presentation: 0,
        notes: `${p.name} — legacy stock ${p.legacyStock} — ${p.locationEvidence} — fill warehouse+showroom == ${p.legacyStock}`,
      };
    }
    return {
      version: MIGRATION_VERSION,
      notes:
        'OPERATOR INPUT REQUIRED. Set warehouse and showroom integers per pillow so warehouse+showroom === Pillow.stock. presentation <= showroom. reserved will be 0. Do NOT invent values.',
      allocations,
    };
  }

  loadAllocationFile(filePath: string): AllocationFile {
    const abs = path.resolve(filePath);
    if (!fs.existsSync(abs)) {
      throw new MigrationValidationError(`Allocation file not found: ${abs}`);
    }
    const raw = JSON.parse(fs.readFileSync(abs, 'utf8')) as AllocationFile;
    if (!raw || typeof raw !== 'object' || !raw.allocations) {
      throw new MigrationValidationError('Invalid allocation file shape');
    }
    return raw;
  }

  async buildPlan(
    allocation: AllocationFile,
    options?: { onlyPillowIds?: number[] }
  ): Promise<{
    rows: ValidatedAllocation[];
    expectedMovements: ExpectedMovement[];
    canExecute: boolean;
    needsOperatorAllocation: boolean;
    alreadyMigratedOnly: boolean;
    errors: string[];
  }> {
    const audit = await this.auditAll();
    const wh = audit.locations.find((l) => l.code === 'WH-MAIN');
    const sr = audit.locations.find((l) => l.code === 'SR-MAIN');
    if (!wh || !sr) {
      throw new MigrationValidationError('WH-MAIN and SR-MAIN locations are required');
    }
    if (!wh.active || !sr.active) {
      throw new MigrationValidationError('WH-MAIN and SR-MAIN must be active');
    }

    const pillows = options?.onlyPillowIds?.length
      ? audit.pillows.filter((p) => options.onlyPillowIds!.includes(p.pillowId))
      : audit.pillows;

    if (options?.onlyPillowIds?.length && pillows.length !== options.onlyPillowIds.length) {
      throw new MigrationValidationError('onlyPillowIds contains unknown pillow ids');
    }

    const rows: ValidatedAllocation[] = [];
    const errors: string[] = [];
    let needsOperatorAllocation = false;

    for (const p of pillows) {
      const entry = allocation.allocations[String(p.pillowId)];

      if (p.balanceConflict) {
        const msg =
          'CONFLICT: InventoryBalance has non-zero values without LEGACY_INVENTORY_MIGRATION_V1 markers — refuse automatic repair';
        errors.push(`Pillow ${p.pillowId}: ${msg}`);
        rows.push({
          pillowId: p.pillowId,
          name: p.name,
          legacyStock: p.legacyStock,
          warehouse: 0,
          showroom: 0,
          presentation: 0,
          reserved: 0,
          availableWh: 0,
          availableSr: 0,
          companyPhysical: p.legacyStock,
          targetPhysicalTotal: 0,
          status: 'CONFLICT',
          errors: [msg],
        });
        continue;
      }

      if (p.alreadyMigrated) {
        rows.push({
          pillowId: p.pillowId,
          name: p.name,
          legacyStock: p.legacyStock,
          warehouse: 0,
          showroom: 0,
          presentation: 0,
          reserved: 0,
          availableWh: 0,
          availableSr: 0,
          companyPhysical: p.legacyStock,
          targetPhysicalTotal: 0,
          status: 'ALREADY_MIGRATED',
          errors: [],
        });
        continue;
      }

      if (!isAllocationComplete(entry)) {
        needsOperatorAllocation = true;
        rows.push({
          pillowId: p.pillowId,
          name: p.name,
          legacyStock: p.legacyStock,
          warehouse: 0,
          showroom: 0,
          presentation: 0,
          reserved: 0,
          availableWh: 0,
          availableSr: 0,
          companyPhysical: p.legacyStock,
          targetPhysicalTotal: 0,
          status: 'NEEDS_ALLOCATION',
          errors: ['Operator must provide warehouse/showroom integers'],
        });
        continue;
      }

      const warehouse = entry.warehouse;
      const showroom = entry.showroom;
      const presentation = entry.presentation ?? 0;
      const reserved = 0;
      const valErrors = validateAllocationAgainstStock(p.legacyStock, warehouse, showroom, presentation);

      const status = valErrors.length ? 'INVALID' : 'OK';
      if (valErrors.length) {
        errors.push(`Pillow ${p.pillowId}: ${valErrors.join('; ')}`);
      }

      rows.push({
        pillowId: p.pillowId,
        name: p.name,
        legacyStock: p.legacyStock,
        warehouse,
        showroom,
        presentation,
        reserved,
        availableWh: computeAvailable(warehouse, 0, reserved),
        availableSr: computeAvailable(showroom, presentation, reserved),
        companyPhysical: warehouse + showroom,
        targetPhysicalTotal: warehouse + showroom,
        status,
        errors: valErrors,
      });
    }

    // Extra unknown keys in allocation (relative to plan scope)
    const allowedIds = new Set(pillows.map((p) => String(p.pillowId)));
    for (const key of Object.keys(allocation.allocations)) {
      if (!allowedIds.has(key)) {
        // When scoping to onlyPillowIds, ignore other keys; for full migration, reject extras
        if (!options?.onlyPillowIds?.length) {
          errors.push(`Unknown pillow id in allocation file: ${key}`);
        }
      }
    }

    // Missing pillows from allocation when full migration
    if (!options?.onlyPillowIds?.length) {
      for (const p of pillows) {
        if (!(String(p.pillowId) in allocation.allocations) && !p.alreadyMigrated) {
          needsOperatorAllocation = true;
          errors.push(`Missing allocation for pillow ${p.pillowId}`);
        }
      }
    }

    const okRows = rows.filter((r) => r.status === 'OK');
    const alreadyMigratedOnly =
      rows.length > 0 && rows.every((r) => r.status === 'ALREADY_MIGRATED') && errors.length === 0;

    const canExecute =
      !needsOperatorAllocation &&
      errors.length === 0 &&
      rows.every((r) => r.status === 'OK' || r.status === 'ALREADY_MIGRATED') &&
      okRows.length > 0;

    const expectedMovements: ExpectedMovement[] = [];
    for (const r of okRows) {
      expectedMovements.push({
        pillowId: r.pillowId,
        name: r.name,
        locationCode: 'WH-MAIN',
        quantity: r.warehouse,
        presentation: 0,
        type: 'INITIAL',
        referenceNumber: migrationReferenceNumber(r.pillowId, 'WH'),
      });
      expectedMovements.push({
        pillowId: r.pillowId,
        name: r.name,
        locationCode: 'SR-MAIN',
        quantity: r.showroom,
        presentation: r.presentation,
        type: 'INITIAL',
        referenceNumber: migrationReferenceNumber(r.pillowId, 'SR'),
      });
    }

    return {
      rows,
      expectedMovements,
      canExecute,
      needsOperatorAllocation,
      alreadyMigratedOnly,
      errors,
    };
  }

  async dryRun(allocationPath: string, options?: { onlyPillowIds?: number[] }) {
    const allocation = this.loadAllocationFile(allocationPath);
    const audit = await this.auditAll();
    const plan = await this.buildPlan(allocation, options);
    return { audit, plan };
  }

  /**
   * Execute opening inventory migration.
   * Does NOT modify Pillow.stock or PillowStockHistory.
   * Entire batch is one transaction (all-or-nothing).
   */
  async execute(
    allocationPath: string,
    options?: { userId?: number | null; onlyPillowIds?: number[] }
  ) {
    const allocation = this.loadAllocationFile(allocationPath);
    const plan = await this.buildPlan(allocation, { onlyPillowIds: options?.onlyPillowIds });

    if (plan.alreadyMigratedOnly) {
      return {
        status: 'ALREADY_MIGRATED' as const,
        cutoverAt: new Date(),
        migrated: [] as number[],
        movementsCreated: 0,
        balancesCreated: 0,
      };
    }
    if (plan.needsOperatorAllocation) {
      throw new MigrationValidationError('NEEDS_ALLOCATION — refuse execute');
    }
    if (plan.errors.length || !plan.canExecute) {
      throw new MigrationValidationError(
        `Validation failed: ${plan.errors.join(' | ') || 'canExecute=false'}`
      );
    }

    const wh = await this.prisma.location.findFirst({ where: { code: 'WH-MAIN', active: true } });
    const sr = await this.prisma.location.findFirst({ where: { code: 'SR-MAIN', active: true } });
    if (!wh || !sr) throw new MigrationValidationError('Active WH-MAIN and SR-MAIN required');

    const beforeStockSum =
      (await this.prisma.pillow.aggregate({ _sum: { stock: true } }))._sum.stock ?? 0;
    const beforeHistory = await this.prisma.pillowStockHistory.count();
    const beforeTransfers = await this.prisma.transfer.count();
    const cutoverAt = new Date();
    const toMigrate = plan.rows.filter((r) => r.status === 'OK');
    const userId = options?.userId ?? null;

    const result = await this.prisma.$transaction(async (tx) => {
      // Lock pillows to reduce concurrent double-migration risk
      for (const row of toMigrate) {
        await tx.$queryRaw`SELECT id, stock FROM Pillow WHERE id = ${row.pillowId} FOR UPDATE`;
      }

      const done: number[] = [];
      let movementsCreated = 0;
      let balancesTouched = 0;

      for (const row of toMigrate) {
        const existing = await tx.stockMovement.count({
          where: { pillowId: row.pillowId, referenceType: MIGRATION_REF, type: 'INITIAL' },
        });
        if (existing > 0) {
          // Concurrent winner already migrated this pillow
          continue;
        }

        await this.applyOpeningInTx(tx, {
          pillowId: row.pillowId,
          locationId: wh.id,
          physical: row.warehouse,
          presentation: 0,
          label: 'WH',
          userId,
        });
        movementsCreated += 1;
        balancesTouched += 1;

        await this.applyOpeningInTx(tx, {
          pillowId: row.pillowId,
          locationId: sr.id,
          physical: row.showroom,
          presentation: row.presentation,
          label: 'SR',
          userId,
        });
        movementsCreated += 1;
        balancesTouched += 1;

        done.push(row.pillowId);
      }

      if (done.length === 0) {
        return {
          status: 'ALREADY_MIGRATED' as const,
          done,
          movementsCreated: 0,
          balancesTouched: 0,
        };
      }

      // Per-pillow reconciliation
      for (const row of toMigrate.filter((r) => done.includes(r.pillowId))) {
        const pillow = await tx.pillow.findUnique({ where: { id: row.pillowId } });
        if (!pillow) throw new MigrationValidationError(`Pillow ${row.pillowId} missing`);
        const bals = await tx.inventoryBalance.findMany({ where: { pillowId: row.pillowId } });
        const physicalSum = bals.reduce((s, b) => s + b.physical, 0);
        if (physicalSum !== pillow.stock) {
          throw new MigrationValidationError(
            `RECONCILIATION FAILED pillow ${pillow.id}: physicalSum=${physicalSum} Pillow.stock=${pillow.stock}`
          );
        }
        const whBal = bals.find((b) => b.locationId === wh.id);
        const srBal = bals.find((b) => b.locationId === sr.id);
        if (!whBal || !srBal) {
          throw new MigrationValidationError(`Missing WH/SR balance for pillow ${pillow.id}`);
        }
        if (whBal.presentation !== 0 || whBal.reserved !== 0) {
          throw new MigrationValidationError(`Warehouse balance invalid for pillow ${pillow.id}`);
        }
        if (srBal.presentation > srBal.physical || srBal.reserved !== 0) {
          throw new MigrationValidationError(`Showroom balance invalid for pillow ${pillow.id}`);
        }
      }

      const stockSum = (await tx.pillow.aggregate({ _sum: { stock: true } }))._sum.stock ?? 0;
      const historyCount = await tx.pillowStockHistory.count();
      const transferCount = await tx.transfer.count();
      if (stockSum !== beforeStockSum || historyCount !== beforeHistory) {
        throw new MigrationValidationError('Pillow.stock or PillowStockHistory changed during migration');
      }
      if (transferCount !== beforeTransfers) {
        throw new MigrationValidationError('Transfer rows changed during migration');
      }

      // Global: for full migration, SUM(physical) must equal SUM(Pillow.stock)
      if (!options?.onlyPillowIds?.length) {
        const globalPhysical =
          (await tx.inventoryBalance.aggregate({ _sum: { physical: true } }))._sum.physical ?? 0;
        if (globalPhysical !== stockSum) {
          throw new MigrationValidationError(
            `Global reconciliation failed: SUM(physical)=${globalPhysical} SUM(Pillow.stock)=${stockSum}`
          );
        }
      }

      if (userId) {
        await tx.activity.create({
          data: {
            userId,
            type: MIGRATION_REF,
            description: `Legacy inventory migration executed (v${MIGRATION_VERSION})`,
            details: JSON.stringify({
              version: MIGRATION_VERSION,
              cutoverAt: cutoverAt.toISOString(),
              pillowCount: done.length,
              totalPhysical: toMigrate
                .filter((r) => done.includes(r.pillowId))
                .reduce((s, r) => s + r.warehouse + r.showroom, 0),
              migratedPillowIds: done,
              allocationSummary: toMigrate
                .filter((r) => done.includes(r.pillowId))
                .map((r) => ({
                  pillowId: r.pillowId,
                  warehouse: r.warehouse,
                  showroom: r.showroom,
                  presentation: r.presentation,
                })),
              allocationPath,
              movementsCreated,
              balancesTouched,
            }),
          },
        });
      }

      return {
        status: 'EXECUTED' as const,
        done,
        movementsCreated,
        balancesTouched,
      };
    });

    return {
      status: result.status,
      cutoverAt,
      migrated: result.done,
      movementsCreated: result.movementsCreated,
      balancesCreated: result.balancesTouched,
    };
  }

  /**
   * Opening balance + exactly one INITIAL StockMovement per location.
   * Presentation is set on the same balance and recorded on the INITIAL movement
   * (no separate ADJUSTMENT row — keeps movement count = pillows × 2).
   */
  private async applyOpeningInTx(
    tx: Prisma.TransactionClient,
    args: {
      pillowId: number;
      locationId: number;
      physical: number;
      presentation: number;
      label: 'WH' | 'SR';
      userId?: number | null;
    }
  ) {
    const ref = migrationReferenceNumber(args.pillowId, args.label);
    const existingMove = await tx.stockMovement.findFirst({
      where: { referenceType: MIGRATION_REF, referenceNumber: ref, type: 'INITIAL' },
    });
    if (existingMove) {
      throw new MigrationValidationError(`Duplicate INITIAL movement for ${ref}`);
    }

    let balance = await tx.inventoryBalance.findUnique({
      where: {
        pillowId_locationId: { pillowId: args.pillowId, locationId: args.locationId },
      },
    });

    if (!balance) {
      balance = await tx.inventoryBalance.create({
        data: {
          pillowId: args.pillowId,
          locationId: args.locationId,
          physical: 0,
          presentation: 0,
          reserved: 0,
        },
      });
    }

    if (balance.physical !== 0 || balance.presentation !== 0 || balance.reserved !== 0) {
      throw new MigrationValidationError(
        `Cannot migrate pillow ${args.pillowId} location ${args.locationId}: balance already non-zero without migration marker`
      );
    }

    if (args.presentation > args.physical) {
      throw new MigrationValidationError('presentation > physical during migration');
    }

    await tx.inventoryBalance.update({
      where: { id: balance.id },
      data: {
        physical: args.physical,
        presentation: args.presentation,
        reserved: 0,
      },
    });

    await tx.stockMovement.create({
      data: {
        pillowId: args.pillowId,
        locationId: args.locationId,
        type: 'INITIAL',
        quantity: args.physical,
        previousPhysical: 0,
        newPhysical: args.physical,
        previousPresentation: 0,
        newPresentation: args.presentation,
        previousReserved: 0,
        newReserved: 0,
        reason: `Legacy inventory migration opening balance (${args.label})`,
        referenceType: MIGRATION_REF,
        referenceNumber: ref,
        userId: args.userId ?? null,
      },
    });
  }
}
