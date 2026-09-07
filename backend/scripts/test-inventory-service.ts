/**
 * TASK 4 InventoryService tests (TASK 7 safety: isolated temp pillow).
 * Cleans up all rows it creates. Does not leave fake inventory behind.
 * Does not modify production Pillow.stock totals.
 *
 * Usage: npx ts-node scripts/test-inventory-service.ts
 */
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { InventoryError, InventoryService } from '../src/services/InventoryService';

dotenv.config();

const prisma = new PrismaClient();
const inventory = new InventoryService(prisma);

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
}

async function snapshotProduction() {
  const pillowCount = await prisma.pillow.count();
  const stockSum = (await prisma.pillow.aggregate({ _sum: { stock: true } }))._sum.stock ?? 0;
  const historyCount = await prisma.pillowStockHistory.count();
  const locationCount = await prisma.location.count();
  const balanceCount = await prisma.inventoryBalance.count();
  const movementCount = await prisma.stockMovement.count();
  return { pillowCount, stockSum, historyCount, locationCount, balanceCount, movementCount };
}

async function wipePillow(pillowId: number) {
  await prisma.stockMovement.deleteMany({ where: { pillowId } });
  await prisma.inventoryBalance.deleteMany({ where: { pillowId } });
}

async function main() {
  console.log('Running TASK 4 InventoryService checks…');

  const before = await snapshotProduction();
  const location = await prisma.location.findFirst({ where: { code: 'SR-MAIN' } });
  assert(location, 'need SR-MAIN');
  assert(location.allowsPresentation, 'SR-MAIN allows presentation');
  const locationId = location.id;

  const temp = await prisma.pillow.create({
    data: { name: `TASK4-ISO-${Date.now()}`, price: 1, stock: 0 },
  });
  const pillowId = temp.id;

  try {
    // --- Test 1: Increase 0→10 ---
    {
      const r = await inventory.increasePhysical({
        pillowId,
        locationId,
        quantity: 10,
        type: 'SUPPLY',
        reason: 'TASK4 test increase',
      });
      assert(r.balance.physical === 10, 'physical 10');
      assert(r.balance.available === 10, 'available 10');
      const moves = await prisma.stockMovement.count({ where: { pillowId, locationId } });
      assert(moves === 1, 'exactly one movement after increase');
      console.log('Test 1 PASS — increase 0→10');
    }

    // --- Test 2: Decrease 10→6 ---
    {
      const r = await inventory.decreasePhysical({
        pillowId,
        locationId,
        quantity: 4,
        type: 'SALE',
        reason: 'TASK4 test decrease',
      });
      assert(r.balance.physical === 6, 'physical 6');
      assert(r.balance.available === 6, 'available 6');
      const moves = await prisma.stockMovement.count({ where: { pillowId, locationId } });
      assert(moves === 2, 'two movements after decrease');
      console.log('Test 2 PASS — decrease 10→6');
    }

    // Reset to 10/2/3 for negative available test
    await wipePillow(pillowId);
    await inventory.increasePhysical({
      pillowId,
      locationId,
      quantity: 10,
      type: 'SUPPLY',
      reason: 'setup 10',
      forceSyncMirror: true,
    });
    await inventory.setPresentation({
      pillowId,
      locationId,
      presentation: 2,
      reason: 'setup presentation 2',
    });
    await inventory.setReserved({
      pillowId,
      locationId,
      reserved: 3,
      reason: 'setup reserved 3',
    });

    // --- Test 3: prevent decrease beyond available ---
    {
      const beforeBal = await inventory.getBalance(pillowId, locationId);
      assert(beforeBal?.physical === 10 && beforeBal.presentation === 2 && beforeBal.reserved === 3, 'setup 10/2/3');
      assert(beforeBal!.available === 5, 'available 5');
      const movesBefore = await prisma.stockMovement.count({ where: { pillowId, locationId } });

      let failed = false;
      try {
        await inventory.decreasePhysical({
          pillowId,
          locationId,
          quantity: 6,
          type: 'SALE',
          reason: 'should fail',
        });
      } catch (e) {
        failed = e instanceof InventoryError && e.code === 'INSUFFICIENT_AVAILABLE_STOCK';
        if (!failed) throw e;
      }
      assert(failed, 'decrease 6 must fail');
      const afterBal = await inventory.getBalance(pillowId, locationId);
      assert(afterBal?.physical === 10 && afterBal.presentation === 2 && afterBal.reserved === 3, 'unchanged 10/2/3');
      const movesAfter = await prisma.stockMovement.count({ where: { pillowId, locationId } });
      assert(movesAfter === movesBefore, 'no movement on failed decrease');
      console.log('Test 3 PASS — prevent negative available');
    }

    // --- Test 4: presentation limit ---
    {
      await wipePillow(pillowId);
      await inventory.increasePhysical({
        pillowId,
        locationId,
        quantity: 10,
        type: 'SUPPLY',
        reason: 'setup',
        forceSyncMirror: true,
      });
      await inventory.setReserved({
        pillowId,
        locationId,
        reserved: 3,
        reason: 'setup reserved',
      });
      const movesBefore = await prisma.stockMovement.count({ where: { pillowId, locationId } });

      let failed = false;
      try {
        await inventory.setPresentation({
          pillowId,
          locationId,
          presentation: 8,
          reason: 'should fail',
        });
      } catch (e) {
        failed = e instanceof InventoryError && e.code === 'PRESENTATION_EXCEEDS_AVAILABLE_PHYSICAL';
        if (!failed) throw e;
      }
      assert(failed, 'presentation 8 must fail when max is 7');
      const afterBal = await inventory.getBalance(pillowId, locationId);
      assert(afterBal?.physical === 10 && afterBal.presentation === 0 && afterBal.reserved === 3, 'unchanged');
      const movesAfter = await prisma.stockMovement.count({ where: { pillowId, locationId } });
      assert(movesAfter === movesBefore, 'no movement on failed presentation');
      console.log('Test 4 PASS — presentation limit');
    }

    // --- Test 5: reservation limit ---
    {
      await wipePillow(pillowId);
      await inventory.increasePhysical({
        pillowId,
        locationId,
        quantity: 10,
        type: 'SUPPLY',
        reason: 'setup',
        forceSyncMirror: true,
      });
      await inventory.setPresentation({
        pillowId,
        locationId,
        presentation: 2,
        reason: 'setup presentation',
      });

      const ok = await inventory.setReserved({
        pillowId,
        locationId,
        reserved: 8,
        reason: 'reserve all available',
      });
      assert(ok.balance.reserved === 8, 'reserved 8');
      assert(ok.balance.available === 0, 'available 0');

      let failed = false;
      try {
        await inventory.setReserved({
          pillowId,
          locationId,
          reserved: 9,
          reason: 'should fail',
        });
      } catch (e) {
        failed = e instanceof InventoryError && e.code === 'RESERVED_EXCEEDS_AVAILABLE';
        if (!failed) throw e;
      }
      assert(failed, 'reserved 9 must fail');
      const afterBal = await inventory.getBalance(pillowId, locationId);
      assert(afterBal?.reserved === 8 && afterBal.available === 0, 'still reserved 8');
      console.log('Test 5 PASS — reservation limit');
    }

    // --- Test 6: atomic rollback ---
    {
      await wipePillow(pillowId);
      await inventory.increasePhysical({
        pillowId,
        locationId,
        quantity: 10,
        type: 'SUPPLY',
        reason: 'setup',
        forceSyncMirror: true,
      });
      const beforeBal = await inventory.getBalance(pillowId, locationId);
      const movesBefore = await prisma.stockMovement.count({ where: { pillowId, locationId } });

      let rolledBack = false;
      try {
        await inventory.increasePhysical({
          pillowId,
          locationId,
          quantity: 5,
          type: 'SUPPLY',
          reason: 'force rollback',
          __testThrowAfterBalanceUpdate: new Error('FORCED_TEST_ROLLBACK'),
        });
      } catch (e) {
        rolledBack = e instanceof Error && e.message === 'FORCED_TEST_ROLLBACK';
        if (!rolledBack) throw e;
      }
      assert(rolledBack, 'forced throw happened');
      const afterBal = await inventory.getBalance(pillowId, locationId);
      assert(afterBal?.physical === beforeBal?.physical, 'balance rolled back');
      const movesAfter = await prisma.stockMovement.count({ where: { pillowId, locationId } });
      assert(movesAfter === movesBefore, 'no movement after rollback');
      console.log('Test 6 PASS — atomic rollback');
    }

    // --- Test 7: balance/movement ledger endpoints remain read-only ---
    {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const inventoryRouter = require('../src/routes/inventory').default;
      const stack = inventoryRouter.stack || [];
      const ledgerMutating = stack.filter((layer: any) => {
        const path = String(layer.route?.path || '');
        const methods = layer.route?.methods || {};
        const isLedger =
          path === '/balances' ||
          path === '/movements' ||
          path.startsWith('/balances') ||
          path.startsWith('/movements');
        return isLedger && (methods.post || methods.put || methods.patch || methods.delete);
      });
      assert(ledgerMutating.length === 0, 'balance/movement routes must be read-only');
      console.log('Test 7 PASS — balance/movement routes read-only');
    }

    // --- Test 8: concurrent mutations on existing balance ---
    {
      await wipePillow(pillowId);
      await inventory.increasePhysical({
        pillowId,
        locationId,
        quantity: 10,
        type: 'SUPPLY',
        reason: 'base',
        forceSyncMirror: true,
      });
      await Promise.all([
        inventory.increasePhysical({
          pillowId,
          locationId,
          quantity: 3,
          type: 'SUPPLY',
          reason: 'concurrent A',
        }),
        inventory.increasePhysical({
          pillowId,
          locationId,
          quantity: 4,
          type: 'SUPPLY',
          reason: 'concurrent B',
        }),
      ]);
      const balances = await prisma.inventoryBalance.findMany({ where: { pillowId, locationId } });
      assert(balances.length === 1, 'exactly one balance row');
      assert(balances[0]!.physical === 17, 'physical 10+3+4=17 under concurrency');
      const moves = await prisma.stockMovement.count({ where: { pillowId, locationId } });
      assert(moves === 3, 'exactly three movements');
      console.log('Test 8 PASS — concurrent mutations on existing balance');
    }

    // --- Test concurrency +5 +7 from 10 → 22 ---
    {
      await wipePillow(pillowId);
      await inventory.increasePhysical({
        pillowId,
        locationId,
        quantity: 10,
        type: 'SUPPLY',
        reason: 'base 10',
        forceSyncMirror: true,
      });
      await Promise.all([
        inventory.increasePhysical({
          pillowId,
          locationId,
          quantity: 5,
          type: 'SUPPLY',
          reason: 'concurrent +5',
        }),
        inventory.increasePhysical({
          pillowId,
          locationId,
          quantity: 7,
          type: 'SUPPLY',
          reason: 'concurrent +7',
        }),
      ]);
      const bal = await inventory.getBalance(pillowId, locationId);
      assert(bal?.physical === 22, `expected 22 got ${bal?.physical}`);
      const moves = await prisma.stockMovement.count({ where: { pillowId, locationId } });
      assert(moves === 3, 'base + two concurrent = 3 movements');
      console.log('Test concurrency PASS — 10+5+7=22');
    }
  } finally {
    await wipePillow(pillowId);
    await prisma.pillow.delete({ where: { id: pillowId } }).catch(() => undefined);
  }

  const after = await snapshotProduction();
  assert(after.stockSum === before.stockSum, 'SUM(Pillow.stock) unchanged');
  assert(after.historyCount === before.historyCount, 'PillowStockHistory unchanged');
  assert(after.pillowCount === before.pillowCount, 'Pillow count unchanged');
  assert(after.locationCount === before.locationCount, 'Location count unchanged');
  assert(after.balanceCount === before.balanceCount, 'InventoryBalance count restored');
  assert(after.movementCount === before.movementCount, 'StockMovement count restored');

  console.log('Test 9 PASS — production legacy stock untouched after cleanup');
  console.log(JSON.stringify({ before, after }));
  console.log('ALL TASK 4 InventoryService CHECKS PASSED');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
