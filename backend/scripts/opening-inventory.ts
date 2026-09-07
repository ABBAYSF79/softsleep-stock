/**
 * Clean cutover opening inventory (TASK 9).
 *
 * Usage:
 *   npm run inventory:opening -- --generate-template
 *   npm run inventory:opening -- --dry-run --file ./data/opening-inventory.json
 *   npm run inventory:opening -- --execute --file ./data/opening-inventory.json --confirm-backup
 *
 * Physical count at cutover is authoritative.
 * Do NOT force equality with old Pillow.stock.
 * BACKUP REQUIRED BEFORE EXECUTION.
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import {
  OpeningInventoryError,
  OpeningInventoryService,
} from '../src/services/OpeningInventoryService';
import { getInventoryMode } from '../src/services/InventoryMode';

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

function defaultFilePath() {
  return path.resolve(__dirname, '../data/opening-inventory.json');
}

function defaultTemplatePath() {
  return path.resolve(__dirname, '../data/opening-inventory.template.json');
}

async function printLiveSnapshot() {
  const pillows = await prisma.pillow.findMany({
    orderBy: { id: 'asc' },
    select: { id: true, name: true, stock: true },
  });
  const mode = await getInventoryMode(prisma);
  const snapshot = {
    inventoryMode: mode,
    pillowCount: pillows.length,
    stockSum: pillows.reduce((s, p) => s + p.stock, 0),
    historyCount: await prisma.pillowStockHistory.count(),
    locationCount: await prisma.location.count(),
    balanceCount: await prisma.inventoryBalance.count(),
    movementCount: await prisma.stockMovement.count(),
    transferCount: await prisma.transfer.count(),
    orderCount: await prisma.order.count(),
    pillowOrderCount: await prisma.pillowOrder.count(),
    pillows,
  };
  console.log('--- LIVE DATABASE ---');
  console.log(JSON.stringify(snapshot, null, 2));
  console.log('');
  return snapshot;
}

function printPlanTable(
  rows: Array<{
    pillowId: number;
    name: string;
    oldStock: number;
    warehousePhysical: number;
    showroomPhysical: number;
    showroomPresentation: number;
    newCompanyPhysical: number;
    differenceVsOld: number;
    availableWh: number;
    availableSr: number;
    status: string;
  }>
) {
  console.log('');
  console.log(
    ['Pillow', 'OldStock', 'WH', 'SR', 'Pres', 'Company', 'Avail(company-pres)', 'DiffVsLegacy', 'Status'].join(
      '\t'
    )
  );
  for (const r of rows) {
    const companyAvail = r.newCompanyPhysical - r.showroomPresentation;
    console.log(
      [
        `${r.pillowId}:${r.name}`,
        r.oldStock,
        r.warehousePhysical,
        r.showroomPhysical,
        r.showroomPresentation,
        r.newCompanyPhysical,
        companyAvail,
        r.differenceVsOld,
        r.status,
      ].join('\t')
    );
  }
  console.log('');
  console.log('Company physical = WH + SR. Available illustration = company − showroom presentation (reserved=0 at opening).');
  console.log('DiffVsLegacy is informational only — never blocks cutover.');
  console.log('');
}

async function main() {
  const service = new OpeningInventoryService(prisma);
  const doTemplate = hasFlag('--generate-template');
  const doDryRun = hasFlag('--dry-run');
  const doExecute = hasFlag('--execute');
  const confirmBackup = hasFlag('--confirm-backup');

  if (doExecute && doDryRun) {
    throw new Error('Use either --dry-run or --execute, not both');
  }

  console.log('=== CLEAN CUTOVER OPENING INVENTORY ===');
  console.log('BACKUP REQUIRED BEFORE EXECUTION');
  console.log('');

  await printLiveSnapshot();

  if (doTemplate || (!doDryRun && !doExecute)) {
    const template = await service.generateTemplateFromDb();
    const out = defaultTemplatePath();
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(template, null, 2), 'utf8');
    console.log(`Wrote template: ${out}`);
    console.log('Copy to opening-inventory.json and fill verified physical counts.');
    console.log('');
  }

  if (!doDryRun && !doExecute) {
    console.log(
      'Modes: --generate-template | --dry-run --file <path> | --execute --file <path> --confirm-backup'
    );
    return;
  }

  const filePath = path.resolve(getArg('--file') || defaultFilePath());

  if (doDryRun) {
    console.log(`--- DRY RUN (file: ${filePath}) ---`);
    if (!fs.existsSync(filePath)) {
      console.log('Opening inventory file missing.');
      console.log('NO OPENING CUTOVER EXECUTED — WAITING FOR PHYSICAL COUNT FILE');
      process.exitCode = 2;
      return;
    }
    try {
      const { plan, fileHash } = await service.dryRun(filePath);
      printPlanTable(plan.rows);
      console.log(
        JSON.stringify(
          {
            alreadyCutover: plan.alreadyCutover,
            canExecute: plan.canExecute,
            errors: plan.errors,
            cutoverAt: plan.cutoverAt.toISOString(),
            fileHash,
            plannedBalances: plan.plannedBalances,
            plannedMovements: plan.plannedMovements,
            plannedPillowStockUpdates: plan.rows
              .filter((r) => r.status === 'OK')
              .map((r) => ({
                pillowId: r.pillowId,
                oldStock: r.oldStock,
                newStock: r.newCompanyPhysical,
                differenceVsOld: r.differenceVsOld,
              })),
          },
          null,
          2
        )
      );
      if (plan.alreadyCutover) {
        console.log('DRY RUN: ALREADY_CUTOVER');
      } else if (!plan.canExecute) {
        console.log(`canExecute: false`);
        console.log('NO OPENING CUTOVER EXECUTED — FIX OPENING FILE');
        process.exitCode = 2;
      } else {
        console.log('canExecute: true');
        console.log('DRY RUN OK — requires backup + --execute --confirm-backup');
      }
    } catch (e) {
      if (e instanceof OpeningInventoryError) {
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
      console.error('REFUSED: missing --confirm-backup');
      process.exitCode = 2;
      return;
    }
    if (!fs.existsSync(filePath)) {
      console.error('Opening inventory file missing — refuse execute');
      process.exitCode = 2;
      return;
    }

    const { plan } = await service.dryRun(filePath);
    printPlanTable(plan.rows);
    if (plan.alreadyCutover) {
      console.log(JSON.stringify({ status: 'ALREADY_CUTOVER' }, null, 2));
      return;
    }
    if (!plan.canExecute) {
      console.error('REFUSED: canExecute=false');
      console.error(JSON.stringify({ errors: plan.errors }, null, 2));
      process.exitCode = 2;
      return;
    }

    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, orderBy: { id: 'asc' } });
    const result = await service.execute(filePath, { userId: admin?.id ?? null });
    console.log(JSON.stringify(result, null, 2));
    await printLiveSnapshot();
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
