/**
 * Read-only preview of a future InventoryBalance stock migration.
 * Does NOT create/update/delete any rows. Does NOT touch Pillow.stock.
 *
 * Usage: npx ts-node scripts/inventory-balance-preview.ts
 */
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { computeAvailable } from '../src/utils/inventory-balance';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const pillows = await prisma.pillow.findMany({
    orderBy: { id: 'asc' },
    select: { id: true, name: true, stock: true },
  });

  const locations = await prisma.location.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    select: { id: true, code: true, name: true, type: true },
  });

  const existingBalances = await prisma.inventoryBalance.findMany({
    select: {
      pillowId: true,
      locationId: true,
      physical: true,
      presentation: true,
      reserved: true,
    },
  });

  const balanceKey = (pillowId: number, locationId: number) => `${pillowId}:${locationId}`;
  const balanceMap = new Map(
    existingBalances.map((b) => [
      balanceKey(b.pillowId, b.locationId),
      b,
    ])
  );

  const warehouse = locations.find((l) => l.code === 'WH-MAIN');
  const showroom = locations.find((l) => l.code === 'SR-MAIN');

  console.log('=== INVENTORY MIGRATION PREVIEW ===');
  console.log('(read-only — no stock assignment performed)');
  console.log('');
  console.log(`Locations found: ${locations.map((l) => l.code).join(', ') || '(none)'}`);
  console.log(`Existing InventoryBalance rows: ${existingBalances.length}`);
  console.log('');

  let legacyTotal = 0;

  for (const pillow of pillows) {
    legacyTotal += pillow.stock;
    console.log(`Pillow: ${pillow.id} ${pillow.name}`);
    console.log(`Legacy stock: ${pillow.stock}`);
    console.log('');

    for (const label of [
      { loc: warehouse, title: 'Warehouse' },
      { loc: showroom, title: 'Showroom' },
    ] as const) {
      const loc = label.loc;
      if (!loc) {
        console.log(`${label.title}:`);
        console.log('  (location not found)');
        console.log('');
        continue;
      }

      const existing = balanceMap.get(balanceKey(pillow.id, loc.id));
      const physical = existing?.physical ?? 0;
      const presentation = existing?.presentation ?? 0;
      const reserved = existing?.reserved ?? 0;
      const available = computeAvailable(physical, presentation, reserved);

      console.log(`${label.title} (${loc.code}):`);
      console.log(`  physical: ${physical}`);
      console.log(`  presentation: ${presentation}`);
      console.log(`  reserved: ${reserved}`);
      console.log(`  available: ${available}`);
      console.log('');
    }

    console.log(`Company legacy stock:`);
    console.log(`  ${pillow.stock}`);
    console.log('');
    console.log(`Proposed physical allocation:`);
    console.log(`  NOT ASSIGNED`);
    console.log('');
    console.log('---');
    console.log('');
  }

  console.log(`SUM(Pillow.stock) legacy total: ${legacyTotal}`);
  console.log('Preview complete. No database writes performed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
