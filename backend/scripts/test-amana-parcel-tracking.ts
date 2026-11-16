/**
 * Amana Management (Stage B) — focused service tests.
 * Creates disposable DeliveryService / Order rows and cleans them up.
 * Asserts no Order.status / stock / inventory mutation on Amana status updates.
 *
 * Usage: npm run test:amana-parcel
 */
import {
  AmanaParcelStatus,
  OrderStatus,
  PrismaClient,
  UserRole,
} from '@prisma/client';
import dotenv from 'dotenv';
import {
  AmanaParcelTrackingError,
  AmanaParcelTrackingService,
} from '../src/services/AmanaParcelTrackingService';
import {
  AMANA_PARCEL_INITIAL_STATUS,
  AMANA_PARCEL_STATUSES,
  isAmanaParcelStatus,
  parseAmanaParcelStatus,
} from '../src/utils/amanaParcelStatus';
import { isAmanaDeliveryServiceName } from '../src/utils/amanaTracking';

dotenv.config();

const prisma = new PrismaClient();
const service = new AmanaParcelTrackingService(prisma);

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

async function main() {
  console.log('Running Amana parcel tracking checks…');

  // --- Catalog unit ---
  assert(AMANA_PARCEL_STATUSES.length === 10, 'exactly 10 statuses');
  assert(
    AMANA_PARCEL_INITIAL_STATUS === AmanaParcelStatus.SORTI_A_DESTINATION,
    'initial status'
  );
  assert(isAmanaParcelStatus('SORTI_A_DESTINATION'), 'valid status accepted');
  assert(!isAmanaParcelStatus('IN_TRANSIT'), 'BAM scrape code rejected');
  assert(!isAmanaParcelStatus('UNKNOWN'), 'unknown rejected');
  let invalidParsed = false;
  try {
    parseAmanaParcelStatus('NOT_A_STATUS');
  } catch {
    invalidParsed = true;
  }
  assert(invalidParsed, 'parse rejects unknown');
  assert(isAmanaDeliveryServiceName('AMANA'), 'amana name helper');
  assert(!isAmanaDeliveryServiceName('Chrono'), 'non-amana name');

  const admin = await prisma.user.findFirst({ where: { role: UserRole.ADMIN, active: true } });
  assert(admin, 'need admin user');

  const sales = await prisma.user.findFirst({
    where: { role: UserRole.SALES, active: true },
  });
  const suivi = await prisma.user.findFirst({
    where: { role: UserRole.SUIVI, active: true },
  });

  const amanaService = await prisma.deliveryService.create({
    data: {
      name: `TEST AMANA Parcel ${Date.now()}`,
      active: true,
      cities: JSON.stringify(['Casablanca', 'Rabat']),
    },
  });

  const otherService = await prisma.deliveryService.create({
    data: {
      name: `TEST Chrono Parcel ${Date.now()}`,
      active: true,
      cities: JSON.stringify(['Casablanca']),
    },
  });

  const inProcessAt = new Date('2026-11-10T12:00:00.000Z');

  const amanaInProcess = await prisma.order.create({
    data: {
      userId: admin!.id,
      customerName: 'Amana Parcel Test Client',
      phone: '0611223344',
      city: 'Casablanca',
      address: 'Rue Test 1',
      status: OrderStatus.IN_PROCESS,
      totalAmount: 100,
      commission: 0,
      trackingCode: `SS2026TEST${Date.now()}MA`,
      deliveryServiceId: amanaService.id,
      inProcessAt,
    },
  });

  const amanaDelivered = await prisma.order.create({
    data: {
      userId: admin!.id,
      customerName: 'Amana Delivered',
      phone: '0611223345',
      city: 'Rabat',
      address: 'Rue Test 2',
      status: OrderStatus.DELIVERED,
      totalAmount: 100,
      commission: 0,
      trackingCode: `SS2026DEL${Date.now()}MA`,
      deliveryServiceId: amanaService.id,
      inProcessAt,
      deliveredAt: new Date(),
    },
  });

  const chronoInProcess = await prisma.order.create({
    data: {
      userId: admin!.id,
      customerName: 'Chrono In Process',
      phone: '0611223346',
      city: 'Casablanca',
      address: 'Rue Test 3',
      status: OrderStatus.IN_PROCESS,
      totalAmount: 100,
      commission: 0,
      trackingCode: `SS2026CHR${Date.now()}MA`,
      deliveryServiceId: otherService.id,
      inProcessAt,
    },
  });

  const amanaReturned = await prisma.order.create({
    data: {
      userId: admin!.id,
      customerName: 'Amana Returned',
      phone: '0611223347',
      city: 'Fes',
      status: OrderStatus.RETURNED,
      totalAmount: 100,
      commission: 0,
      deliveryServiceId: amanaService.id,
      inProcessAt,
    },
  });

  try {
    // --- Initialization ---
    const ensured = await service.ensureForOrder(amanaInProcess.id, admin!.id);
    assert(ensured?.created === true, 'first ensure creates');
    assert(ensured?.initialAtSource === 'inProcessAt', 'uses inProcessAt when present');

    const tracking = await prisma.amanaParcelTracking.findUnique({
      where: { orderId: amanaInProcess.id },
      include: { history: true },
    });
    assert(tracking, 'tracking exists');
    assert(tracking!.status === AmanaParcelStatus.SORTI_A_DESTINATION, 'initial status code');
    assert(
      tracking!.initialStatusAt.getTime() === inProcessAt.getTime(),
      'initialStatusAt === inProcessAt'
    );
    assert(
      tracking!.lastStatusAt.getTime() === inProcessAt.getTime(),
      'lastStatusAt === inProcessAt'
    );
    assert(tracking!.history.length === 1, 'one initial history');
    assert(tracking!.history[0].oldStatus === null, 'initial oldStatus null');
    assert(
      tracking!.history[0].newStatus === AmanaParcelStatus.SORTI_A_DESTINATION,
      'initial newStatus'
    );

    const ensuredAgain = await service.ensureForOrder(amanaInProcess.id, admin!.id);
    assert(ensuredAgain?.created === false, 'second ensure no create');
    const historyCount = await prisma.amanaParcelTrackingHistory.count({
      where: { amanaParcelTrackingId: tracking!.id },
    });
    assert(historyCount === 1, 'history not duplicated on re-ensure');

    // Non-Amana delivery service still gets tracking (no delivery-service filter)
    const chronoEnsure = await service.ensureForOrder(chronoInProcess.id, admin!.id);
    assert(chronoEnsure?.created === true, 'non-amana delivery IN_PROCESS still initialized');

    // --- Status summary aggregation ---
    const overview = await service.listActive({ user: admin!, limit: 1 });
    assert(overview.summary, 'summary present');
    assert(overview.summary!.byStatus.length === 10, 'exactly 10 status buckets');
    assert(
      overview.summary!.byStatus.every((s) => typeof s.count === 'number' && s.count >= 0),
      'zero counts allowed'
    );
    assert(overview.summary!.consistent === true, 'totalActive === initialized + uninitialized');
    assert(
      overview.summary!.initialized + overview.summary!.uninitialized ===
        overview.summary!.totalActive,
      'sum matches totalActive'
    );
    const overviewFiltered = await service.listActive({
      user: admin!,
      limit: 1,
      status: 'ENVOI_EN_RETARD',
    });
    assert(
      overviewFiltered.summary!.totalActive === overview.summary!.totalActive,
      'status filter does not change overview totals'
    );

    // --- Active list eligibility ---
    const listAmana = await service.listActive({
      user: admin!,
      limit: 50,
      search: 'Amana Parcel Test Client',
    });
    assert(
      listAmana.data.some((r) => r.id === amanaInProcess.id),
      'amana IN_PROCESS listed'
    );

    const listChrono = await service.listActive({
      user: admin!,
      limit: 50,
      search: 'Chrono In Process',
    });
    assert(
      listChrono.data.some((r) => r.id === chronoInProcess.id),
      'non-amana delivery IN_PROCESS listed'
    );

    const listDelivered = await service.listActive({
      user: admin!,
      limit: 50,
      search: 'Amana Delivered',
    });
    assert(
      !listDelivered.data.some((r) => r.id === amanaDelivered.id),
      'amana DELIVERED hidden'
    );

    const listReturned = await service.listActive({
      user: admin!,
      limit: 50,
      search: 'Amana Returned',
    });
    assert(
      !listReturned.data.some((r) => r.id === amanaReturned.id),
      'amana RETURNED hidden'
    );

    // Sort: createdAt DESC — older createdAt should appear after newer
    const olderCreatedAt = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const older = await prisma.order.create({
      data: {
        userId: admin!.id,
        customerName: 'Older Amana',
        phone: '0611223399',
        city: 'Casablanca',
        status: OrderStatus.IN_PROCESS,
        totalAmount: 50,
        commission: 0,
        deliveryServiceId: amanaService.id,
        inProcessAt: olderCreatedAt,
        createdAt: olderCreatedAt,
        trackingCode: `SS2026OLD${Date.now()}MA`,
      },
    });
    await service.ensureForOrder(older.id, admin!.id);
    const list2 = await service.listActive({
      user: admin!,
      limit: 50,
      search: 'Older Amana',
    });
    assert(list2.data.some((r) => r.id === older.id), 'older listed');

    const sortedPair = await service.listActive({
      user: admin!,
      limit: 200,
      city: 'Casablanca',
    });
    const pairIndexes = [amanaInProcess.id, older.id].map((id) =>
      sortedPair.data.findIndex((r) => r.id === id)
    );
    assert(pairIndexes.every((i) => i >= 0), 'both sort test rows on page');
    assert(pairIndexes[0] < pairIndexes[1], 'newer createdAt first');

    // Outside last 3 months → hidden
    const tooOld = await prisma.order.create({
      data: {
        userId: admin!.id,
        customerName: 'Too Old Amana Window',
        phone: '0611223377',
        city: 'Casablanca',
        status: OrderStatus.IN_PROCESS,
        totalAmount: 10,
        commission: 0,
        deliveryServiceId: amanaService.id,
        inProcessAt: new Date(),
        createdAt: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000),
        trackingCode: `SS2026TOOOLD${Date.now()}MA`,
      },
    });
    await service.ensureForOrder(tooOld.id, admin!.id);
    const tooOldList = await service.listActive({
      user: admin!,
      limit: 50,
      search: 'Too Old Amana Window',
    });
    assert(
      !tooOldList.data.some((r) => r.id === tooOld.id),
      'orders older than 3 months hidden'
    );

    // --- Excel export scope ---
    const exportAll = await service.listForExport({ user: admin! });
    const listTotal = (await service.listActive({ user: admin!, limit: 1 })).meta.total;
    assert(exportAll.total === listTotal, 'unfiltered export covers all list pages');
    assert(exportAll.data.length === listTotal, 'export returns every matching row');
    assert(
      new Set(exportAll.data.map((r) => r.id)).size === exportAll.data.length,
      'export has no duplicate orders'
    );
    assert(!exportAll.data.some((r) => r.id === tooOld.id), 'export respects 3-month window');
    assert(
      !exportAll.data.some((r) => r.id === amanaDelivered.id),
      'export respects IN_PROCESS eligibility'
    );

    const exportSearch = await service.listForExport({
      user: admin!,
      search: 'Amana Parcel Test Client',
    });
    const searched = exportSearch.data.find((r) => r.id === amanaInProcess.id);
    assert(searched, 'export respects search');
    assert(
      exportSearch.data.every((r) => r.customerName.includes('Amana Parcel Test Client')),
      'search scope only'
    );
    assert(
      searched!.amanaStatus?.label === 'Envoi sorti à destination',
      'export uses French status label'
    );

    const exportCity = await service.listForExport({ user: admin!, city: 'Casablanca' });
    assert(exportCity.data.length > 0, 'city export non-empty');
    assert(exportCity.data.every((r) => r.city === 'Casablanca'), 'export respects city');

    const exportUninit = await service.listForExport({ user: admin!, status: 'UNINITIALIZED' });
    assert(exportUninit.data.every((r) => r.amanaStatus === null), 'UNINITIALIZED export scope');

    const exportSelected = await service.listForExport({
      user: admin!,
      orderIds: [amanaInProcess.id, amanaInProcess.id, older.id, amanaDelivered.id, tooOld.id],
    });
    const selectedIds = exportSelected.data.map((r) => r.id).sort((a, b) => a - b);
    assert(
      JSON.stringify(selectedIds) ===
        JSON.stringify([amanaInProcess.id, older.id].sort((a, b) => a - b)),
      'selected export: only eligible selected ids, deduplicated'
    );

    let emptyIdsRejected = false;
    try {
      await service.listForExport({ user: admin!, orderIds: [] });
    } catch (e) {
      emptyIdsRejected =
        e instanceof AmanaParcelTrackingError && e.code === 'INVALID_EXPORT_IDS';
    }
    assert(emptyIdsRejected, 'empty selection rejected');

    await prisma.amanaParcelTrackingHistory.deleteMany({
      where: { tracking: { orderId: tooOld.id } },
    });
    await prisma.amanaParcelTracking.deleteMany({ where: { orderId: tooOld.id } });
    await prisma.order.delete({ where: { id: tooOld.id } });

    // --- Status update any→any + no stock mutation ---
    const invBefore = await snapshotInventory();
    const orderBefore = await prisma.order.findUnique({
      where: { id: amanaInProcess.id },
      select: { status: true, inProcessAt: true, deliveredAt: true },
    });

    const upd1 = await service.updateStatus(
      amanaInProcess.id,
      admin!,
      AmanaParcelStatus.ENVOI_EN_RETARD,
      'retard note'
    );
    assert(upd1.changed === true, 'status changed');
    assert(upd1.tracking.status.code === 'ENVOI_EN_RETARD', 'new status');

    const histAfter1 = await prisma.amanaParcelTrackingHistory.count({
      where: { amanaParcelTrackingId: tracking!.id },
    });
    assert(histAfter1 === 2, 'second history entry');

    const same = await service.updateStatus(
      amanaInProcess.id,
      admin!,
      AmanaParcelStatus.ENVOI_EN_RETARD
    );
    assert(same.changed === false, 'same status no change');
    assert(
      (await prisma.amanaParcelTrackingHistory.count({
        where: { amanaParcelTrackingId: tracking!.id },
      })) === 2,
      'no duplicate history on same status'
    );

    // Backward / any→any
    const upd2 = await service.updateStatus(
      amanaInProcess.id,
      admin!,
      AmanaParcelStatus.SORTI_PAR_FACTEUR
    );
    assert(upd2.changed === true, 'any→any allowed');

    // --- Current-status note (Smart Copy) ---
    const noteAfterNoNoteUpdate = await service.listForExport({
      user: admin!,
      orderIds: [amanaInProcess.id],
    });
    assert(
      noteAfterNoNoteUpdate.data[0].currentStatusNote === null,
      'current status without note → null (older status note not reused)'
    );
    await service.updateStatus(
      amanaInProcess.id,
      admin!,
      AmanaParcelStatus.ENVOI_EN_RETARD,
      '  retard note 2  '
    );
    const noteAfterRetard2 = await service.listForExport({
      user: admin!,
      orderIds: [amanaInProcess.id, older.id],
    });
    const retardRow = noteAfterRetard2.data.find((r) => r.id === amanaInProcess.id)!;
    assert(retardRow.amanaStatus?.code === 'ENVOI_EN_RETARD', 'export status current');
    assert(
      retardRow.currentStatusNote === 'retard note 2',
      'latest current-status note used, not the older same-status note'
    );
    assert(
      noteAfterRetard2.data.find((r) => r.id === older.id)!.currentStatusNote === null,
      'notes stay attached to their own order'
    );

    const orderAfter = await prisma.order.findUnique({
      where: { id: amanaInProcess.id },
      select: { status: true, inProcessAt: true, deliveredAt: true },
    });
    assert(orderAfter!.status === orderBefore!.status, 'Order.status unchanged');
    assert(
      orderAfter!.inProcessAt?.getTime() === orderBefore!.inProcessAt?.getTime(),
      'inProcessAt unchanged'
    );
    assert(
      (orderAfter!.deliveredAt?.getTime() ?? null) ===
        (orderBefore!.deliveredAt?.getTime() ?? null),
      'deliveredAt unchanged'
    );

    const invAfter = await snapshotInventory();
    assert(
      JSON.stringify(invBefore) === JSON.stringify(invAfter),
      'inventory snapshot unchanged'
    );

    // Invalid status
    let invalidRejected = false;
    try {
      await service.updateStatus(amanaInProcess.id, admin!, 'IN_TRANSIT');
    } catch (e) {
      invalidRejected =
        e instanceof AmanaParcelTrackingError && e.code === 'INVALID_STATUS';
    }
    assert(invalidRejected, 'invalid status rejected');

    // Sales forbidden
    if (sales) {
      let salesForbidden = false;
      try {
        await service.updateStatus(
          amanaInProcess.id,
          sales,
          AmanaParcelStatus.LIVREE
        );
      } catch (e) {
        salesForbidden =
          e instanceof AmanaParcelTrackingError && e.code === 'FORBIDDEN';
      }
      assert(salesForbidden, 'SALES cannot update');
    } else {
      console.warn('SKIP: no SALES user for permission check');
    }

    // SUIVI allowed (if present and can access — admin-created order may need assignment)
    if (suivi) {
      // Assign suivi to amana service for access
      await prisma.userDeliveryService.upsert({
        where: {
          userId_deliveryServiceId: {
            userId: suivi.id,
            deliveryServiceId: amanaService.id,
          },
        },
        create: { userId: suivi.id, deliveryServiceId: amanaService.id },
        update: {},
      });
      const suiviUpd = await service.updateStatus(
        amanaInProcess.id,
        suivi,
        AmanaParcelStatus.A_RECUPERER,
        'suivi note'
      );
      assert(suiviUpd.changed === true, 'SUIVI can update');
    } else {
      console.warn('SKIP: no SUIVI user for permission check');
    }

    // --- Leave IN_PROCESS: hidden from list, history preserved ---
    await prisma.order.update({
      where: { id: amanaInProcess.id },
      data: { status: OrderStatus.DELIVERED, deliveredAt: new Date() },
    });
    const listAfterLeave = await service.listActive({ user: admin!, limit: 200 });
    assert(
      !listAfterLeave.data.some((r) => r.id === amanaInProcess.id),
      'left IN_PROCESS → hidden'
    );
    const preserved = await prisma.amanaParcelTracking.findUnique({
      where: { orderId: amanaInProcess.id },
      include: { history: true },
    });
    assert(preserved, 'tracking preserved after leave');
    assert(preserved!.history.length >= 2, 'history preserved');

    const detail = await service.getByOrderId(amanaInProcess.id, admin!);
    assert(detail.amanaTracking, 'detail still returns tracking');
    assert(detail.orderStatus === OrderStatus.DELIVERED, 'detail shows delivered');

    // --- Re-enter IN_PROCESS: no reset ---
    const statusBeforeReentry = preserved!.status;
    const historyLenBefore = preserved!.history.length;
    await prisma.order.update({
      where: { id: amanaInProcess.id },
      data: { status: OrderStatus.IN_PROCESS },
    });
    const reEnsure = await service.ensureForOrder(amanaInProcess.id, admin!.id);
    assert(reEnsure?.created === false, 're-entry does not recreate');
    const afterReentry = await prisma.amanaParcelTracking.findUnique({
      where: { orderId: amanaInProcess.id },
      include: { history: true },
    });
    assert(afterReentry!.status === statusBeforeReentry, 'status preserved on re-entry');
    assert(
      afterReentry!.history.length === historyLenBefore,
      'history length preserved on re-entry'
    );
    assert(
      afterReentry!.initialStatusAt.getTime() === inProcessAt.getTime(),
      'initialStatusAt still original inProcessAt'
    );

    // --- Backfill idempotent ---
    const missing = await prisma.order.create({
      data: {
        userId: admin!.id,
        customerName: 'Backfill Target',
        phone: '0611223388',
        city: 'Casablanca',
        status: OrderStatus.IN_PROCESS,
        totalAmount: 10,
        commission: 0,
        deliveryServiceId: amanaService.id,
        inProcessAt: new Date('2026-11-05T08:00:00.000Z'),
        trackingCode: `SS2026BF${Date.now()}MA`,
      },
    });
    // Legacy: IN_PROCESS with null inProcessAt → createdAt fallback
    const legacyCreatedAt = new Date('2026-10-01T09:30:00.000Z');
    const legacyNullInProcess = await prisma.order.create({
      data: {
        userId: admin!.id,
        customerName: 'Legacy Null InProcessAt',
        phone: '0611223366',
        city: 'Casablanca',
        status: OrderStatus.IN_PROCESS,
        totalAmount: 10,
        commission: 0,
        deliveryServiceId: amanaService.id,
        inProcessAt: null,
        createdAt: legacyCreatedAt,
        trackingCode: `SS2026LEG${Date.now()}MA`,
      },
    });
    const orderBeforeLegacy = await prisma.order.findUnique({
      where: { id: legacyNullInProcess.id },
      select: { inProcessAt: true, createdAt: true, status: true },
    });
    assert(orderBeforeLegacy?.inProcessAt === null, 'legacy baseline null inProcessAt');

    const legacyEnsure = await service.ensureForOrder(legacyNullInProcess.id, admin!.id);
    assert(legacyEnsure?.created === true, 'legacy ensure creates');
    assert(legacyEnsure?.initialAtSource === 'createdAt', 'legacy uses createdAt source');
    const legacyTracking = await prisma.amanaParcelTracking.findUnique({
      where: { orderId: legacyNullInProcess.id },
      include: { history: true },
    });
    assert(legacyTracking, 'legacy tracking exists');
    assert(
      legacyTracking!.initialStatusAt.getTime() === legacyCreatedAt.getTime(),
      'legacy initialStatusAt === createdAt'
    );
    assert(
      legacyTracking!.history[0]?.changedAt.getTime() === legacyCreatedAt.getTime(),
      'legacy history changedAt === createdAt'
    );
    const orderAfterLegacy = await prisma.order.findUnique({
      where: { id: legacyNullInProcess.id },
      select: { inProcessAt: true, createdAt: true, status: true },
    });
    assert(orderAfterLegacy?.inProcessAt === null, 'Order.inProcessAt not written');
    assert(
      orderAfterLegacy?.createdAt.getTime() === orderBeforeLegacy!.createdAt.getTime(),
      'Order.createdAt unchanged'
    );
    assert(orderAfterLegacy?.status === OrderStatus.IN_PROCESS, 'Order.status unchanged');

    const bf1 = await service.backfillMissingForActiveAmanaOrders(admin!.id);
    assert(bf1.created >= 1, 'backfill created at least one');
    assert(typeof bf1.usedInProcessAt === 'number', 'backfill reports usedInProcessAt');
    assert(typeof bf1.usedCreatedAtFallback === 'number', 'backfill reports usedCreatedAtFallback');
    assert(
      bf1.usedInProcessAt + bf1.usedCreatedAtFallback === bf1.created,
      'backfill source counts sum to created'
    );
    const bf2 = await service.backfillMissingForActiveAmanaOrders(admin!.id);
    assert(bf2.created === 0, 'second backfill creates zero');
    assert(bf2.usedInProcessAt === 0 && bf2.usedCreatedAtFallback === 0, 'second backfill zero sources');
    const bfTracking = await prisma.amanaParcelTracking.findUnique({
      where: { orderId: missing.id },
    });
    assert(bfTracking?.status === AmanaParcelStatus.SORTI_A_DESTINATION, 'backfill status');
    // missing had inProcessAt set → should have been counted as inProcessAt on first ensure via backfill
    assert(
      bfTracking!.initialStatusAt.getTime() ===
        new Date('2026-11-05T08:00:00.000Z').getTime(),
      'backfill with inProcessAt uses inProcessAt'
    );

    // cleanup older + missing + legacy
    const cleanupIds = [older.id, missing.id, legacyNullInProcess.id];
    await prisma.amanaParcelTrackingHistory.deleteMany({
      where: { tracking: { orderId: { in: cleanupIds } } },
    });
    await prisma.amanaParcelTracking.deleteMany({
      where: { orderId: { in: cleanupIds } },
    });
    await prisma.order.deleteMany({ where: { id: { in: cleanupIds } } });

    console.log('Amana parcel tracking checks OK');
  } finally {
    // Cleanup test rows
    const orderIds = [
      amanaInProcess.id,
      amanaDelivered.id,
      chronoInProcess.id,
      amanaReturned.id,
    ];
    await prisma.amanaParcelTrackingHistory.deleteMany({
      where: { tracking: { orderId: { in: orderIds } } },
    });
    await prisma.amanaParcelTracking.deleteMany({
      where: { orderId: { in: orderIds } },
    });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.userDeliveryService.deleteMany({
      where: { deliveryServiceId: { in: [amanaService.id, otherService.id] } },
    });
    await prisma.deliveryService.deleteMany({
      where: { id: { in: [amanaService.id, otherService.id] } },
    });
    await prisma.$disconnect();
  }
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
