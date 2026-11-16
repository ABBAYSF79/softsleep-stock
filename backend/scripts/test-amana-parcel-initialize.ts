/**
 * Amana Management — manual initialization of "Non initialisé" orders with a chosen status.
 * Uses disposable Order rows only (cleaned up). Asserts no Order / inventory mutation.
 *
 * Usage: npm run test:amana-initialize
 */
import { AmanaParcelStatus, OrderStatus, PrismaClient, UserRole } from '@prisma/client';
import dotenv from 'dotenv';
import {
  AmanaParcelTrackingError,
  AmanaParcelTrackingService,
} from '../src/services/AmanaParcelTrackingService';

dotenv.config();

const prisma = new PrismaClient();
const service = new AmanaParcelTrackingService(prisma);

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
}

async function errorCode(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof AmanaParcelTrackingError ? e.code : `UNEXPECTED:${String(e)}`;
  }
}

async function snapshotInventory() {
  return {
    pillowStockSum: (await prisma.pillow.aggregate({ _sum: { stock: true } }))._sum.stock ?? 0,
    balanceCount: await prisma.inventoryBalance.count(),
    movementCount: await prisma.stockMovement.count(),
    reservationCount: await prisma.reservation.count(),
  };
}

async function main() {
  console.log('Running Amana parcel initialization checks…');

  const admin = await prisma.user.findFirst({ where: { role: UserRole.ADMIN, active: true } });
  assert(admin, 'need admin user');
  const sales = await prisma.user.findFirst({ where: { role: UserRole.SALES, active: true } });
  const suivi = await prisma.user.findFirst({ where: { role: UserRole.SUIVI, active: true } });

  const stamp = Date.now();
  const deliveryService = await prisma.deliveryService.create({
    data: { name: `TEST AMANA Init ${stamp}`, active: true, cities: JSON.stringify(['Rabat']) },
  });

  const orderIds: number[] = [];
  const inProcessAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  async function makeOrder(label: string, status: OrderStatus, withInProcessAt = true) {
    const order = await prisma.order.create({
      data: {
        userId: admin!.id,
        customerName: `Init ${label} ${stamp}`,
        phone: '0611000000',
        city: 'Rabat',
        status,
        totalAmount: 10,
        commission: 0,
        trackingCode: `INIT${label}${stamp}MA`,
        deliveryServiceId: deliveryService.id,
        inProcessAt: withInProcessAt ? inProcessAt : null,
      },
    });
    orderIds.push(order.id);
    return order;
  }

  try {
    const target = await makeOrder('TARGET', OrderStatus.IN_PROCESS);
    const delivered = await makeOrder('DELIV', OrderStatus.DELIVERED);
    const legacy = await makeOrder('LEGACY', OrderStatus.IN_PROCESS, false);
    const viaSuivi = await makeOrder('SUIVI', OrderStatus.IN_PROCESS);

    const before = await service.listActive({ user: admin!, limit: 50, search: `Init TARGET ${stamp}` });
    assert(before.data[0]?.amanaTracking === null, 'target starts uninitialized');
    assert(before.summary.uninitialized === 1, 'listed as Non initialisé');

    const orderBefore = await prisma.order.findUnique({
      where: { id: target.id },
      select: { status: true, inProcessAt: true, deliveredAt: true, updatedAt: true },
    });
    const invBefore = await snapshotInventory();

    // Validation + permissions
    assert(
      (await errorCode(() => service.initializeWithStatus(target.id, admin!, 'IN_TRANSIT'))) ===
        'INVALID_STATUS',
      'invalid status rejected'
    );
    if (sales) {
      assert(
        (await errorCode(() =>
          service.initializeWithStatus(target.id, sales, AmanaParcelStatus.ENVOI_ARRIVE)
        )) === 'FORBIDDEN',
        'SALES cannot initialize'
      );
    } else {
      console.warn('SKIP: no SALES user for permission check');
    }
    assert(
      (await errorCode(() =>
        service.initializeWithStatus(delivered.id, admin!, AmanaParcelStatus.ENVOI_ARRIVE)
      )) === 'NOT_IN_PROCESS',
      'non-IN_PROCESS order rejected'
    );
    assert(
      !(await prisma.amanaParcelTracking.findUnique({ where: { orderId: target.id } })),
      'failed attempts create nothing'
    );

    // Initialize with a chosen (non-default) status + note
    const tracking = await service.initializeWithStatus(
      target.id,
      admin!,
      AmanaParcelStatus.ENVOI_ARRIVE,
      '  arrivé en agence  '
    );
    assert(tracking.status.code === 'ENVOI_ARRIVE', 'chosen status applied');
    assert(
      tracking.initialStatusAt.getTime() === inProcessAt.getTime(),
      'initialStatusAt keeps the departure date (inProcessAt)'
    );
    assert(tracking.history?.length === 1, 'exactly one history entry');
    const h = tracking.history![0];
    assert(h.oldStatus === null, 'initial entry oldStatus null');
    assert(h.newStatus.code === 'ENVOI_ARRIVE', 'initial entry newStatus = chosen');
    assert(h.note === 'arrivé en agence', 'note trimmed and stored');
    assert(h.changedBy?.id === admin!.id, 'attributed to the user');
    assert(
      tracking.lastStatusAt.getTime() === h.changedAt.getTime(),
      'lastStatusAt = initialization time'
    );

    // Second attempt
    assert(
      (await errorCode(() =>
        service.initializeWithStatus(target.id, admin!, AmanaParcelStatus.LIVREE)
      )) === 'ALREADY_INITIALIZED',
      'cannot initialize twice'
    );

    // Appears as tracked, no fresh alert, normal updates work afterwards
    const after = await service.listActive({ user: admin!, limit: 50, search: `Init TARGET ${stamp}` });
    assert(after.data[0]?.amanaTracking?.status.code === 'ENVOI_ARRIVE', 'list shows chosen status');
    assert(after.summary.uninitialized === 0, 'no longer Non initialisé');
    const alerts = await service.listAlerts({ user: admin! });
    assert(!alerts.data.some((a) => a.orderId === target.id), 'just-initialized parcel not alerted');
    const exported = await service.listForExport({ user: admin!, orderIds: [target.id] });
    assert(exported.data[0]?.currentStatusNote === 'arrivé en agence', 'Smart Copy sees init note');
    const upd = await service.updateStatus(target.id, admin!, AmanaParcelStatus.SORTI_PAR_FACTEUR);
    assert(upd.changed === true, 'status can be updated after initialization');

    // Legacy order without inProcessAt → createdAt fallback
    const legacyTracking = await service.initializeWithStatus(
      legacy.id,
      admin!,
      AmanaParcelStatus.SORTI_A_DESTINATION
    );
    assert(
      legacyTracking.initialStatusAt.getTime() === legacy.createdAt.getTime(),
      'legacy initialStatusAt = createdAt'
    );

    // SUIVI allowed when assigned to the delivery service
    if (suivi) {
      await prisma.userDeliveryService.create({
        data: { userId: suivi.id, deliveryServiceId: deliveryService.id },
      });
      const t = await service.initializeWithStatus(viaSuivi.id, suivi, AmanaParcelStatus.A_RECUPERER);
      assert(t.status.code === 'A_RECUPERER', 'SUIVI can initialize');
    } else {
      console.warn('SKIP: no SUIVI user for permission check');
    }

    // Read-only for Order / inventory
    const orderAfter = await prisma.order.findUnique({
      where: { id: target.id },
      select: { status: true, inProcessAt: true, deliveredAt: true, updatedAt: true },
    });
    assert(JSON.stringify(orderBefore) === JSON.stringify(orderAfter), 'Order row unchanged');
    assert(
      JSON.stringify(invBefore) === JSON.stringify(await snapshotInventory()),
      'inventory snapshot unchanged'
    );

    console.log('Amana parcel initialization checks OK');
  } finally {
    await prisma.amanaParcelTrackingHistory.deleteMany({
      where: { tracking: { orderId: { in: orderIds } } },
    });
    await prisma.amanaParcelTracking.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.userDeliveryService.deleteMany({ where: { deliveryServiceId: deliveryService.id } });
    await prisma.deliveryService.delete({ where: { id: deliveryService.id } });
    await prisma.$disconnect();
  }
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
