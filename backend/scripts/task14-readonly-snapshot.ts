/**
 * TASK 14 — READ-ONLY production snapshot. No mutations.
 */
import { PrismaClient, OrderStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const settings = await prisma.inventoryCutoverSettings.findUnique({ where: { id: 1 } });
  const inventoryMode = settings?.mode ?? 'LEGACY (missing row)';

  const [
    pillowCount,
    pillowAgg,
    pillowHistoryCount,
    locationCount,
    balanceCount,
    movementCount,
    transferCount,
    transferLineCount,
    stockDocumentCount,
    stockDocumentLineCount,
    reservationCount,
    reservationLineCount,
    orderCount,
    pillowOrderCount,
    orderPillowItemCount,
    pillowOrderItemCount,
  ] = await Promise.all([
    prisma.pillow.count(),
    prisma.pillow.aggregate({ _sum: { stock: true } }),
    prisma.pillowStockHistory.count(),
    prisma.location.count(),
    prisma.inventoryBalance.count(),
    prisma.stockMovement.count(),
    prisma.transfer.count(),
    prisma.transferLine.count(),
    prisma.stockDocument.count(),
    prisma.stockDocumentLine.count(),
    prisma.reservation.count(),
    prisma.reservationLine.count(),
    prisma.order.count(),
    prisma.pillowOrder.count(),
    prisma.orderPillowItem.count(),
    prisma.pillowOrderItem.count(),
  ]);

  const openStatuses: OrderStatus[] = [
    OrderStatus.PENDING,
    OrderStatus.IN_PROCESS,
  ];

  const openOrdersWithAccessories = await prisma.order.findMany({
    where: {
      status: { in: openStatuses },
      pillowItems: { some: {} },
    },
    select: {
      id: true,
      status: true,
      locationId: true,
      createdAt: true,
      pillowItems: {
        select: {
          id: true,
          pillowId: true,
          quantity: true,
          pillow: { select: { id: true, name: true, stock: true } },
        },
      },
    },
    orderBy: { id: 'asc' },
  });

  const openPillowOrders = await prisma.pillowOrder.findMany({
    where: {
      status: { in: openStatuses },
    },
    select: {
      id: true,
      status: true,
      locationId: true,
      createdAt: true,
      items: {
        select: {
          id: true,
          pillowId: true,
          quantity: true,
          pillow: { select: { id: true, name: true, stock: true } },
        },
      },
    },
    orderBy: { id: 'asc' },
  });

  const deliveredWithAccessories = await prisma.order.count({
    where: {
      status: OrderStatus.DELIVERED,
      pillowItems: { some: {} },
    },
  });

  const returnedWithAccessories = await prisma.order.count({
    where: {
      status: OrderStatus.RETURNED,
      pillowItems: { some: {} },
    },
  });

  console.log('=== TASK 14 READ-ONLY SNAPSHOT ===');
  console.log(JSON.stringify({
    inventoryMode,
    cutoverSettings: settings,
    Pillow: pillowCount,
    'Pillow.stock SUM': pillowAgg._sum.stock,
    PillowStockHistory: pillowHistoryCount,
    Location: locationCount,
    InventoryBalance: balanceCount,
    StockMovement: movementCount,
    Transfer: transferCount,
    TransferLine: transferLineCount,
    StockDocument: stockDocumentCount,
    StockDocumentLine: stockDocumentLineCount,
    Reservation: reservationCount,
    ReservationLine: reservationLineCount,
    Order: orderCount,
    PillowOrder: pillowOrderCount,
    OrderPillowItem: orderPillowItemCount,
    PillowOrderItem: pillowOrderItemCount,
    openMattressOrdersWithAccessories: openOrdersWithAccessories.length,
    openPillowOrders: openPillowOrders.length,
    deliveredOrdersWithAccessories: deliveredWithAccessories,
    returnedOrdersWithAccessories: returnedWithAccessories,
  }, null, 2));

  console.log('\n=== OPEN ORDER ACCESSORIES (PENDING/IN_PROCESS) ===');
  console.log(JSON.stringify(openOrdersWithAccessories, null, 2));

  console.log('\n=== OPEN PILLOW ORDERS (PENDING/IN_PROCESS) ===');
  console.log(JSON.stringify(openPillowOrders, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
