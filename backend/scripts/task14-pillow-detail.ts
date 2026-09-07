import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const pillows = await prisma.pillow.findMany({
    select: { id: true, name: true, stock: true },
  });
  const hist = await prisma.pillowStockHistory.findMany({
    orderBy: { id: 'desc' },
    take: 14,
    select: {
      id: true,
      pillowId: true,
      quantity: true,
      type: true,
      reason: true,
      previousStock: true,
      newStock: true,
      createdAt: true,
    },
  });
  const locs = await prisma.location.findMany({
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      active: true,
      isSellable: true,
      allowsPresentation: true,
    },
  });
  console.log(JSON.stringify({ pillows, locations: locs, recentHistory: hist }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
