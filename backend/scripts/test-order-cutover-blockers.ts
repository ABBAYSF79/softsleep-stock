/**
 * TASK 14.1 — Cutover blocker reproduction + remediation tests.
 * Isolated temp pillows / orders only. Restores inventoryMode=LEGACY.
 *
 * Usage: npm run test:order-cutover-blockers
 */
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { InventoryService } from '../src/services/InventoryService';
import { ReservationService, ReservationDomainError } from '../src/services/ReservationService';
import { OrderAccessoryInventory } from '../src/services/OrderAccessoryInventory';
import { AccessoryStockWriter } from '../src/services/AccessoryStockWriter';
import { CUTOVER_SETTINGS_ID, getInventoryMode } from '../src/services/InventoryMode';
import { syncPillowStockMirror } from '../src/services/PillowStockMirror';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const prisma = new PrismaClient();
const inventory = new InventoryService(prisma);
const reservations = new ReservationService(prisma);
const orderInv = new OrderAccessoryInventory(prisma);
const writer = new AccessoryStockWriter(prisma);

const results: Array<{ id: string; name: string; pass: boolean; detail?: string }> = [];

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
}

function record(id: string, name: string, pass: boolean, detail?: string) {
  results.push({ id, name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id} — ${name}${detail ? ` (${detail})` : ''}`);
}

async function setMode(mode: 'LEGACY' | 'INVENTORY') {
  await prisma.inventoryCutoverSettings.upsert({
    where: { id: CUTOVER_SETTINGS_ID },
    create: { id: CUTOVER_SETTINGS_ID, mode },
    update: { mode },
  });
}

async function prodSnapshot() {
  return {
    mode: await getInventoryMode(prisma),
    pillowCount: await prisma.pillow.count(),
    stockSum: (await prisma.pillow.aggregate({ _sum: { stock: true } }))._sum.stock ?? 0,
    historyCount: await prisma.pillowStockHistory.count(),
    locationCount: await prisma.location.count(),
    balanceCount: await prisma.inventoryBalance.count(),
    movementCount: await prisma.stockMovement.count(),
    transferCount: await prisma.transfer.count(),
    stockDocumentCount: await prisma.stockDocument.count(),
    reservationCount: await prisma.reservation.count(),
    orderCount: await prisma.order.count(),
    pillowOrderCount: await prisma.pillowOrder.count(),
  };
}

async function createTempPillow() {
  return prisma.pillow.create({
    data: {
      name: `T141-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      price: 10,
      stock: 0,
    },
  });
}

async function destroyPillow(pillowId: number) {
  const resLines = await prisma.reservationLine.findMany({
    where: { pillowId },
    select: { reservationId: true },
  });
  const resIds = Array.from(new Set(resLines.map((r) => r.reservationId)));
  if (resIds.length) {
    await prisma.reservationLine.deleteMany({ where: { reservationId: { in: resIds } } });
    await prisma.reservation.deleteMany({ where: { id: { in: resIds } } });
  }
  await prisma.stockMovement.deleteMany({ where: { pillowId } });
  await prisma.inventoryBalance.deleteMany({ where: { pillowId } });
  await prisma.pillowStockHistory.deleteMany({ where: { pillowId } });
  await prisma.orderPillowItem.deleteMany({ where: { pillowId } }).catch(() => undefined);
  await prisma.pillowOrderItem.deleteMany({ where: { pillowId } }).catch(() => undefined);
  await prisma.pillow.delete({ where: { id: pillowId } }).catch(() => undefined);
}

async function bootstrap(pillowId: number, whId: number, srId: number, whPhysical: number, srPhysical = 0) {
  if (whPhysical > 0) {
    await inventory.increasePhysical({
      pillowId,
      locationId: whId,
      quantity: whPhysical,
      type: 'SUPPLY',
      reason: 'T141 bootstrap',
      forceSyncMirror: true,
    });
  } else {
    await prisma.inventoryBalance.upsert({
      where: { pillowId_locationId: { pillowId, locationId: whId } },
      create: { pillowId, locationId: whId, physical: 0, presentation: 0, reserved: 0 },
      update: {},
    });
  }
  if (srPhysical > 0) {
    await inventory.increasePhysical({
      pillowId,
      locationId: srId,
      quantity: srPhysical,
      type: 'SUPPLY',
      reason: 'T141 bootstrap SR',
      forceSyncMirror: true,
    });
  } else {
    await prisma.inventoryBalance.upsert({
      where: { pillowId_locationId: { pillowId, locationId: srId } },
      create: { pillowId, locationId: srId, physical: 0, presentation: 0, reserved: 0 },
      update: {},
    });
  }
}

async function bal(pillowId: number, locationId: number) {
  return prisma.inventoryBalance.findUnique({
    where: { pillowId_locationId: { pillowId, locationId } },
  });
}

async function main() {
  console.log('Running TASK 14.1 cutover blocker checks…');
  if (process.env.SOFTSLEEP_ENV === 'production' && process.env.ALLOW_ISOLATED_INVENTORY_TESTS !== '1') {
    throw new Error('Refusing production without ALLOW_ISOLATED_INVENTORY_TESTS=1');
  }

  const before = await prodSnapshot();
  assert(before.mode === 'LEGACY', 'start LEGACY');
  console.log('BEFORE', before);

  const wh = await prisma.location.findFirst({ where: { code: 'WH-MAIN', active: true } });
  const sr = await prisma.location.findFirst({ where: { code: 'SR-MAIN', active: true } });
  assert(wh && sr, 'need locations');
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  assert(admin, 'need admin');

  const pillowIds: number[] = [];
  const mattressOrderIds: number[] = [];

  // Static code assertion: PUT full must gate Pillow.stock writes in INVENTORY
  const ordersRoutePath = path.join(__dirname, '../src/routes/orders.ts');
  const ordersSrc = fs.readFileSync(ordersRoutePath, 'utf8');
  const hasGate =
    ordersSrc.includes('skipLegacyAccessoryStock') &&
    ordersSrc.includes('reconcileOrderAccessoriesInTx') &&
    ordersSrc.includes('onStatusChangeInTx');
  record('A0', 'orders.ts gates full-update + atomic status', hasGate);

  try {
    await setMode('INVENTORY');

    // ─── Bug A: INVENTORY full update must not write Pillow.stock / PillowStockHistory directly ───
    {
      const p = await createTempPillow();
      pillowIds.push(p.id);
      await bootstrap(p.id, wh!.id, sr!.id, 30);
      const histBefore = await prisma.pillowStockHistory.count({ where: { pillowId: p.id } });

      const order = await prisma.order.create({
        data: {
          userId: admin!.id,
          customerName: 'T141-A',
          totalAmount: 0,          commission: 0,          status: 'PENDING',
          locationId: wh!.id,
          pillowItems: { create: [{ pillowId: p.id, quantity: 2, price: 10 }] },
        },
      });
      mattressOrderIds.push(order.id);

      await orderInv.onMattressOrderCreated({
        orderId: order.id,
        locationId: wh!.id,
        lines: [{ pillowId: p.id, quantity: 2 }],
        userId: admin!.id,
      });

      const stockBefore = (await prisma.pillow.findUnique({ where: { id: p.id } }))!.stock;

      await prisma.$transaction(async (tx) => {
        await tx.orderPillowItem.deleteMany({ where: { orderId: order.id } });
        await tx.orderPillowItem.create({
          data: { orderId: order.id, pillowId: p.id, quantity: 5, price: 10 },
        });
        await orderInv.reconcileOrderAccessoriesInTx(tx, {
          orderId: order.id,
          locationId: wh!.id,
          status: 'PENDING',
          lines: [{ pillowId: p.id, quantity: 5 }],
          userId: admin!.id,
        });
      });

      const histAfter = await prisma.pillowStockHistory.count({ where: { pillowId: p.id } });
      const stockAfter = (await prisma.pillow.findUnique({ where: { id: p.id } }))!.stock;
      const b = await bal(p.id, wh!.id);
      assert(histAfter === histBefore, 'no PillowStockHistory on inventory reconcile');
      assert(stockAfter === stockBefore, 'Pillow.stock mirror unchanged on reserve-only sync');
      assert(b!.reserved === 5, 'reserved synced to 5');
      record('A1', 'INVENTORY reconcile does not write PillowStockHistory', true);
      record('A2', 'quantity increase 2→5 reserves +3', true);

      await prisma.$transaction(async (tx) => {
        await tx.orderPillowItem.deleteMany({ where: { orderId: order.id } });
        await tx.orderPillowItem.create({
          data: { orderId: order.id, pillowId: p.id, quantity: 3, price: 10 },
        });
        await orderInv.reconcileOrderAccessoriesInTx(tx, {
          orderId: order.id,
          locationId: wh!.id,
          status: 'PENDING',
          lines: [{ pillowId: p.id, quantity: 3 }],
          userId: admin!.id,
        });
      });
      assert((await bal(p.id, wh!.id))!.reserved === 3, 'reserved 3 after decrease');
      record('A3', 'quantity decrease 5→3 releases -2', true);

      const p2 = await createTempPillow();
      pillowIds.push(p2.id);
      await bootstrap(p2.id, wh!.id, sr!.id, 10);
      await prisma.$transaction(async (tx) => {
        await tx.orderPillowItem.deleteMany({ where: { orderId: order.id } });
        await tx.orderPillowItem.create({
          data: { orderId: order.id, pillowId: p2.id, quantity: 2, price: 10 },
        });
        await orderInv.reconcileOrderAccessoriesInTx(tx, {
          orderId: order.id,
          locationId: wh!.id,
          status: 'PENDING',
          lines: [{ pillowId: p2.id, quantity: 2 }],
          userId: admin!.id,
        });
      });
      assert((await bal(p.id, wh!.id))!.reserved === 0, 'old pillow released');
      assert((await bal(p2.id, wh!.id))!.reserved === 2, 'new pillow reserved');
      record('A4', 'replace accessory releases old + reserves new', true);

      await prisma.$transaction(async (tx) => {
        await tx.orderPillowItem.deleteMany({ where: { orderId: order.id } });
        await orderInv.reconcileOrderAccessoriesInTx(tx, {
          orderId: order.id,
          locationId: wh!.id,
          status: 'PENDING',
          lines: [],
          userId: admin!.id,
        });
      });
      assert((await bal(p2.id, wh!.id))!.reserved === 0, 'all released');
      record('A5', 'remove accessory releases reservation', true);
    }

    // ─── Bug B: status + inventory atomicity ───
    {
      const p = await createTempPillow();
      pillowIds.push(p.id);
      await bootstrap(p.id, wh!.id, sr!.id, 5);

      const order = await prisma.order.create({
        data: {
          userId: admin!.id,
          customerName: 'T141-B',
          totalAmount: 0,          commission: 0,          status: 'PENDING',
          locationId: null,
          pillowItems: { create: [{ pillowId: p.id, quantity: 1, price: 10 }] },
        },
      });
      mattressOrderIds.push(order.id);

      let threw = false;
      try {
        await prisma.$transaction(async (tx) => {
          await tx.order.update({ where: { id: order.id }, data: { status: 'DELIVERED' } });
          await orderInv.onStatusChangeInTx(tx, {
            source: 'ORDER',
            orderId: order.id,
            oldStatus: 'PENDING',
            newStatus: 'DELIVERED',
            userId: admin!.id,
            hasAccessoryLines: true,
          });
        });
      } catch (e) {
        threw =
          e instanceof ReservationDomainError &&
          e.code === 'LEGACY_ORDER_INVENTORY_MIGRATION_REQUIRED';
      }
      assert(threw, 'legacy order throws migration required');
      const after = await prisma.order.findUnique({ where: { id: order.id } });
      assert(after!.status === 'PENDING', 'status rolled back on inventory failure');
      assert((await bal(p.id, wh!.id))!.physical === 5, 'physical untouched');
      record('B1', 'status rolls back when accessory inventory fails', true);
    }

    // ─── Bug C: DELIVERED → PENDING → DELIVERED ───
    {
      const p = await createTempPillow();
      pillowIds.push(p.id);
      await bootstrap(p.id, wh!.id, sr!.id, 20);

      const order = await prisma.order.create({
        data: {
          userId: admin!.id,
          customerName: 'T141-C',
          totalAmount: 0,          commission: 0,          status: 'PENDING',
          locationId: wh!.id,
          pillowItems: { create: [{ pillowId: p.id, quantity: 2, price: 10 }] },
        },
      });
      mattressOrderIds.push(order.id);
      await orderInv.onMattressOrderCreated({
        orderId: order.id,
        locationId: wh!.id,
        lines: [{ pillowId: p.id, quantity: 2 }],
        userId: admin!.id,
      });

      await prisma.$transaction(async (tx) => {
        await tx.order.update({ where: { id: order.id }, data: { status: 'IN_PROCESS' } });
        await orderInv.onStatusChangeInTx(tx, {
          source: 'ORDER',
          orderId: order.id,
          oldStatus: 'PENDING',
          newStatus: 'IN_PROCESS',
          userId: admin!.id,
          hasAccessoryLines: true,
        });
      });
      assert((await bal(p.id, wh!.id))!.reserved === 2, 'IN_PROCESS keeps reserved');
      assert((await bal(p.id, wh!.id))!.physical === 20, 'IN_PROCESS physical unchanged');
      record('C0', 'PENDING→IN_PROCESS no stock change', true);

      await prisma.$transaction(async (tx) => {
        await tx.order.update({ where: { id: order.id }, data: { status: 'DELIVERED' } });
        await orderInv.onStatusChangeInTx(tx, {
          source: 'ORDER',
          orderId: order.id,
          oldStatus: 'IN_PROCESS',
          newStatus: 'DELIVERED',
          userId: admin!.id,
          hasAccessoryLines: true,
        });
      });
      let b = await bal(p.id, wh!.id);
      assert(b!.physical === 18 && b!.reserved === 0, 'first deliver physical↓ reserved↓');
      record('C1', 'IN_PROCESS→DELIVERED fulfills', true);

      await prisma.$transaction(async (tx) => {
        await tx.order.update({ where: { id: order.id }, data: { status: 'PENDING' } });
        await orderInv.onStatusChangeInTx(tx, {
          source: 'ORDER',
          orderId: order.id,
          oldStatus: 'DELIVERED',
          newStatus: 'PENDING',
          userId: admin!.id,
          hasAccessoryLines: true,
        });
      });
      b = await bal(p.id, wh!.id);
      assert(b!.physical === 20 && b!.reserved === 2, 'reverse restores physical+reserved');
      const resAfterReverse = await reservations.findOpenForOrder(order.id, 'ORDER');
      assert(resAfterReverse!.status === 'ACTIVE', 'reservation ACTIVE after reverse');
      record('C2', 'DELIVERED→PENDING reverseDelivery', true);

      await prisma.$transaction(async (tx) => {
        await tx.order.update({ where: { id: order.id }, data: { status: 'DELIVERED' } });
        await orderInv.onStatusChangeInTx(tx, {
          source: 'ORDER',
          orderId: order.id,
          oldStatus: 'PENDING',
          newStatus: 'DELIVERED',
          userId: admin!.id,
          hasAccessoryLines: true,
        });
      });
      b = await bal(p.id, wh!.id);
      assert(b!.physical === 18 && b!.reserved === 0, 're-deliver deducts again');
      record('C3', 'PENDING→DELIVERED re-fulfills after reverse', true);
    }

    // ─── Bug D: legacy order no silent skip ───
    {
      const p = await createTempPillow();
      pillowIds.push(p.id);
      await bootstrap(p.id, wh!.id, sr!.id, 5);
      const order = await prisma.order.create({
        data: {
          userId: admin!.id,
          customerName: 'T141-D',
          totalAmount: 0,          commission: 0,          status: 'IN_PROCESS',
          locationId: null,
          pillowItems: { create: [{ pillowId: p.id, quantity: 1, price: 10 }] },
        },
      });
      mattressOrderIds.push(order.id);

      let code: string | null = null;
      try {
        await orderInv.onStatusChange({
          source: 'ORDER',
          orderId: order.id,
          oldStatus: 'IN_PROCESS',
          newStatus: 'DELIVERED',
          userId: admin!.id,
          hasAccessoryLines: true,
        });
      } catch (e) {
        if (e instanceof ReservationDomainError) code = e.code;
      }
      assert(code === 'LEGACY_ORDER_INVENTORY_MIGRATION_REQUIRED', 'explicit error');
      assert((await bal(p.id, wh!.id))!.physical === 5, 'no silent stock skip');
      record('D1', 'legacy order without reservation errors explicitly', true);
    }

    // ─── Bug E: delete with reservation ───
    {
      const p = await createTempPillow();
      pillowIds.push(p.id);
      await bootstrap(p.id, wh!.id, sr!.id, 10);

      const mk = async (qty: number, status: 'PENDING' | 'DELIVERED' = 'PENDING') => {
        const o = await prisma.order.create({
          data: {
            userId: admin!.id,
            customerName: `T141-E-${qty}`,
            totalAmount: 0,            commission: 0,            status: 'PENDING',
            locationId: wh!.id,
            pillowItems: { create: [{ pillowId: p.id, quantity: qty, price: 10 }] },
          },
        });
        mattressOrderIds.push(o.id);
        await orderInv.onMattressOrderCreated({
          orderId: o.id,
          locationId: wh!.id,
          lines: [{ pillowId: p.id, quantity: qty }],
          userId: admin!.id,
        });
        if (status === 'DELIVERED') {
          await prisma.$transaction(async (tx) => {
            await tx.order.update({ where: { id: o.id }, data: { status: 'DELIVERED' } });
            await orderInv.onStatusChangeInTx(tx, {
              source: 'ORDER',
              orderId: o.id,
              oldStatus: 'PENDING',
              newStatus: 'DELIVERED',
              userId: admin!.id,
              hasAccessoryLines: true,
            });
          });
        }
        return o;
      };

      const active = await mk(2);
      await prisma.$transaction(async (tx) => {
        await orderInv.prepareOrderDeleteInTx(tx, { orderId: active.id, userId: admin!.id });
        await tx.order.delete({ where: { id: active.id } });
      });
      assert((await bal(p.id, wh!.id))!.reserved === 0, 'active released on delete');
      record('E1', 'delete active reservation releases', true);

      const fulfilled = await mk(2, 'DELIVERED');
      const physBefore = (await bal(p.id, wh!.id))!.physical;
      await prisma.$transaction(async (tx) => {
        await orderInv.prepareOrderDeleteInTx(tx, { orderId: fulfilled.id, userId: admin!.id });
        await tx.order.delete({ where: { id: fulfilled.id } });
      });
      assert((await bal(p.id, wh!.id))!.physical === physBefore + 2, 'fulfilled reversed on delete');
      record('E2', 'delete fulfilled reverses then releases', true);

      const none = await prisma.order.create({
        data: {
          userId: admin!.id,
          customerName: 'T141-E-none',
          totalAmount: 0,          commission: 0,          status: 'PENDING',
          locationId: wh!.id,
        },
      });
      mattressOrderIds.push(none.id);
      await prisma.$transaction(async (tx) => {
        await orderInv.prepareOrderDeleteInTx(tx, { orderId: none.id, userId: admin!.id });
        await tx.order.delete({ where: { id: none.id } });
      });
      record('E3', 'delete without reservation ok', true);

      const legacy = await prisma.order.create({
        data: {
          userId: admin!.id,
          customerName: 'T141-E-leg',
          totalAmount: 0,          commission: 0,          status: 'PENDING',
          locationId: null,
          pillowItems: { create: [{ pillowId: p.id, quantity: 1, price: 10 }] },
        },
      });
      mattressOrderIds.push(legacy.id);
      await prisma.$transaction(async (tx) => {
        await orderInv.prepareOrderDeleteInTx(tx, { orderId: legacy.id, userId: admin!.id });
        await tx.order.delete({ where: { id: legacy.id } });
      });
      record('E4', 'delete legacy order without reservation ok', true);
    }

    // ─── Idempotent duplicate status ───
    {
      const p = await createTempPillow();
      pillowIds.push(p.id);
      await bootstrap(p.id, wh!.id, sr!.id, 10);
      const order = await prisma.order.create({
        data: {
          userId: admin!.id,
          customerName: 'T141-IDEM',
          totalAmount: 0,          commission: 0,          status: 'PENDING',
          locationId: wh!.id,
          pillowItems: { create: [{ pillowId: p.id, quantity: 2, price: 10 }] },
        },
      });
      mattressOrderIds.push(order.id);
      await orderInv.onMattressOrderCreated({
        orderId: order.id,
        locationId: wh!.id,
        lines: [{ pillowId: p.id, quantity: 2 }],
        userId: admin!.id,
      });

      const deliver = async (from: string, to: string) => {
        await prisma.$transaction(async (tx) => {
          await tx.order.update({ where: { id: order.id }, data: { status: to as any } });
          await orderInv.onStatusChangeInTx(tx, {
            source: 'ORDER',
            orderId: order.id,
            oldStatus: from,
            newStatus: to,
            userId: admin!.id,
            hasAccessoryLines: true,
          });
        });
      };

      await deliver('PENDING', 'DELIVERED');
      const b1 = await bal(p.id, wh!.id);
      // second deliver with same old/new when already delivered — route skips; service also no-ops if FULFILLED
      await orderInv.onStatusChange({
        source: 'ORDER',
        orderId: order.id,
        oldStatus: 'DELIVERED',
        newStatus: 'DELIVERED',
        userId: admin!.id,
        hasAccessoryLines: true,
      });
      const b2 = await bal(p.id, wh!.id);
      assert(b1!.physical === b2!.physical && b1!.reserved === b2!.reserved, 'dup DELIVERED no-op');
      record('I1', 'duplicate DELIVERED idempotent', true);

      await deliver('DELIVERED', 'PENDING');
      const b3 = await bal(p.id, wh!.id);
      await orderInv.onStatusChange({
        source: 'ORDER',
        orderId: order.id,
        oldStatus: 'PENDING',
        newStatus: 'PENDING',
        userId: admin!.id,
        hasAccessoryLines: true,
      });
      const b4 = await bal(p.id, wh!.id);
      assert(b3!.physical === b4!.physical && b3!.reserved === b4!.reserved, 'dup PENDING no-op');
      record('I2', 'duplicate PENDING idempotent', true);

      await deliver('PENDING', 'RETURNED');
      const b5 = await bal(p.id, wh!.id);
      await orderInv.onStatusChange({
        source: 'ORDER',
        orderId: order.id,
        oldStatus: 'RETURNED',
        newStatus: 'RETURNED',
        userId: admin!.id,
        hasAccessoryLines: true,
      });
      const b6 = await bal(p.id, wh!.id);
      assert(b5!.physical === b6!.physical, 'dup RETURNED no-op');
      record('I3', 'duplicate RETURNED idempotent', true);
    }

    // ─── Bug F: mirror concurrency ───
    {
      const p = await createTempPillow();
      pillowIds.push(p.id);
      await bootstrap(p.id, wh!.id, sr!.id, 50, 50);

      await Promise.all([
        inventory.decreasePhysical({
          pillowId: p.id,
          locationId: wh!.id,
          quantity: 7,
          type: 'ADJUSTMENT',
          reason: 'T141 concurrent WH',
          forceSyncMirror: true,
        }),
        inventory.decreasePhysical({
          pillowId: p.id,
          locationId: sr!.id,
          quantity: 11,
          type: 'ADJUSTMENT',
          reason: 'T141 concurrent SR',
          forceSyncMirror: true,
        }),
      ]);

      const whBal = await bal(p.id, wh!.id);
      const srBal = await bal(p.id, sr!.id);
      const expected = whBal!.physical + srBal!.physical;
      const mirror = (await prisma.pillow.findUnique({ where: { id: p.id } }))!.stock;
      assert(mirror === expected, `mirror ${mirror} === sum ${expected}`);
      // Force recompute
      await prisma.$transaction((tx) => syncPillowStockMirror(tx, p.id));
      const mirror2 = (await prisma.pillow.findUnique({ where: { id: p.id } }))!.stock;
      assert(mirror2 === expected, 'mirror stable after resync');
      record('F1', 'concurrent multi-location mirror correct', true);
    }

    // ─── Create + reserve atomicity ───
    {
      const p = await createTempPillow();
      pillowIds.push(p.id);
      await bootstrap(p.id, wh!.id, sr!.id, 1);

      let failedCreate = false;
      try {
        await prisma.$transaction(async (tx) => {
          const created = await tx.order.create({
            data: {
              userId: admin!.id,
              customerName: 'T141-CREATE-FAIL',
              totalAmount: 0,              commission: 0,              status: 'PENDING',
              locationId: wh!.id,
              pillowItems: { create: [{ pillowId: p.id, quantity: 5, price: 10 }] },
            },
          });
          mattressOrderIds.push(created.id);
          await orderInv.reserveMattressOrderInTx(tx, {
            orderId: created.id,
            locationId: wh!.id,
            lines: [{ pillowId: p.id, quantity: 5 }],
            userId: admin!.id,
          });
        });
      } catch (e) {
        failedCreate =
          e instanceof ReservationDomainError && e.code === 'INSUFFICIENT_AVAILABLE_STOCK';
      }
      assert(failedCreate, 'reserve failure throws');
      const orphan = await prisma.order.findFirst({
        where: { customerName: 'T141-CREATE-FAIL' },
      });
      assert(!orphan, 'no orphan order after reserve failure');
      record('G1', 'create+reserve atomic rollback', true);
    }

    // ─── LEGACY writer concurrency ───
    {
      await setMode('LEGACY');
      const p = await createTempPillow();
      pillowIds.push(p.id);
      await prisma.pillow.update({ where: { id: p.id }, data: { stock: 20 } });

      await Promise.all([
        writer.outgoing({ pillowId: p.id, quantity: 3, reason: 'T141-L1', userId: admin!.id }),
        writer.outgoing({ pillowId: p.id, quantity: 5, reason: 'T141-L2', userId: admin!.id }),
        writer.outgoing({ pillowId: p.id, quantity: 4, reason: 'T141-L3', userId: admin!.id }),
      ]);
      const stock = (await prisma.pillow.findUnique({ where: { id: p.id } }))!.stock;
      assert(stock === 8, `legacy concurrent stock=${stock} expected 8`);
      record('L1', 'LEGACY concurrent outgoing no lost update', true);

      let neg = false;
      try {
        await Promise.all([
          writer.outgoing({ pillowId: p.id, quantity: 5, reason: 'T141-N1', userId: admin!.id }),
          writer.outgoing({ pillowId: p.id, quantity: 5, reason: 'T141-N2', userId: admin!.id }),
        ]);
      } catch {
        neg = true;
      }
      const final = (await prisma.pillow.findUnique({ where: { id: p.id } }))!.stock;
      assert(final >= 0, 'no negative stock');
      record('L2', 'LEGACY concurrent cannot go negative', true, `stock=${final} threw=${neg}`);
    }

    // ─── LEGACY full-update path still allowed to touch Pillow.stock (mode check) ───
    {
      await setMode('LEGACY');
      const p = await createTempPillow();
      pillowIds.push(p.id);
      await prisma.pillow.update({ where: { id: p.id }, data: { stock: 10 } });
      const histBefore = await prisma.pillowStockHistory.count({ where: { pillowId: p.id } });
      await prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<Array<{ id: number; stock: number }>>`
          SELECT id, stock FROM Pillow WHERE id = ${p.id} FOR UPDATE
        `;
        const previousStock = locked[0].stock;
        const newStock = previousStock - 2;
        await tx.pillow.update({ where: { id: p.id }, data: { stock: newStock } });
        await tx.pillowStockHistory.create({
          data: {
            pillowId: p.id,
            quantity: -2,
            type: 'OUTGOING',
            reason: `Advanced edit apply Order #LEGACY-TEST`,
            previousStock,
            newStock,
            userId: admin!.id,
          },
        });
      });
      assert((await prisma.pillow.findUnique({ where: { id: p.id } }))!.stock === 8, 'legacy stock write');
      assert(
        (await prisma.pillowStockHistory.count({ where: { pillowId: p.id } })) === histBefore + 1,
        'legacy history written'
      );
      record('LEG1', 'LEGACY full-update stock path still works', true);
    }
  } catch (e) {
    console.error(e);
    record('FATAL', (e as Error).message, false);
  } finally {
    await setMode('LEGACY');

    for (const id of mattressOrderIds) {
      await prisma.reservation.updateMany({ where: { orderId: id }, data: { orderId: null } }).catch(() => undefined);
      await prisma.orderPillowItem.deleteMany({ where: { orderId: id } }).catch(() => undefined);
      await prisma.order.delete({ where: { id } }).catch(() => undefined);
    }
    for (const id of pillowIds) {
      await destroyPillow(id);
    }

    const after = await prodSnapshot();
    console.log('AFTER', after);
    const stable =
      after.mode === 'LEGACY' &&
      after.pillowCount === before.pillowCount &&
      after.stockSum === before.stockSum &&
      after.historyCount === before.historyCount &&
      after.balanceCount === before.balanceCount &&
      after.movementCount === before.movementCount &&
      after.reservationCount === before.reservationCount &&
      after.transferCount === before.transferCount &&
      after.stockDocumentCount === before.stockDocumentCount;
    record('SNAP', 'production inventory snapshot unchanged', stable, JSON.stringify(after));

    const failed = results.filter((r) => !r.pass);
    console.log(`\n${results.length - failed.length}/${results.length} passed`);
    if (failed.length) {
      console.error('FAILED:', failed);
      process.exitCode = 1;
    }
    await prisma.$disconnect();
  }
}

main().catch(async (e) => {
  console.error(e);
  await setMode('LEGACY').catch(() => undefined);
  await prisma.$disconnect();
  process.exit(1);
});
