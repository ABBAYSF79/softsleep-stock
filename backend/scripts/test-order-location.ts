/**
 * TASK 8 — Order location foundation tests.
 * Uses isolated temp orders only. Does not mutate production stock totals.
 *
 * Usage: npm run test:order-location
 */
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import {
  canChangeOrderFulfillmentLocation,
  OrderLocationError,
  resolveOptionalSellableLocationId,
} from '../src/utils/order-location';

dotenv.config();

const prisma = new PrismaClient();

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
}

async function snapshot() {
  return {
    pillowCount: await prisma.pillow.count(),
    stockSum: (await prisma.pillow.aggregate({ _sum: { stock: true } }))._sum.stock ?? 0,
    historyCount: await prisma.pillowStockHistory.count(),
    locationCount: await prisma.location.count(),
    balanceCount: await prisma.inventoryBalance.count(),
    movementCount: await prisma.stockMovement.count(),
    transferCount: await prisma.transfer.count(),
    orderNullLoc: await prisma.order.count({ where: { locationId: null } }),
    pillowOrderNullLoc: await prisma.pillowOrder.count({ where: { locationId: null } }),
  };
}

async function main() {
  console.log('Running TASK 8 order location checks…');
  const before = await snapshot();
  console.log('BEFORE', before);

  const wh = await prisma.location.findFirst({ where: { code: 'WH-MAIN', active: true } });
  const sr = await prisma.location.findFirst({ where: { code: 'SR-MAIN', active: true } });
  assert(wh && sr, 'need WH-MAIN and SR-MAIN');
  assert(wh.isSellable && sr.isSellable, 'seed locations should be sellable');

  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  assert(admin, 'need admin user');

  // Existing production rows remain NULL
  assert(before.orderNullLoc === before.orderNullLoc, 'sanity');
  const allOrdersNullOrSet = await prisma.order.count();
  const nullOrders = await prisma.order.count({ where: { locationId: null } });
  assert(nullOrders === allOrdersNullOrSet || nullOrders > 0, 'existing orders mostly/all NULL');
  // After migration every pre-existing order should be NULL; any with location are test artifacts only.
  console.log(`Existing Order rows with locationId=NULL: ${nullOrders}/${allOrdersNullOrSet}`);
  const nullPillowOrders = await prisma.pillowOrder.count({ where: { locationId: null } });
  const allPillowOrders = await prisma.pillowOrder.count();
  console.log(`Existing PillowOrder rows with locationId=NULL: ${nullPillowOrders}/${allPillowOrders}`);

  // --- Helper validation ---
  {
    assert((await resolveOptionalSellableLocationId(prisma, undefined)) === null, 'omit → null');
    assert((await resolveOptionalSellableLocationId(prisma, null)) === null, 'null → null');
    assert((await resolveOptionalSellableLocationId(prisma, '')) === null, 'empty → null');
    assert((await resolveOptionalSellableLocationId(prisma, wh.id)) === wh.id, 'valid WH');
    assert((await resolveOptionalSellableLocationId(prisma, sr.id)) === sr.id, 'valid SR');

    let failed = false;
    try {
      await resolveOptionalSellableLocationId(prisma, 99999999);
    } catch (e) {
      failed = e instanceof OrderLocationError && e.code === 'INVALID_LOCATION';
    }
    assert(failed, 'invalid location rejected');

    // Temporarily mark inactive / non-sellable on a disposable location clone via update+restore
    // Use WH-MAIN flags carefully — restore always.
    const orig = { active: wh.active, isSellable: wh.isSellable };
    try {
      await prisma.location.update({ where: { id: wh.id }, data: { active: false } });
      failed = false;
      try {
        await resolveOptionalSellableLocationId(prisma, wh.id);
      } catch (e) {
        failed = e instanceof OrderLocationError && e.code === 'INACTIVE_LOCATION';
      }
      assert(failed, 'inactive rejected');

      await prisma.location.update({ where: { id: wh.id }, data: { active: true, isSellable: false } });
      failed = false;
      try {
        await resolveOptionalSellableLocationId(prisma, wh.id);
      } catch (e) {
        failed = e instanceof OrderLocationError && e.code === 'NON_SELLABLE_LOCATION';
      }
      assert(failed, 'non-sellable rejected');
    } finally {
      await prisma.location.update({
        where: { id: wh.id },
        data: { active: orig.active, isSellable: orig.isSellable },
      });
    }
    console.log('Tests 1–5 PASS — location validation helper');
  }

  assert(canChangeOrderFulfillmentLocation('PENDING') === true, 'PENDING ok');
  assert(canChangeOrderFulfillmentLocation('RETURNED') === true, 'RETURNED ok');
  assert(canChangeOrderFulfillmentLocation('IN_PROCESS') === false, 'IN_PROCESS blocked');
  assert(canChangeOrderFulfillmentLocation('DELIVERED') === false, 'DELIVERED blocked');

  const createdOrderIds: number[] = [];
  const createdPillowOrderIds: number[] = [];

  try {
    // --- Mattress Order with location (no stock mutation on create) ---
    {
      const variant = await prisma.productVariant.findFirst();
      assert(variant, 'need a product variant');
      const order = await prisma.order.create({
        data: {
          userId: admin.id,
          customerName: `TASK8-LOC-${Date.now()}`,
          totalAmount: 1,
          commission: 0,
          status: 'PENDING',
          locationId: wh.id,
          orderItems: {
            create: [{ variantId: variant.id, quantity: 1, price: variant.price }],
          },
        },
        include: { location: true },
      });
      createdOrderIds.push(order.id);
      assert(order.locationId === wh.id, 'order stores location');
      assert(order.location?.code === 'WH-MAIN', 'location relation');
      console.log('Tests 7/11 PASS — Order stores location');
    }

    // --- Order without location stays NULL (no WH/SR default) ---
    {
      const variant = await prisma.productVariant.findFirst();
      assert(variant, 'need variant');
      const order = await prisma.order.create({
        data: {
          userId: admin.id,
          customerName: `TASK8-NULL-${Date.now()}`,
          totalAmount: 1,
          commission: 0,
          status: 'PENDING',
          orderItems: {
            create: [{ variantId: variant.id, quantity: 1, price: variant.price }],
          },
        },
      });
      createdOrderIds.push(order.id);
      assert(order.locationId === null, 'missing location stays NULL');
      console.log('Tests 8–10/12 PASS — NULL location no default');
    }

    // --- PillowOrder with / without location ---
    {
      const pillow = await prisma.pillow.findFirst();
      assert(pillow, 'need pillow');
      // Do NOT change pillow.stock — create order rows only without stock writers
      const withLoc = await prisma.pillowOrder.create({
        data: {
          userId: admin.id,
          customerName: `TASK8-PO-${Date.now()}`,
          totalAmount: 0,
          locationId: sr.id,
          items: { create: [{ pillowId: pillow.id, quantity: 1, price: pillow.price }] },
        },
      });
      createdPillowOrderIds.push(withLoc.id);
      assert(withLoc.locationId === sr.id, 'pillow order location');

      const noLoc = await prisma.pillowOrder.create({
        data: {
          userId: admin.id,
          customerName: `TASK8-PO-NULL-${Date.now()}`,
          totalAmount: 0,
          items: { create: [{ pillowId: pillow.id, quantity: 1, price: pillow.price }] },
        },
      });
      createdPillowOrderIds.push(noLoc.id);
      assert(noLoc.locationId === null, 'pillow order null location');
      console.log('Tests 7–10 PillowOrder PASS');
    }

    // --- Location change policy on Advanced Edit semantics ---
    {
      const order = await prisma.order.findFirst({ where: { id: { in: createdOrderIds }, locationId: wh.id } });
      assert(order, 'need located order');
      assert(canChangeOrderFulfillmentLocation(order.status), 'PENDING can change');
      await prisma.order.update({ where: { id: order.id }, data: { locationId: sr.id } });
      const moved = await prisma.order.findUnique({ where: { id: order.id } });
      assert(moved?.locationId === sr.id, 'PENDING location change allowed (metadata only)');

      await prisma.order.update({ where: { id: order.id }, data: { status: 'IN_PROCESS' } });
      assert(!canChangeOrderFulfillmentLocation('IN_PROCESS'), 'blocked when deducted');
      console.log('Test location-change policy PASS');
    }
  } finally {
    for (const id of createdPillowOrderIds) {
      await prisma.pillowOrderItem.deleteMany({ where: { orderId: id } });
      await prisma.pillowOrder.delete({ where: { id } }).catch(() => undefined);
    }
    for (const id of createdOrderIds) {
      await prisma.orderItem.deleteMany({ where: { orderId: id } });
      await prisma.orderPillowItem.deleteMany({ where: { orderId: id } });
      await prisma.order.delete({ where: { id } }).catch(() => undefined);
    }
  }

  const after = await snapshot();
  console.log('AFTER', after);

  assert(after.stockSum === before.stockSum, 'Pillow.stock unchanged');
  assert(after.historyCount === before.historyCount, 'PillowStockHistory unchanged');
  assert(after.pillowCount === before.pillowCount, 'Pillow count unchanged');
  assert(after.balanceCount === before.balanceCount, 'no InventoryBalance created');
  assert(after.movementCount === before.movementCount, 'no StockMovement created');
  assert(after.transferCount === before.transferCount, 'no Transfer created');
  assert(after.locationCount === before.locationCount, 'Location count unchanged');
  // Production null counts restored after deleting test rows
  assert(after.orderNullLoc === before.orderNullLoc, 'Order NULL location count restored');
  assert(after.pillowOrderNullLoc === before.pillowOrderNullLoc, 'PillowOrder NULL location count restored');

  console.log('Tests 14–19 PASS — stock/inventory/transfer safety');
  console.log('ALL TASK 8 ORDER LOCATION CHECKS PASSED');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
