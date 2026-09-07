/**
 * Legacy accessory inventory migration (TASK 6 tooling / TASK 9 execution).
 *
 * Workflow:
 *   1. npm run inventory:migrate-legacy -- --audit
 *   2. npm run inventory:migrate-legacy -- --generate-template
 *   3. Fill backend/data/legacy-inventory-allocation.json (verified WH/SR)
 *   4. npm run inventory:migrate-legacy -- --dry-run --allocation ./data/legacy-inventory-allocation.json
 *   5. Take MySQL backup
 *   6. npm run inventory:migrate-legacy -- --execute --allocation ./data/legacy-inventory-allocation.json --confirm-backup
 *
 * NEVER invent Warehouse/Showroom splits.
 * BACKUP REQUIRED BEFORE EXECUTION (--confirm-backup is mandatory).
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import {
  LegacyInventoryMigration,
  MigrationValidationError,
} from '../src/services/LegacyInventoryMigration';

dotenv.config();

const prisma = new PrismaClient();

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function getArg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith('--')) {
    return process.argv[idx + 1];
  }
  return undefined;
}

function defaultTemplatePath() {
  return path.resolve(__dirname, '../data/legacy-inventory-allocation.template.json');
}

function defaultAllocationPath() {
  return path.resolve(__dirname, '../data/legacy-inventory-allocation.json');
}

function printPlanTable(
  rows: Array<{
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
    status: string;
    errors: string[];
  }>
) {
  console.log('');
  console.log(
    [
      'Pillow',
      'Legacy',
      'WH',
      'SR',
      'Pres',
      'AvailWH',
      'AvailSR',
      'Company',
      'Validation',
    ].join('\t')
  );
  for (const r of rows) {
    console.log(
      [
        `${r.pillowId}:${r.name}`,
        r.legacyStock,
        r.warehouse,
        r.showroom,
        r.presentation,
        r.availableWh,
        r.availableSr,
        r.companyPhysical,
        r.status === 'OK' ? 'OK' : `${r.status}${r.errors.length ? ` (${r.errors.join('; ')})` : ''}`,
      ].join('\t')
    );
  }
  console.log('');
}

async function main() {
  const migrator = new LegacyInventoryMigration(prisma);
  const doAudit =
    hasFlag('--audit') ||
    (!hasFlag('--dry-run') && !hasFlag('--execute') && !hasFlag('--generate-template'));
  const doTemplate = hasFlag('--generate-template');
  const doDryRun = hasFlag('--dry-run');
  const doExecute = hasFlag('--execute');
  const confirmBackup = hasFlag('--confirm-backup');

  if (doExecute && doDryRun) {
    throw new Error('Use either --dry-run or --execute, not both');
  }

  console.log('=== LEGACY INVENTORY MIGRATION TOOL ===');
  console.log('BACKUP REQUIRED BEFORE EXECUTION');
  console.log('');

  if (doAudit || doTemplate || doDryRun) {
    const audit = await migrator.auditAll();
    console.log('--- LIVE DATABASE ---');
    console.log(
      JSON.stringify(
        {
          pillowCount: audit.totals.pillowCount,
          stockSum: audit.totals.stockSum,
          historyCount: audit.totals.historyCount,
          locationCount: audit.locations.length,
          inventoryBalanceCount: audit.inventoryBalanceCount,
          stockMovementCount: audit.stockMovementCount,
          transferCount: audit.transferCount,
          locations: audit.locations,
          pillows: audit.pillows.map((p) => ({
            pillowId: p.pillowId,
            name: p.name,
            legacyStock: p.legacyStock,
            reconstructionStatus: p.reconstructionStatus,
            difference: p.difference,
            locationEvidence: p.locationEvidence,
            alreadyMigrated: p.alreadyMigrated,
            balanceConflict: p.balanceConflict,
          })),
        },
        null,
        2
      )
    );
    console.log('');

    const unknown = audit.pillows.filter((p) => p.locationEvidence === 'LOCATION_UNKNOWN');
    if (unknown.length) {
      console.log(
        `LOCATION_UNKNOWN for ${unknown.length}/${audit.pillows.length} pillows — DO NOT GUESS WH/SR split.`
      );
    }

    if (doTemplate || unknown.length || doAudit) {
      const template = migrator.generateTemplate(audit);
      const out = defaultTemplatePath();
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, JSON.stringify(template, null, 2), 'utf8');
      console.log(`Wrote/refreshed allocation template: ${out}`);
      console.log('Copy to legacy-inventory-allocation.json and fill verified quantities.');
      console.log('');
    }
  }

  if (doDryRun) {
    const allocationPath = path.resolve(getArg('--allocation') || defaultAllocationPath());
    console.log(`--- DRY RUN (allocation: ${allocationPath}) ---`);
    if (!fs.existsSync(allocationPath)) {
      console.log('Allocation file missing. Use --generate-template first, then fill values.');
      console.log('NO LEGACY STOCK MIGRATION EXECUTED — WAITING FOR VERIFIED LOCATION ALLOCATION');
      process.exitCode = 2;
      return;
    }

    try {
      const { plan } = await migrator.dryRun(allocationPath);
      printPlanTable(plan.rows);
      console.log(
        JSON.stringify(
          {
            needsOperatorAllocation: plan.needsOperatorAllocation,
            alreadyMigratedOnly: plan.alreadyMigratedOnly,
            canExecute: plan.canExecute,
            errors: plan.errors,
            expectedInventoryBalances: plan.rows
              .filter((r) => r.status === 'OK')
              .flatMap((r) => [
                {
                  pillowId: r.pillowId,
                  location: 'WH-MAIN',
                  physical: r.warehouse,
                  presentation: 0,
                  reserved: 0,
                  available: r.availableWh,
                },
                {
                  pillowId: r.pillowId,
                  location: 'SR-MAIN',
                  physical: r.showroom,
                  presentation: r.presentation,
                  reserved: 0,
                  available: r.availableSr,
                },
              ]),
            expectedStockMovements: plan.expectedMovements,
          },
          null,
          2
        )
      );
      if (plan.alreadyMigratedOnly) {
        console.log('');
        console.log('DRY RUN: ALREADY_MIGRATED — no further writes needed');
      } else if (plan.needsOperatorAllocation || !plan.canExecute) {
        console.log('');
        console.log('DRY RUN: migration NOT ready for --execute');
        console.log(`canExecute: ${plan.canExecute}`);
        console.log('NO LEGACY STOCK MIGRATION EXECUTED — WAITING FOR VERIFIED LOCATION ALLOCATION');
        process.exitCode = 2;
      } else {
        console.log('');
        console.log(`canExecute: true`);
        console.log('DRY RUN OK — still requires MySQL backup + --execute --confirm-backup');
      }
    } catch (e) {
      if (e instanceof MigrationValidationError) {
        console.error('DRY RUN FAILED:', e.message);
        process.exitCode = 2;
        return;
      }
      throw e;
    }
  }

  if (doExecute) {
    console.log('--- EXECUTE ---');
    console.log('BACKUP REQUIRED BEFORE EXECUTION');

    if (!confirmBackup) {
      console.error('');
      console.error('REFUSED: missing --confirm-backup');
      console.error(
        'Take a MySQL backup first, then re-run with: --execute --allocation <file> --confirm-backup'
      );
      process.exitCode = 2;
      return;
    }

    const allocationPath = path.resolve(getArg('--allocation') || defaultAllocationPath());
    if (!fs.existsSync(allocationPath)) {
      console.error('Allocation file missing — refuse execute');
      process.exitCode = 2;
      return;
    }

    // Pre-flight dry validation
    const { plan } = await migrator.dryRun(allocationPath);
    printPlanTable(plan.rows);
    if (plan.alreadyMigratedOnly) {
      console.log(JSON.stringify({ status: 'ALREADY_MIGRATED', canExecute: false }, null, 2));
      return;
    }
    if (!plan.canExecute) {
      console.error('REFUSED: dry-run canExecute=false — fix allocation before execute');
      console.error(JSON.stringify({ errors: plan.errors, canExecute: false }, null, 2));
      process.exitCode = 2;
      return;
    }

    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, orderBy: { id: 'asc' } });
    const result = await migrator.execute(allocationPath, { userId: admin?.id ?? null });
    console.log(JSON.stringify(result, null, 2));

    // Post-verify snapshot
    const audit = await migrator.auditAll();
    console.log('--- AFTER ---');
    console.log(
      JSON.stringify(
        {
          pillowCount: audit.totals.pillowCount,
          stockSum: audit.totals.stockSum,
          historyCount: audit.totals.historyCount,
          inventoryBalanceCount: audit.inventoryBalanceCount,
          stockMovementCount: audit.stockMovementCount,
          transferCount: audit.transferCount,
          pillows: audit.pillows.map((p) => ({
            pillowId: p.pillowId,
            name: p.name,
            legacyStock: p.legacyStock,
            alreadyMigrated: p.alreadyMigrated,
          })),
        },
        null,
        2
      )
    );
  }

  if (!doDryRun && !doExecute) {
    console.log(
      'Modes: --audit | --generate-template | --dry-run --allocation <file> | --execute --allocation <file> --confirm-backup'
    );
    console.log('Defaulted to audit above. --execute was NOT run.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
