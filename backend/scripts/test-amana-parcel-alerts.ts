/**
 * Amana Management — parcel aging alerts.
 * Pure threshold checks + service checks on disposable Order rows (cleaned up).
 * Asserts alerts are read-only (no Order / tracking / history / inventory mutation).
 *
 * Usage: npm run test:amana-alerts
 */
import { AmanaParcelStatus, OrderStatus, PrismaClient, UserRole } from '@prisma/client';
import dotenv from 'dotenv';
import { AmanaParcelTrackingService } from '../src/services/AmanaParcelTrackingService';
import {
  amanaParcelAlertSeverity,
  amanaParcelAlertSuggestedAction,
} from '../src/utils/amanaParcelAlerts';

dotenv.config();

const prisma = new PrismaClient();
const service = new AmanaParcelTrackingService(prisma);

const HOUR = 60 * 60 * 1000;

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
}

async function snapshotInventory() {
  return {
    pillowStockSum: (await prisma.pillow.aggregate({ _sum: { stock: true } }))._sum.stock ?? 0,
    balanceCount: await prisma.inventoryBalance.count(),
    movementCount: await prisma.stockMovement.count(),
    reservationCount: await prisma.reservation.count(),
  };
}

function checkThresholds() {
  const ref = new Date('2026-11-16T15:00:00.000Z');
  const ago = (ms: number) => new Date(ref.getTime() - ms);
  const cases: Array<[number, string | null]> = [
    [0, null],
    [24 * HOUR - 1, null],
    [24 * HOUR, 'INFO'],
    [30 * HOUR, 'INFO'],
    [48 * HOUR - 1, 'INFO'],
    [48 * HOUR, 'WARNING'],
    [55 * HOUR, 'WARNING'],
    [72 * HOUR - 1, 'WARNING'],
    [72 * HOUR, 'CRITICAL'],
    [80 * HOUR, 'CRITICAL'],
    [30 * 24 * HOUR, 'CRITICAL'],
    [-5 * HOUR, null],
  ];
  for (const [elapsed, expected] of cases) {
    const got = amanaParcelAlertSeverity(ago(elapsed), ref);
    assert(got === expected, `elapsed ${elapsed}ms → ${expected} (got ${got})`);
  }
  assert(
    amanaParcelAlertSuggestedAction('INFO', AmanaParcelStatus.LIVREE).includes('clôturer'),
    'LIVREE suggests closing the order'
  );
  assert(
    amanaParcelAlertSuggestedAction('CRITICAL', AmanaParcelStatus.SORTI_A_DESTINATION).startsWith(
      'Escalader'
    ),
    'CRITICAL default action escalates'
  );
}

async function main() {
  console.log('Running Amana parcel alert checks…');
  checkThresholds();

  const admin = await prisma.user.findFirst({ where: { role: UserRole.ADMIN, active: true } });
  assert(admin, 'need admin user');
  const sales = await prisma.user.findFirst({ where: { role: UserRole.SALES, active: true } });

  const referenceAt = new Date();
  const ago = (hours: number) => new Date(referenceAt.getTime() - hours * HOUR);
  const stamp = Date.now();

  const deliveryService = await prisma.deliveryService.create({
    data: { name: `TEST AMANA Alerts ${stamp}`, active: true, cities: JSON.stringify(['Rabat']) },
  });

  const orderIds: number[] = [];
  async function makeOrder(
    label: string,
    opts: {
      status?: OrderStatus;
      createdAt?: Date;
      tracking?: {
        status?: AmanaParcelStatus;
        initialHoursAgo: number;
        historyHoursAgo: number[];
      };
    }
  ) {
    const order = await prisma.order.create({
      data: {
        userId: admin!.id,
        customerName: `Alert ${label} ${stamp}`,
        phone: '0611000000',
        city: 'Rabat',
        status: opts.status ?? OrderStatus.IN_PROCESS,
        totalAmount: 10,
        commission: 0,
        trackingCode: `ALERT${label}${stamp}MA`,
        deliveryServiceId: deliveryService.id,
        createdAt: opts.createdAt ?? ago(24 * 10),
        inProcessAt: opts.tracking ? ago(opts.tracking.initialHoursAgo) : null,
      },
    });
    orderIds.push(order.id);
    if (opts.tracking) {
      const status = opts.tracking.status ?? AmanaParcelStatus.SORTI_A_DESTINATION;
      const latest = opts.tracking.historyHoursAgo.length
        ? Math.min(...opts.tracking.historyHoursAgo)
        : opts.tracking.initialHoursAgo;
      await prisma.amanaParcelTracking.create({
        data: {
          orderId: order.id,
          status,
          initialStatusAt: ago(opts.tracking.initialHoursAgo),
          lastStatusAt: ago(latest),
          history: {
            create: opts.tracking.historyHoursAgo.map((h) => ({
              oldStatus: null,
              newStatus: status,
              changedAt: ago(h),
            })),
          },
        },
      });
    }
    return order;
  }

  try {
    const info = await makeOrder('INFO', {
      tracking: { initialHoursAgo: 200, historyHoursAgo: [200, 120, 30] },
    });
    const warning = await makeOrder('WARN', {
      tracking: { initialHoursAgo: 55, historyHoursAgo: [55] },
    });
    const critical = await makeOrder('CRIT', {
      tracking: {
        status: AmanaParcelStatus.ENVOI_EN_RETARD,
        initialHoursAgo: 80,
        historyHoursAgo: [80],
      },
    });
    const fresh = await makeOrder('FRESH', {
      tracking: { initialHoursAgo: 100, historyHoursAgo: [100, 10] },
    });
    const noHistory = await makeOrder('NOHIST', {
      tracking: { initialHoursAgo: 50, historyHoursAgo: [] },
    });
    const delivered = await makeOrder('DELIV', {
      status: OrderStatus.DELIVERED,
      tracking: { initialHoursAgo: 200, historyHoursAgo: [200] },
    });
    const tooOld = await makeOrder('OLD', {
      createdAt: ago(24 * 120),
      tracking: { initialHoursAgo: 200, historyHoursAgo: [200] },
    });
    const uninitialized = await makeOrder('UNINIT', {});

    const ordersBefore = await prisma.order.findMany({
      where: { id: { in: orderIds } },
      select: { id: true, status: true, updatedAt: true },
      orderBy: { id: 'asc' },
    });
    const trackingBefore = await prisma.amanaParcelTracking.findMany({
      where: { orderId: { in: orderIds } },
      select: { orderId: true, status: true, lastStatusAt: true, updatedAt: true },
      orderBy: { orderId: 'asc' },
    });
    const historyCountBefore = await prisma.amanaParcelTrackingHistory.count({
      where: { tracking: { orderId: { in: orderIds } } },
    });
    const invBefore = await snapshotInventory();

    const result = await service.listAlerts({ user: admin!, referenceAt });
    const byOrder = new Map(result.data.map((a) => [a.orderId, a]));

    assert(result.referenceAt.getTime() === referenceAt.getTime(), 'reference time echoed');

    // Thresholds + latest-history rule
    assert(byOrder.get(info.id)?.severity === 'INFO', '30h since latest history → INFO');
    assert(
      byOrder.get(info.id)!.lastUpdateAt.getTime() === ago(30).getTime(),
      'uses the latest history timestamp, not initial/older entries'
    );
    assert(byOrder.get(info.id)!.lastUpdateSource === 'history', 'source = history');
    assert(byOrder.get(warning.id)?.severity === 'WARNING', '55h → WARNING');
    assert(byOrder.get(critical.id)?.severity === 'CRITICAL', '80h → CRITICAL');
    assert(
      byOrder.get(critical.id)!.suggestedAction === 'Contacter Amana au sujet du retard',
      'status-specific suggested action'
    );
    assert(
      byOrder.get(critical.id)!.elapsedMs === 80 * HOUR,
      'elapsed measured against the shared reference time'
    );
    assert(!byOrder.has(fresh.id), 'recent history update (10h) → no alert');

    // Fallback to initialStatusAt
    const nh = byOrder.get(noHistory.id);
    assert(nh?.severity === 'WARNING', 'no history → initialStatusAt (50h) → WARNING');
    assert(nh!.lastUpdateSource === 'initialStatusAt', 'source = initialStatusAt');

    // Eligibility
    assert(!byOrder.has(delivered.id), 'non-IN_PROCESS excluded');
    assert(!byOrder.has(tooOld.id), '3-month window respected');
    assert(!byOrder.has(uninitialized.id), 'uninitialized parcel excluded');

    // One entry per parcel, counts consistent with full list
    assert(
      new Set(result.data.map((a) => a.orderId)).size === result.data.length,
      'each parcel appears once'
    );
    for (const sev of ['CRITICAL', 'WARNING', 'INFO'] as const) {
      assert(
        result.counts[sev] === result.data.filter((a) => a.severity === sev).length,
        `${sev} count matches alert list`
      );
    }
    assert(
      result.counts.total ===
        result.counts.CRITICAL + result.counts.WARNING + result.counts.INFO,
      'total = sum of severities'
    );

    // Counts are over the full eligible set, not one list page
    const page = await service.listActive({ user: admin!, limit: 1 });
    assert(page.data.length <= 1, 'list page is limited');
    const ours = result.data.filter((a) => orderIds.includes(a.orderId));
    assert(ours.length === 4, 'all 4 aged test parcels alerted despite list limit=1');

    // Sorted by longest stall first
    for (let i = 1; i < result.data.length; i++) {
      assert(result.data[i - 1].elapsedMs >= result.data[i].elapsedMs, 'sorted by elapsed desc');
    }

    // Access scope: SALES sees only own orders (test orders belong to admin)
    if (sales && sales.id !== admin!.id) {
      const salesAlerts = await service.listAlerts({ user: sales, referenceAt });
      assert(
        !salesAlerts.data.some((a) => orderIds.includes(a.orderId)),
        'SALES does not see other users’ alerts'
      );
    } else {
      console.warn('SKIP: no SALES user for access check');
    }

    // Read-only
    const ordersAfter = await prisma.order.findMany({
      where: { id: { in: orderIds } },
      select: { id: true, status: true, updatedAt: true },
      orderBy: { id: 'asc' },
    });
    const trackingAfter = await prisma.amanaParcelTracking.findMany({
      where: { orderId: { in: orderIds } },
      select: { orderId: true, status: true, lastStatusAt: true, updatedAt: true },
      orderBy: { orderId: 'asc' },
    });
    assert(
      JSON.stringify(ordersBefore) === JSON.stringify(ordersAfter),
      'Order rows unchanged'
    );
    assert(
      JSON.stringify(trackingBefore) === JSON.stringify(trackingAfter),
      'tracking rows unchanged'
    );
    assert(
      (await prisma.amanaParcelTrackingHistory.count({
        where: { tracking: { orderId: { in: orderIds } } },
      })) === historyCountBefore,
      'no history rows created'
    );
    assert(
      JSON.stringify(invBefore) === JSON.stringify(await snapshotInventory()),
      'inventory snapshot unchanged'
    );

    console.log('Amana parcel alert checks OK');
  } finally {
    await prisma.amanaParcelTrackingHistory.deleteMany({
      where: { tracking: { orderId: { in: orderIds } } },
    });
    await prisma.amanaParcelTracking.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.deliveryService.delete({ where: { id: deliveryService.id } });
    await prisma.$disconnect();
  }
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
