/**
 * Idempotent seed for accessory inventory locations (TASK 2).
 * Safe to run multiple times — does NOT touch Pillow.stock.
 *
 * Usage: npx ts-node scripts/seed-locations.ts
 */
import { PrismaClient, LocationType } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

export const DEFAULT_LOCATIONS: Array<{
  code: string;
  name: string;
  type: LocationType;
  active: boolean;
  isSellable: boolean;
  allowsPresentation: boolean;
  sortOrder: number;
}> = [
  {
    code: 'WH-MAIN',
    name: 'Entrepôt principal',
    type: 'WAREHOUSE',
    active: true,
    isSellable: true,
    allowsPresentation: false,
    sortOrder: 10,
  },
  {
    code: 'SR-MAIN',
    name: 'Showroom principal',
    type: 'SHOWROOM',
    active: true,
    isSellable: true,
    allowsPresentation: true,
    sortOrder: 20,
  },
];

export async function seedLocations(client: PrismaClient = prisma) {
  for (const loc of DEFAULT_LOCATIONS) {
    await client.location.upsert({
      where: { code: loc.code },
      create: loc,
      update: {
        name: loc.name,
        type: loc.type,
        active: loc.active,
        isSellable: loc.isSellable,
        allowsPresentation: loc.allowsPresentation,
        sortOrder: loc.sortOrder,
      },
    });
  }
  return client.location.findMany({
    where: { code: { in: DEFAULT_LOCATIONS.map((l) => l.code) } },
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
  });
}

async function main() {
  console.log('Seeding inventory locations (idempotent)…');
  const rows = await seedLocations();
  console.log(
    JSON.stringify(
      rows.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        type: r.type,
        active: r.active,
        isSellable: r.isSellable,
        allowsPresentation: r.allowsPresentation,
        sortOrder: r.sortOrder,
      })),
      null,
      2
    )
  );
  const count = await prisma.location.count();
  console.log(`Location table row count: ${count}`);
}

if (require.main === module) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
