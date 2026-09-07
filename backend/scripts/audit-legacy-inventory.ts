/**
 * One-shot legacy inventory audit (read-only).
 * Usage: npx ts-node scripts/audit-legacy-inventory.ts
 */
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const pillows = await prisma.pillow.findMany({ orderBy: { id: 'asc' } });
  const report: any[] = [];

  for (const pillow of pillows) {
    const hist = await prisma.pillowStockHistory.findMany({
      where: { pillowId: pillow.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    const byType: Record<string, number> = {};
    for (const h of hist) {
      byType[h.type] = (byType[h.type] || 0) + h.quantity;
    }

    const reconstructed =
      (byType.INITIAL || 0) +
      (byType.SUPPLY || 0) +
      (byType.OUTGOING || 0) +
      (byType.ADJUSTMENT || 0);

    const poi = await prisma.pillowOrderItem.findMany({
      where: { pillowId: pillow.id },
      include: { order: { select: { id: true, status: true, createdAt: true } } },
    });
    const opi = await prisma.orderPillowItem.findMany({
      where: { pillowId: pillow.id },
      include: { order: { select: { id: true, status: true, createdAt: true } } },
    });

    // Scan history reasons for location keywords (evidence only)
    const locationHints = hist
      .filter((h) => {
        const r = (h.reason || '').toLowerCase();
        return (
          r.includes('warehouse') ||
          r.includes('showroom') ||
          r.includes('entrepot') ||
          r.includes('entrepôt') ||
          r.includes('wh-') ||
          r.includes('sr-')
        );
      })
      .map((h) => ({ id: h.id, reason: h.reason, type: h.type }));

    report.push({
      id: pillow.id,
      name: pillow.name,
      sku: null,
      stock: pillow.stock,
      price: String(pillow.price),
      historyCount: hist.length,
      byType,
      reconstructed,
      match: reconstructed === pillow.stock,
      difference: pillow.stock - reconstructed,
      locationHints,
      pillowOrderItemQty: poi.reduce((s, x) => s + x.quantity, 0),
      pillowOrderItems: poi.map((x) => ({
        orderId: x.orderId,
        qty: x.quantity,
        status: x.order.status,
      })),
      orderPillowItemQty: opi.reduce((s, x) => s + x.quantity, 0),
      orderPillowItems: opi.map((x) => ({
        orderId: x.orderId,
        qty: x.quantity,
        status: x.order.status,
      })),
      histories: hist.map((h) => ({
        id: h.id,
        type: h.type,
        qty: h.quantity,
        prev: h.previousStock,
        next: h.newStock,
        reason: h.reason,
        at: h.createdAt,
        userId: h.userId,
      })),
    });
  }

  const locations = await prisma.location.findMany({ orderBy: { sortOrder: 'asc' } });
  const balances = await prisma.inventoryBalance.count();
  const movements = await prisma.stockMovement.count();
  const migrated = await prisma.stockMovement.count({
    where: { referenceType: 'LEGACY_INVENTORY_MIGRATION_V1' },
  });

  console.log(
    JSON.stringify(
      {
        pillows: report,
        locations,
        inventoryBalanceCount: balances,
        stockMovementCount: movements,
        existingMigrationMovements: migrated,
        totals: {
          pillowCount: pillows.length,
          stockSum: pillows.reduce((s, p) => s + p.stock, 0),
          historyCount: report.reduce((s, p) => s + p.historyCount, 0),
        },
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
