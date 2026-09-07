/**
 * Post-cutover verification (TASK 15).
 * Safe to run anytime — read-only.
 *
 * Usage: npm run inventory:cutover:verify
 *
 * Expects inventoryMode=INVENTORY after real cutover.
 * During TASK 15 / LEGACY mode: reports NOT_CUTOVER (exit 2).
 */
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { getInventoryMode } from '../src/services/InventoryMode';
import { computeCompanyPhysicalStock } from '../src/services/PillowStockMirror';
import { computeAvailable } from '../src/utils/inventory-balance';
import { ReconciliationService } from '../src/services/ReconciliationService';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const mode = await getInventoryMode(prisma);
  const [
    balanceCount,
    movementCount,
    initialCount,
    pillowCount,
    negativeBalances,
    duplicateBalances,
  ] = await Promise.all([
    prisma.inventoryBalance.count(),
    prisma.stockMovement.count(),
    prisma.stockMovement.count({ where: { type: 'INITIAL' } }),
    prisma.pillow.count(),
    prisma.inventoryBalance.count({
      where: {
        OR: [{ physical: { lt: 0 } }, { presentation: { lt: 0 } }, { reserved: { lt: 0 } }],
      },
    }),
    prisma.$queryRaw<Array<{ c: bigint }>>`
      SELECT COUNT(*) AS c FROM (
        SELECT pillowId, locationId, COUNT(*) AS n
        FROM InventoryBalance
        GROUP BY pillowId, locationId
        HAVING n > 1
      ) t
    `,
  ]);

  console.log('=== CUTOVER VERIFY (read-only) ===');
  console.log(
    JSON.stringify(
      {
        inventoryMode: mode,
        balanceCount,
        movementCount,
        initialMovements: initialCount,
        pillowCount,
        negativeBalances,
        duplicateBalanceGroups: Number(duplicateBalances[0]?.c ?? 0),
      },
      null,
      2
    )
  );

  if (mode !== 'INVENTORY') {
    console.log('NOT_CUTOVER — inventoryMode is still LEGACY. Verify after opening execute.');
    process.exitCode = 2;
    return;
  }

  const issues: string[] = [];
  if (balanceCount === 0) issues.push('No InventoryBalance rows');
  if (initialCount === 0) issues.push('No INITIAL StockMovement rows');
  if (negativeBalances > 0) issues.push('Negative balance quantities found');
  if (Number(duplicateBalances[0]?.c ?? 0) > 0) issues.push('Duplicate balances');

  const pillows = await prisma.pillow.findMany({ select: { id: true, name: true, stock: true } });
  const wh = await prisma.location.findFirst({ where: { code: 'WH-MAIN' } });
  const sr = await prisma.location.findFirst({ where: { code: 'SR-MAIN' } });

  for (const p of pillows) {
    const expected = await prisma.$transaction((tx) => computeCompanyPhysicalStock(tx, p.id));
    if (p.stock !== expected) {
      issues.push(`Mirror mismatch pillow ${p.id}: stock=${p.stock} expected=${expected}`);
    }
  }

  if (wh && sr) {
    for (const p of pillows) {
      const bals = await prisma.inventoryBalance.findMany({ where: { pillowId: p.id } });
      for (const b of bals) {
        if (b.presentation > b.physical) {
          issues.push(`presentation>physical pillow ${p.id} loc ${b.locationId}`);
        }
        const avail = computeAvailable(b.physical, b.presentation, b.reserved);
        if (avail < 0) issues.push(`negative available pillow ${p.id} loc ${b.locationId}`);
      }
    }
  }

  const recon = await new ReconciliationService(prisma).reconcileInventory();
  console.log('reconciliation', { status: recon.status, issueCount: recon.issues?.length ?? 0 });

  if (issues.length || recon.status !== 'OK') {
    console.log('VERIFY FAILED', issues);
    process.exitCode = 1;
    return;
  }

  console.log('VERIFY PASS');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
