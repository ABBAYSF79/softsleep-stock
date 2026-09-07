/**
 * Extended snapshot for TASK 4 validation.
 */
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const pillowCount = await prisma.pillow.count();
  const stockSum = await prisma.pillow.aggregate({ _sum: { stock: true } });
  const historyCount = await prisma.pillowStockHistory.count();
  const locationCount = await prisma.location.count();

  let balanceCount = 0;
  let movementCount = 0;
  try {
    balanceCount = await prisma.inventoryBalance.count();
  } catch {
    balanceCount = -1;
  }
  try {
    movementCount = await prisma.stockMovement.count();
  } catch {
    movementCount = -1;
  }

  console.log(
    JSON.stringify({
      pillow_count: pillowCount,
      pillow_stock_sum: stockSum._sum.stock ?? 0,
      history_count: historyCount,
      location_count: locationCount,
      inventory_balance_count: balanceCount,
      stock_movement_count: movementCount,
    })
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
