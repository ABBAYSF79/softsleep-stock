/**
 * Smoke-test GET locations logic (auth omitted) — validates seed + query shape.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const locations = await prisma.location.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      active: true,
      isSellable: true,
      allowsPresentation: true,
      sortOrder: true,
    },
  });

  console.log(JSON.stringify(locations, null, 2));
  if (locations.length !== 2) {
    throw new Error(`Expected 2 active locations, got ${locations.length}`);
  }
  if (locations[0]?.code !== 'WH-MAIN' || locations[1]?.code !== 'SR-MAIN') {
    throw new Error('Unexpected location codes/order');
  }
  console.log('LOCATION_QUERY_OK');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
