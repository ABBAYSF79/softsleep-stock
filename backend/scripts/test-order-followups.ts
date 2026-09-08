/**
 * TASK 16 — Order follow-up journal tests.
 * Creates disposable Order / PillowOrder rows and cleans them up.
 * Asserts no inventory / status / note mutation.
 *
 * Usage: npm run test:order-followups
 */
import { PrismaClient, UserRole } from '@prisma/client';
import dotenv from 'dotenv';
import {
  FOLLOWUP_CONTENT_MAX,
  normalizeFollowUpContent,
  OrderFollowUpError,
  OrderFollowUpService,
} from '../src/services/OrderFollowUpService';

dotenv.config();

const prisma = new PrismaClient();
const service = new OrderFollowUpService(prisma);

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
}

async function snapshotInventory() {
  return {
    pillowStockSum: (await prisma.pillow.aggregate({ _sum: { stock: true } }))._sum.stock ?? 0,
    balanceCount: await prisma.inventoryBalance.count(),
    movementCount: await prisma.stockMovement.count(),
    reservationCount: await prisma.reservation.count(),
    transferCount: await prisma.transfer.count(),
  };
}

async function main() {
  console.log('Running TASK 16 order follow-up checks…');

  const admin = await prisma.user.findFirst({ where: { role: UserRole.ADMIN } });
  assert(admin, 'need admin user');

  // --- Validation unit ---
  {
    let emptyFailed = false;
    try {
      normalizeFollowUpContent('   ');
    } catch (e) {
      emptyFailed = e instanceof OrderFollowUpError && e.code === 'EMPTY_CONTENT';
    }
    assert(emptyFailed, 'whitespace-only rejected');

    let nonStringFailed = false;
    try {
      normalizeFollowUpContent(null);
    } catch (e) {
      nonStringFailed = e instanceof OrderFollowUpError;
    }
    assert(nonStringFailed, 'non-string rejected');

    assert(normalizeFollowUpContent('  hello  ') === 'hello', 'trim works');

    let tooLong = false;
    try {
      normalizeFollowUpContent('x'.repeat(FOLLOWUP_CONTENT_MAX + 1));
    } catch (e) {
      tooLong = e instanceof OrderFollowUpError && e.code === 'CONTENT_TOO_LONG';
    }
    assert(tooLong, 'too long rejected');
  }

  const invBefore = await snapshotInventory();

  const order = await prisma.order.create({
    data: {
      userId: admin.id,
      customerName: 'TASK16 FollowUp Test',
      phone: '0600000016',
      address: 'test',
      city: 'Casablanca',
      status: 'PENDING',
      totalAmount: 100,
      commission: 0,
      note: 'EXISTING_NOTE_MUST_STAY',
    },
  });

  const pillowOrder = await prisma.pillowOrder.create({
    data: {
      userId: admin.id,
      customerName: 'TASK16 Pillow FollowUp',
      status: 'PENDING',
      totalAmount: 50,
    },
  });

  try {
    const beforeOrder = await prisma.order.findUnique({ where: { id: order.id } });
    assert(beforeOrder?.note === 'EXISTING_NOTE_MUST_STAY', 'note baseline');
    assert(beforeOrder?.status === 'PENDING', 'status baseline');

    const a = await service.createForOrder(order.id, admin, 'Commande خرجات مع livreur.');
    const b = await service.createForOrder(order.id, admin, 'Client طلب التأجيل.');
    assert(a.id !== b.id, 'two distinct follow-ups');
    assert(a.content.includes('livreur'), 'content preserved');

    const list = await service.listForOrder(order.id, admin);
    assert(list.length >= 2, 'multiple follow-ups remain');
    assert(list[0].createdAt >= list[1].createdAt, 'newest → oldest');
    assert(list.every((r) => r.orderId === order.id && r.pillowOrderId == null), 'order parent only');

    const afterOrder = await prisma.order.findUnique({ where: { id: order.id } });
    assert(afterOrder?.status === 'PENDING', 'Order.status unchanged');
    assert(afterOrder?.note === 'EXISTING_NOTE_MUST_STAY', 'Order.note unchanged');

    const p1 = await service.createForPillowOrder(
      pillowOrder.id,
      admin,
      'Pillow order out for delivery'
    );
    assert(p1.pillowOrderId === pillowOrder.id && p1.orderId == null, 'pillow parent only');
    const pillowList = await service.listForPillowOrder(pillowOrder.id, admin);
    assert(pillowList.length >= 1, 'pillow history');

    const afterPillow = await prisma.pillowOrder.findUnique({ where: { id: pillowOrder.id } });
    assert(afterPillow?.status === 'PENDING', 'PillowOrder.status unchanged');

    // Concurrent creates
    const [c1, c2] = await Promise.all([
      service.createForOrder(order.id, admin, 'Concurrent A'),
      service.createForOrder(order.id, admin, 'Concurrent B'),
    ]);
    assert(c1.id !== c2.id, 'concurrent both exist');
    const afterConcurrent = await service.listForOrder(order.id, admin);
    assert(
      afterConcurrent.some((r) => r.content === 'Concurrent A') &&
        afterConcurrent.some((r) => r.content === 'Concurrent B'),
      'no lost concurrent update'
    );

    // Forbidden: unknown order
    let notFound = false;
    try {
      await service.listForOrder(99999999, admin);
    } catch (e) {
      notFound = e instanceof OrderFollowUpError && e.code === 'NOT_FOUND';
    }
    assert(notFound, 'unknown order 404');

    const invAfter = await snapshotInventory();
    assert(
      JSON.stringify(invBefore) === JSON.stringify(invAfter),
      'inventory snapshot unchanged'
    );

    console.log('TASK 16 follow-up checks OK');
  } finally {
    await prisma.orderFollowUp.deleteMany({
      where: { OR: [{ orderId: order.id }, { pillowOrderId: pillowOrder.id }] },
    });
    await prisma.order.delete({ where: { id: order.id } }).catch(() => undefined);
    await prisma.pillowOrder.delete({ where: { id: pillowOrder.id } }).catch(() => undefined);
    await prisma.$disconnect();
  }
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
