/**
 * Focused TASK 3 checks (no lasting stock/balance mutation).
 * Usage: npx ts-node scripts/test-inventory-balance.ts
 */
import { PrismaClient, Prisma } from '@prisma/client';
import dotenv from 'dotenv';
import { computeAvailable } from '../src/utils/inventory-balance';

dotenv.config();

const prisma = new PrismaClient();

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
}

async function testAvailableFormula() {
  assert(computeAvailable(10, 2, 3) === 5, 'available should be 5');
  assert(computeAvailable(0, 0, 0) === 0, 'available zero');
  console.log('Test B PASS — computeAvailable(10,2,3) === 5');
}

async function testUniqueConstraint() {
  const pillow = await prisma.pillow.findFirst({ orderBy: { id: 'asc' } });
  const location = await prisma.location.findFirst({ where: { code: 'WH-MAIN' } });
  assert(pillow, 'need at least one pillow');
  assert(location, 'need WH-MAIN location');

  const existing = await prisma.inventoryBalance.findUnique({
    where: {
      pillowId_locationId: { pillowId: pillow.id, locationId: location.id },
    },
  });

  const beforeStock = pillow.stock;
  const beforeHistory = await prisma.pillowStockHistory.count();
  const beforeBalances = await prisma.inventoryBalance.count();

  let duplicateRejected = false;

  if (existing) {
    // Pair already exists — second create must fail with P2002 (no writes kept)
    try {
      await prisma.inventoryBalance.create({
        data: {
          pillowId: pillow.id,
          locationId: location.id,
          physical: 0,
          presentation: 0,
          reserved: 0,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        duplicateRejected = true;
      } else {
        throw e;
      }
    }
  } else {
    // Create twice inside one transaction — duplicate fails and rolls back both
    try {
      await prisma.$transaction(async (tx) => {
        await tx.inventoryBalance.create({
          data: {
            pillowId: pillow.id,
            locationId: location.id,
            physical: 0,
            presentation: 0,
            reserved: 0,
          },
        });
        await tx.inventoryBalance.create({
          data: {
            pillowId: pillow.id,
            locationId: location.id,
            physical: 0,
            presentation: 0,
            reserved: 0,
          },
        });
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        duplicateRejected = true;
      } else {
        throw e;
      }
    }
  }

  assert(duplicateRejected, 'duplicate (pillowId, locationId) must be rejected');

  const afterStock = (await prisma.pillow.findUnique({ where: { id: pillow.id } }))!.stock;
  const afterHistory = await prisma.pillowStockHistory.count();
  const afterBalances = await prisma.inventoryBalance.count();

  assert(afterStock === beforeStock, 'Pillow.stock must be unchanged by unique test');
  assert(afterHistory === beforeHistory, 'PillowStockHistory count must be unchanged');
  assert(afterBalances === beforeBalances, 'InventoryBalance count must be unchanged');

  console.log('Test A PASS — unique (pillowId, locationId) rejected; no lasting writes');
}

async function testReadOnlyApiLogicDoesNotMutate() {
  const before = {
    stockSum: (await prisma.pillow.aggregate({ _sum: { stock: true } }))._sum.stock ?? 0,
    history: await prisma.pillowStockHistory.count(),
    balances: await prisma.inventoryBalance.count(),
  };

  const rows = await prisma.inventoryBalance.findMany({
    include: {
      pillow: { select: { id: true, name: true } },
      location: { select: { id: true, code: true, name: true, type: true } },
    },
  });
  const mapped = rows.map((r) => ({
    available: computeAvailable(r.physical, r.presentation, r.reserved),
  }));

  const after = {
    stockSum: (await prisma.pillow.aggregate({ _sum: { stock: true } }))._sum.stock ?? 0,
    history: await prisma.pillowStockHistory.count(),
    balances: await prisma.inventoryBalance.count(),
  };

  assert(before.stockSum === after.stockSum, 'stock sum unchanged after read');
  assert(before.history === after.history, 'history unchanged after read');
  assert(before.balances === after.balances, 'balance count unchanged after read');
  console.log(`Test C PASS — read path mapped ${mapped.length} rows without mutation`);
}

async function testLegacyStockUnchangedSnapshot() {
  const pillowCount = await prisma.pillow.count();
  const stockSum = (await prisma.pillow.aggregate({ _sum: { stock: true } }))._sum.stock ?? 0;
  const historyCount = await prisma.pillowStockHistory.count();
  assert(pillowCount >= 1, 'pillows exist');
  assert(typeof stockSum === 'number', 'stock sum readable');
  assert(historyCount >= 0, 'history readable');
  console.log(
    `Test D INFO — COUNT(Pillow)=${pillowCount} SUM(stock)=${stockSum} COUNT(history)=${historyCount} (compare before/after migrate in report)`
  );
}

async function testLocationsIntact() {
  const locs = await prisma.location.findMany({
    where: { code: { in: ['WH-MAIN', 'SR-MAIN'] } },
  });
  assert(locs.length === 2, 'expected exactly WH-MAIN and SR-MAIN');
  const total = await prisma.location.count();
  assert(total === 2, `location count must stay 2, got ${total}`);
  console.log('Test E PASS — WH-MAIN / SR-MAIN present, no duplicates');
}

async function main() {
  console.log('Running TASK 3 inventory-balance checks…');
  await testAvailableFormula();
  await testLocationsIntact();
  await testReadOnlyApiLogicDoesNotMutate();
  await testUniqueConstraint();
  await testLegacyStockUnchangedSnapshot();
  console.log('ALL TASK 3 SCRIPT CHECKS PASSED');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
