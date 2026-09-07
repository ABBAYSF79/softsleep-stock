/**
 * TASK 13 — Inventory operations tests (isolated temp data only).
 * Does not modify production stock / balances / movements permanently.
 *
 * Usage: npm run test:inventory-operations
 */
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { InventoryError, InventoryService } from '../src/services/InventoryService';
import { AccessoryStockWriter, AccessoryStockWriterError } from '../src/services/AccessoryStockWriter';
import { ReconciliationService } from '../src/services/ReconciliationService';
import { CUTOVER_SETTINGS_ID } from '../src/services/InventoryMode';

dotenv.config();

const prisma = new PrismaClient();
const inventory = new InventoryService(prisma);
const writer = new AccessoryStockWriter(prisma);
const reconciliation = new ReconciliationService(prisma);

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
}

async function setInventoryMode(mode: 'LEGACY' | 'INVENTORY') {
  await prisma.inventoryCutoverSettings.upsert({
    where: { id: CUTOVER_SETTINGS_ID },
    create: { id: CUTOVER_SETTINGS_ID, mode },
    update: { mode },
  });
}

async function snapshot() {
  return {
    stockSum: (await prisma.pillow.aggregate({ _sum: { stock: true } }))._sum.stock ?? 0,
    balanceCount: await prisma.inventoryBalance.count(),
    movementCount: await prisma.stockMovement.count(),
    historyCount: await prisma.pillowStockHistory.count(),
    pillowCount: await prisma.pillow.count(),
    reservationCount: await prisma.reservation.count(),
    transferCount: await prisma.transfer.count(),
    mode: (await prisma.inventoryCutoverSettings.findUnique({ where: { id: CUTOVER_SETTINGS_ID } }))
      ?.mode,
  };
}

async function destroyPillow(pillowId: number) {
  await prisma.stockMovement.deleteMany({ where: { pillowId } });
  await prisma.inventoryBalance.deleteMany({ where: { pillowId } });
  await prisma.pillowStockHistory.deleteMany({ where: { pillowId } });
  await prisma.activity.deleteMany({
    where: {
      OR: [
        { description: { contains: `TASK13-${pillowId}` } },
        { details: { contains: `TASK13-${pillowId}` } },
      ],
    },
  });
  await prisma.pillow.delete({ where: { id: pillowId } }).catch(() => undefined);
}

async function createTempPillow(stock = 0) {
  return prisma.pillow.create({
    data: {
      name: `TASK13-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      price: 10,
      stock,
    },
  });
}

async function main() {
  console.log('Running TASK 13 inventory operations checks…');
  const before = await snapshot();
  console.log('BEFORE', before);
  assert(before.mode === 'LEGACY' || before.mode == null, 'production must start LEGACY');

  const wh = await prisma.location.findFirst({ where: { code: 'WH-MAIN', active: true } });
  const sr = await prisma.location.findFirst({ where: { code: 'SR-MAIN', active: true } });
  assert(wh && sr, 'need WH-MAIN and SR-MAIN');
  assert(sr!.allowsPresentation, 'showroom allows presentation');
  assert(!wh!.allowsPresentation, 'warehouse disallows presentation');

  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  assert(admin, 'need admin');
  const userId = admin!.id;
  const createdIds: number[] = [];

  try {
    await setInventoryMode('INVENTORY');

    // --- Supply 1–8 ---
    {
      const pillow = await createTempPillow(0);
      createdIds.push(pillow.id);

      const s1 = await inventory.supply({
        pillowId: pillow.id,
        locationId: wh!.id,
        quantity: 20,
        reason: `TASK13-${pillow.id} wh supply`,
        userId,
      });
      assert(s1.balance.physical === 20, 'wh physical 20');
      assert(s1.balance.available === 20, 'wh available 20');

      const s2 = await inventory.supply({
        pillowId: pillow.id,
        locationId: sr!.id,
        quantity: 10,
        reason: `TASK13-${pillow.id} sr supply`,
        userId,
      });
      assert(s2.balance.physical === 10, 'sr physical 10');
      assert(s2.balance.available === 10, 'sr available 10');

      const supplyMoves = await prisma.stockMovement.count({
        where: { pillowId: pillow.id, type: 'SUPPLY' },
      });
      assert(supplyMoves === 2, 'two SUPPLY movements');

      let locFail = false;
      try {
        await writer.supply({
          pillowId: pillow.id,
          quantity: 1,
          reason: 'no loc',
          userId,
        });
      } catch (e) {
        locFail =
          e instanceof AccessoryStockWriterError && e.code === 'INVENTORY_LOCATION_REQUIRED';
        if (!locFail) throw e;
      }
      assert(locFail, 'location required');

      let qtyFail = false;
      try {
        await inventory.supply({
          pillowId: pillow.id,
          locationId: wh!.id,
          quantity: 0,
          reason: 'bad',
          userId,
        });
      } catch (e) {
        qtyFail = e instanceof InventoryError && e.code === 'INVALID_QUANTITY';
        if (!qtyFail) throw e;
      }
      assert(qtyFail, 'invalid quantity rejected');

      const beforeRollback = await inventory.getBalance(pillow.id, wh!.id);
      let rolled = false;
      try {
        await inventory.increasePhysical({
          pillowId: pillow.id,
          locationId: wh!.id,
          quantity: 5,
          type: 'SUPPLY',
          reason: 'rollback test',
          forceSyncMirror: true,
          __testThrowAfterBalanceUpdate: new Error('TASK13_ROLLBACK'),
        });
      } catch (e) {
        rolled = e instanceof Error && e.message === 'TASK13_ROLLBACK';
        if (!rolled) throw e;
      }
      assert(rolled, 'rollback thrown');
      const afterRollback = await inventory.getBalance(pillow.id, wh!.id);
      assert(afterRollback?.physical === beforeRollback?.physical, 'rollback restored physical');
      console.log('Tests 1–8 PASS — supply');
    }

    // --- Adjustment 9–15 ---
    {
      const pillow = await createTempPillow(0);
      createdIds.push(pillow.id);
      await inventory.supply({
        pillowId: pillow.id,
        locationId: sr!.id,
        quantity: 20,
        reason: `TASK13-${pillow.id} base`,
        userId,
      });
      await inventory.setPresentation({
        pillowId: pillow.id,
        locationId: sr!.id,
        presentation: 5,
        userId,
      });
      await inventory.setReserved({
        pillowId: pillow.id,
        locationId: sr!.id,
        reserved: 3,
        userId,
      });

      const pos = await inventory.adjustPhysical({
        pillowId: pillow.id,
        locationId: sr!.id,
        delta: 2,
        reason: `TASK13-${pillow.id} +2`,
        userId,
      });
      assert(pos.balance.physical === 22, 'physical 22');

      const neg = await inventory.adjustPhysical({
        pillowId: pillow.id,
        locationId: sr!.id,
        delta: -2,
        reason: `TASK13-${pillow.id} -2`,
        userId,
      });
      assert(neg.balance.physical === 20, 'physical 20');

      const adjMoves = await prisma.stockMovement.count({
        where: { pillowId: pillow.id, type: 'ADJUSTMENT', reason: { contains: 'TASK13' } },
      });
      assert(adjMoves >= 2, 'ADJUSTMENT movements');

      let negPhys = false;
      try {
        await inventory.adjustPhysical({
          pillowId: pillow.id,
          locationId: sr!.id,
          delta: -100,
          reason: 'too much',
          userId,
        });
      } catch (e) {
        negPhys = e instanceof InventoryError && e.code === 'NEGATIVE_PHYSICAL';
        if (!negPhys) throw e;
      }
      assert(negPhys, 'negative physical rejected');

      let presInv = false;
      try {
        await inventory.adjustPhysical({
          pillowId: pillow.id,
          locationId: sr!.id,
          delta: -16,
          reason: 'would break presentation',
          userId,
        });
      } catch (e) {
        presInv =
          e instanceof InventoryError &&
          (e.code === 'PRESENTATION_EXCEEDS_PHYSICAL' || e.code === 'RESERVED_EXCEEDS_AVAILABLE');
        if (!presInv) throw e;
      }
      assert(presInv, 'presentation/reserved invariant preserved');

      let reasonFail = false;
      try {
        await inventory.adjustPhysical({
          pillowId: pillow.id,
          locationId: sr!.id,
          delta: 1,
          reason: '   ',
          userId,
        });
      } catch (e) {
        reasonFail = e instanceof InventoryError && e.code === 'REASON_REQUIRED';
        if (!reasonFail) throw e;
      }
      assert(reasonFail, 'reason required');
      console.log('Tests 9–15 PASS — adjustment');
    }

    // --- Presentation 16–22 ---
    {
      const pillow = await createTempPillow(0);
      createdIds.push(pillow.id);
      await inventory.supply({
        pillowId: pillow.id,
        locationId: sr!.id,
        quantity: 10,
        reason: `TASK13-${pillow.id} sr`,
        userId,
      });
      const mirrorBefore = (await prisma.pillow.findUnique({ where: { id: pillow.id } }))!.stock;

      const p = await inventory.setPresentation({
        pillowId: pillow.id,
        locationId: sr!.id,
        presentation: 3,
        userId,
      });
      assert(p.balance.presentation === 3, 'presentation 3');
      assert(p.balance.physical === 10, 'physical unchanged');
      assert(p.balance.available === 7, 'available 7');

      const move = await prisma.stockMovement.findFirst({
        where: { id: p.movementId },
      });
      assert(move?.type === 'ADJUSTMENT', 'presentation uses ADJUSTMENT');
      assert(move?.reason === 'PRESENTATION_ALLOCATION' || move?.previousPresentation === 0, 'audit');

      const mirrorAfter = (await prisma.pillow.findUnique({ where: { id: pillow.id } }))!.stock;
      assert(mirrorAfter === mirrorBefore, 'presentation does not change Pillow.stock');

      let whPres = false;
      try {
        await inventory.supply({
          pillowId: pillow.id,
          locationId: wh!.id,
          quantity: 5,
          reason: `TASK13-${pillow.id} wh`,
          userId,
        });
        await inventory.setPresentation({
          pillowId: pillow.id,
          locationId: wh!.id,
          presentation: 1,
          userId,
        });
      } catch (e) {
        whPres = e instanceof InventoryError && e.code === 'PRESENTATION_NOT_ALLOWED';
        if (!whPres) throw e;
      }
      assert(whPres, 'warehouse presentation rejected');

      let over = false;
      try {
        await inventory.setPresentation({
          pillowId: pillow.id,
          locationId: sr!.id,
          presentation: 99,
          userId,
        });
      } catch (e) {
        over = e instanceof InventoryError && e.code === 'PRESENTATION_EXCEEDS_AVAILABLE_PHYSICAL';
        if (!over) throw e;
      }
      assert(over, 'presentation > physical rejected');

      let neg = false;
      try {
        await inventory.setPresentation({
          pillowId: pillow.id,
          locationId: sr!.id,
          presentation: -1,
          userId,
        });
      } catch (e) {
        neg = e instanceof InventoryError && e.code === 'INVALID_QUANTITY';
        if (!neg) throw e;
      }
      assert(neg, 'negative presentation rejected');
      console.log('Tests 16–22 PASS — presentation');
    }

    // --- Concurrency 23–25 ---
    {
      const pillow = await createTempPillow(0);
      createdIds.push(pillow.id);
      await inventory.supply({
        pillowId: pillow.id,
        locationId: wh!.id,
        quantity: 10,
        reason: `TASK13-${pillow.id} conc`,
        userId,
      });

      await Promise.all([
        inventory.supply({
          pillowId: pillow.id,
          locationId: wh!.id,
          quantity: 3,
          reason: 'c1',
          userId,
        }),
        inventory.supply({
          pillowId: pillow.id,
          locationId: wh!.id,
          quantity: 4,
          reason: 'c2',
          userId,
        }),
      ]);
      let bal = await inventory.getBalance(pillow.id, wh!.id);
      assert(bal?.physical === 17, 'concurrent supply 17');

      await Promise.all([
        inventory.adjustPhysical({
          pillowId: pillow.id,
          locationId: wh!.id,
          delta: 2,
          reason: 'a1',
          userId,
        }),
        inventory.adjustPhysical({
          pillowId: pillow.id,
          locationId: wh!.id,
          delta: -1,
          reason: 'a2',
          userId,
        }),
      ]);
      bal = await inventory.getBalance(pillow.id, wh!.id);
      assert(bal?.physical === 18, 'concurrent adjustment 18');

      await inventory.supply({
        pillowId: pillow.id,
        locationId: sr!.id,
        quantity: 10,
        reason: 'sr conc',
        userId,
      });
      await Promise.all([
        inventory.setPresentation({
          pillowId: pillow.id,
          locationId: sr!.id,
          presentation: 2,
          userId,
        }),
        inventory.setPresentation({
          pillowId: pillow.id,
          locationId: sr!.id,
          presentation: 4,
          userId,
        }),
      ]);
      const srBal = await inventory.getBalance(pillow.id, sr!.id);
      assert(srBal?.presentation === 2 || srBal?.presentation === 4, 'one presentation wins');
      assert(srBal!.presentation <= srBal!.physical, 'invariant ok');
      console.log('Tests 23–25 PASS — concurrency');
    }

    // --- Mirror 26–28 ---
    {
      const pillow = await createTempPillow(0);
      createdIds.push(pillow.id);
      await inventory.supply({
        pillowId: pillow.id,
        locationId: wh!.id,
        quantity: 5,
        reason: `TASK13-${pillow.id} m`,
        userId,
      });
      assert((await prisma.pillow.findUnique({ where: { id: pillow.id } }))!.stock === 5, 'mirror 5');
      await inventory.adjustPhysical({
        pillowId: pillow.id,
        locationId: wh!.id,
        delta: 2,
        reason: 'm adj',
        userId,
      });
      assert((await prisma.pillow.findUnique({ where: { id: pillow.id } }))!.stock === 7, 'mirror 7');
      await inventory.supply({
        pillowId: pillow.id,
        locationId: sr!.id,
        quantity: 4,
        reason: 'm sr',
        userId,
      });
      const beforePres = (await prisma.pillow.findUnique({ where: { id: pillow.id } }))!.stock;
      await inventory.setPresentation({
        pillowId: pillow.id,
        locationId: sr!.id,
        presentation: 2,
        userId,
      });
      assert(
        (await prisma.pillow.findUnique({ where: { id: pillow.id } }))!.stock === beforePres,
        'presentation no mirror change'
      );
      console.log('Tests 26–28 PASS — mirror');
    }

    // --- Legacy 29–30 ---
    {
      await setInventoryMode('LEGACY');
      const pillow = await createTempPillow(10);
      createdIds.push(pillow.id);
      const s = await writer.supply({
        pillowId: pillow.id,
        quantity: 5,
        reason: `TASK13-${pillow.id} leg supply`,
        userId,
      });
      assert(s.path === 'LEGACY', 'legacy supply');
      assert(s.pillow.stock === 15, 'legacy stock 15');
      const a = await writer.adjust({
        pillowId: pillow.id,
        delta: -3,
        reason: `TASK13-${pillow.id} leg adj`,
        userId,
      });
      assert(a.path === 'LEGACY', 'legacy adjust');
      assert(a.pillow.stock === 12, 'legacy stock 12');
      assert((await prisma.inventoryBalance.count({ where: { pillowId: pillow.id } })) === 0, 'no inv');
      await setInventoryMode('INVENTORY');
      console.log('Tests 29–30 PASS — legacy');
    }

    // --- Reconciliation 31–33 ---
    {
      const healthy = await reconciliation.reconcileInventory();
      // May have mismatches from orphaned test data elsewhere — filter to our pillows only for artificial check
      const pillow = await createTempPillow(0);
      createdIds.push(pillow.id);
      await inventory.supply({
        pillowId: pillow.id,
        locationId: wh!.id,
        quantity: 8,
        reason: `TASK13-${pillow.id} recon`,
        userId,
      });

      const beforeCounts = {
        bal: await prisma.inventoryBalance.count(),
        mov: await prisma.stockMovement.count(),
        stock: (await prisma.pillow.findUnique({ where: { id: pillow.id } }))!.stock,
      };

      // Artificial mirror mismatch
      await prisma.pillow.update({ where: { id: pillow.id }, data: { stock: 999 } });
      const bad = await reconciliation.reconcileInventory();
      assert(
        bad.mismatches.some(
          (m) => m.code === 'PHYSICAL_MIRROR_MISMATCH' && m.pillowId === pillow.id
        ),
        'detects mirror mismatch'
      );

      const afterCounts = {
        bal: await prisma.inventoryBalance.count(),
        mov: await prisma.stockMovement.count(),
        stock: (await prisma.pillow.findUnique({ where: { id: pillow.id } }))!.stock,
      };
      assert(afterCounts.bal === beforeCounts.bal, 'recon does not mutate balances');
      assert(afterCounts.mov === beforeCounts.mov, 'recon does not mutate movements');
      assert(afterCounts.stock === 999, 'recon did not repair mirror');

      // restore mirror for cleanup path
      await prisma.pillow.update({ where: { id: pillow.id }, data: { stock: beforeCounts.stock } });

      const okPillow = await reconciliation.reconcileInventory();
      assert(
        !okPillow.mismatches.some(
          (m) => m.code === 'PHYSICAL_MIRROR_MISMATCH' && m.pillowId === pillow.id
        ),
        'healthy pillow has no mirror mismatch'
      );
      assert(typeof healthy.status === 'string', 'report status');
      console.log('Tests 31–33 PASS — reconciliation (read-only)');
    }
  } finally {
    await setInventoryMode('LEGACY');
    for (const id of createdIds) {
      await destroyPillow(id);
    }
  }

  const after = await snapshot();
  console.log('AFTER', after);
  assert(after.mode === 'LEGACY', 'mode restored LEGACY');
  assert(after.stockSum === before.stockSum, 'Pillow.stock SUM unchanged');
  assert(after.balanceCount === before.balanceCount, 'InventoryBalance unchanged');
  assert(after.movementCount === before.movementCount, 'StockMovement unchanged');
  assert(after.historyCount === before.historyCount, 'PillowStockHistory unchanged');
  assert(after.pillowCount === before.pillowCount, 'Pillow count unchanged');
  assert(after.reservationCount === before.reservationCount, 'Reservation unchanged');
  assert(after.transferCount === before.transferCount, 'Transfer unchanged');

  console.log('ALL TASK 13 INVENTORY OPERATIONS CHECKS PASSED');
  console.log('NO PRODUCTION STOCK MODIFIED');
  console.log('NO PRODUCTION CUTOVER');
  console.log('inventoryMode = LEGACY');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
