/**
 * TASK 6/9 legacy migration tests.
 * Production pillows are never migrated by these tests.
 * Isolated TASK9-* pillows are created, migrated, and deleted.
 *
 * Usage: npm run test:legacy-migration
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import {
  LegacyInventoryMigration,
  validateAllocationAgainstStock,
  reconstructFromHistory,
  MIGRATION_REF,
  migrationReferenceNumber,
} from '../src/services/LegacyInventoryMigration';

dotenv.config();

const prisma = new PrismaClient();

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
}

async function destroyPillow(pillowId: number) {
  await prisma.stockMovement.deleteMany({ where: { pillowId } });
  await prisma.inventoryBalance.deleteMany({ where: { pillowId } });
  await prisma.pillowStockHistory.deleteMany({ where: { pillowId } });
  await prisma.activity.deleteMany({
    where: { details: { contains: `"migratedPillowIds":[${pillowId}]` } },
  }).catch(() => undefined);
  await prisma.pillow.delete({ where: { id: pillowId } }).catch(() => undefined);
}

async function main() {
  console.log('Running TASK 6/9 legacy migration checks…');

  // Pure validation
  assert(reconstructFromHistory({ INITIAL: 20, OUTGOING: -4 }) === 16, 'reconstruct');
  assert(validateAllocationAgainstStock(31, 20, 11, 2).length === 0, 'valid alloc');
  assert(validateAllocationAgainstStock(31, 20, 10, 0).some((e) => e.includes('must equal')), 'sum mismatch');
  assert(validateAllocationAgainstStock(31, 20, 11, 12).some((e) => e.includes('presentation')), 'presentation > showroom');
  assert(validateAllocationAgainstStock(10, -1, 11, 0).length > 0, 'negative');
  console.log('Tests 1-5 PASS — allocation validation rules');

  const migrator = new LegacyInventoryMigration(prisma);
  const before = {
    pillowCount: await prisma.pillow.count(),
    stockSum: (await prisma.pillow.aggregate({ _sum: { stock: true } }))._sum.stock ?? 0,
    history: await prisma.pillowStockHistory.count(),
    balances: await prisma.inventoryBalance.count(),
    movements: await prisma.stockMovement.count(),
    transfers: await prisma.transfer.count(),
    pillowOrders: await prisma.pillowOrder.count(),
    orders: await prisma.order.count(),
    locations: await prisma.location.count(),
  };

  const audit = await migrator.auditAll();
  assert(audit.pillows.every((p) => p.reconstructionStatus === 'MATCH'), 'history MATCH expected');
  console.log('Test audit PASS');

  const template = migrator.generateTemplate(audit);
  const tmpDir = path.resolve(__dirname, '../data');
  fs.mkdirSync(tmpDir, { recursive: true });
  const badAlloc = path.join(tmpDir, '_test-allocation-bad.json');
  const goodAlloc = path.join(tmpDir, '_test-allocation-good.json');
  const unknownAlloc = path.join(tmpDir, '_test-allocation-unknown.json');
  const isoAlloc = path.join(tmpDir, '_test-allocation-iso.json');

  fs.writeFileSync(path.join(tmpDir, 'legacy-inventory-allocation.template.json'), JSON.stringify(template, null, 2));
  fs.writeFileSync(badAlloc, JSON.stringify(template, null, 2));
  const incomplete = await migrator.buildPlan(JSON.parse(fs.readFileSync(badAlloc, 'utf8')));
  assert(incomplete.needsOperatorAllocation, 'needs allocation');
  assert(!incomplete.canExecute, 'cannot execute incomplete');
  console.log('Test NEEDS_ALLOCATION PASS');

  const p0 = audit.pillows[0];
  assert(p0, 'need pillow');
  fs.writeFileSync(
    unknownAlloc,
    JSON.stringify(
      {
        version: 1,
        allocations: {
          '999999': { warehouse: 1, showroom: 0, presentation: 0 },
          ...Object.fromEntries(
            audit.pillows.map((p) => [
              String(p.pillowId),
              { warehouse: p.legacyStock, showroom: 0, presentation: 0 },
            ])
          ),
        },
      },
      null,
      2
    )
  );
  const unknownPlan = await migrator.buildPlan(JSON.parse(fs.readFileSync(unknownAlloc, 'utf8')));
  assert(unknownPlan.errors.some((e) => e.includes('Unknown pillow')), 'unknown pillow detected');
  console.log('Test unknown pillow PASS');

  const allocations: Record<string, any> = {};
  for (const p of audit.pillows) {
    const wh = Math.floor(p.legacyStock / 2);
    const sr = p.legacyStock - wh;
    allocations[String(p.pillowId)] = {
      warehouse: wh,
      showroom: sr,
      presentation: Math.min(1, sr),
    };
  }
  fs.writeFileSync(goodAlloc, JSON.stringify({ version: 1, allocations }, null, 2));
  const goodPlan = await migrator.buildPlan(JSON.parse(fs.readFileSync(goodAlloc, 'utf8')));
  assert(goodPlan.canExecute, 'valid plan can execute');
  assert(goodPlan.expectedMovements.length === audit.pillows.length * 2, 'expected movements = pillows×2');
  console.log('Test correct allocation plan PASS (dry validation only)');

  let refused = false;
  try {
    await migrator.execute(badAlloc);
  } catch (e: any) {
    refused = String(e.message).includes('NEEDS_ALLOCATION') || String(e.message).includes('Validation');
  }
  assert(refused, 'execute refused incomplete allocation');
  console.log('Test execute refuse incomplete PASS');

  // --- Isolated execute (temp pillows only) ---
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  assert(admin, 'need admin');
  const isoA = await prisma.pillow.create({
    data: { name: `TASK9-ISO-A-${Date.now()}`, price: 1, stock: 10 },
  });
  const isoB = await prisma.pillow.create({
    data: { name: `TASK9-ISO-B-${Date.now()}`, price: 1, stock: 7 },
  });
  const isoIds = [isoA.id, isoB.id];

  try {
    // Missing allocation for subset
    fs.writeFileSync(
      isoAlloc,
      JSON.stringify({ version: 1, allocations: { [String(isoA.id)]: { warehouse: 10, showroom: 0, presentation: 0 } } }, null, 2)
    );
    const missingB = await migrator.buildPlan(JSON.parse(fs.readFileSync(isoAlloc, 'utf8')), {
      onlyPillowIds: isoIds,
    });
    assert(!missingB.canExecute || missingB.needsOperatorAllocation, 'missing pillow B fails');

    // Mismatch fails
    fs.writeFileSync(
      isoAlloc,
      JSON.stringify(
        {
          version: 1,
          allocations: {
            [String(isoA.id)]: { warehouse: 5, showroom: 4, presentation: 0 },
            [String(isoB.id)]: { warehouse: 7, showroom: 0, presentation: 0 },
          },
        },
        null,
        2
      )
    );
    const mismatch = await migrator.buildPlan(JSON.parse(fs.readFileSync(isoAlloc, 'utf8')), {
      onlyPillowIds: isoIds,
    });
    assert(mismatch.errors.some((e) => e.includes(String(isoA.id))), 'mismatch fails');

    // Presentation > showroom
    fs.writeFileSync(
      isoAlloc,
      JSON.stringify(
        {
          version: 1,
          allocations: {
            [String(isoA.id)]: { warehouse: 6, showroom: 4, presentation: 5 },
            [String(isoB.id)]: { warehouse: 7, showroom: 0, presentation: 0 },
          },
        },
        null,
        2
      )
    );
    const presBad = await migrator.buildPlan(JSON.parse(fs.readFileSync(isoAlloc, 'utf8')), {
      onlyPillowIds: isoIds,
    });
    assert(presBad.errors.some((e) => e.includes('presentation')), 'presentation > showroom fails');

    // Valid isolated execute
    fs.writeFileSync(
      isoAlloc,
      JSON.stringify(
        {
          version: 1,
          allocations: {
            [String(isoA.id)]: { warehouse: 6, showroom: 4, presentation: 1 },
            [String(isoB.id)]: { warehouse: 5, showroom: 2, presentation: 0 },
          },
        },
        null,
        2
      )
    );
    const isoPlan = await migrator.buildPlan(JSON.parse(fs.readFileSync(isoAlloc, 'utf8')), {
      onlyPillowIds: isoIds,
    });
    assert(isoPlan.canExecute, 'iso can execute');

    const stockBeforeIso =
      (await prisma.pillow.aggregate({
        where: { id: { in: isoIds } },
        _sum: { stock: true },
      }))._sum.stock ?? 0;

    const exec1 = await migrator.execute(isoAlloc, {
      userId: admin.id,
      onlyPillowIds: isoIds,
    });
    assert(exec1.status === 'EXECUTED', 'executed');
    assert(exec1.migrated.length === 2, 'two pillows migrated');
    assert(exec1.movementsCreated === 4, '4 INITIAL movements');

    const moves = await prisma.stockMovement.findMany({
      where: { pillowId: { in: isoIds }, referenceType: MIGRATION_REF, type: 'INITIAL' },
    });
    assert(moves.length === 4, 'exactly 4 INITIAL');
    assert(
      moves.every((m) =>
        [migrationReferenceNumber(isoA.id, 'WH'), migrationReferenceNumber(isoA.id, 'SR'), migrationReferenceNumber(isoB.id, 'WH'), migrationReferenceNumber(isoB.id, 'SR')].includes(
          m.referenceNumber || ''
        )
      ),
      'deterministic refs'
    );

    const bals = await prisma.inventoryBalance.findMany({ where: { pillowId: { in: isoIds } } });
    assert(bals.length === 4, '4 balances');
    assert(bals.every((b) => b.reserved === 0), 'reserved 0');

    const stockAfterIso =
      (await prisma.pillow.aggregate({
        where: { id: { in: isoIds } },
        _sum: { stock: true },
      }))._sum.stock ?? 0;
    assert(stockAfterIso === stockBeforeIso, 'Pillow.stock unchanged by migration');

    for (const id of isoIds) {
      const pillow = await prisma.pillow.findUnique({ where: { id } });
      const sum =
        (await prisma.inventoryBalance.aggregate({ where: { pillowId: id }, _sum: { physical: true } }))
          ._sum.physical ?? 0;
      assert(sum === pillow!.stock, `reconcile pillow ${id}`);
    }

    // Idempotent second execute
    const exec2 = await migrator.execute(isoAlloc, {
      userId: admin.id,
      onlyPillowIds: isoIds,
    });
    assert(exec2.status === 'ALREADY_MIGRATED', 'second execute ALREADY_MIGRATED');
    const moves2 = await prisma.stockMovement.count({
      where: { pillowId: { in: isoIds }, referenceType: MIGRATION_REF, type: 'INITIAL' },
    });
    assert(moves2 === 4, 'no duplicate movements');

    // Conflict: non-zero balance without marker on a new pillow
    const conflictPillow = await prisma.pillow.create({
      data: { name: `TASK9-CONFLICT-${Date.now()}`, price: 1, stock: 3 },
    });
    isoIds.push(conflictPillow.id);
    const wh = await prisma.location.findFirst({ where: { code: 'WH-MAIN' } });
    assert(wh, 'WH');
    await prisma.inventoryBalance.create({
      data: {
        pillowId: conflictPillow.id,
        locationId: wh.id,
        physical: 3,
        presentation: 0,
        reserved: 0,
      },
    });
    const conflictAlloc = path.join(tmpDir, '_test-allocation-conflict.json');
    fs.writeFileSync(
      conflictAlloc,
      JSON.stringify(
        {
          version: 1,
          allocations: {
            [String(conflictPillow.id)]: { warehouse: 3, showroom: 0, presentation: 0 },
          },
        },
        null,
        2
      )
    );
    const conflictPlan = await migrator.buildPlan(JSON.parse(fs.readFileSync(conflictAlloc, 'utf8')), {
      onlyPillowIds: [conflictPillow.id],
    });
    assert(conflictPlan.rows.some((r) => r.status === 'CONFLICT'), 'conflict detected');
    assert(!conflictPlan.canExecute, 'conflict blocks execute');
    fs.unlinkSync(conflictAlloc);
    console.log('Tests isolated execute + idempotency + conflict PASS');

    // Concurrent second execute should be safe (already migrated)
    const concurrent = await Promise.all([
      migrator.execute(isoAlloc, { userId: admin.id, onlyPillowIds: [isoA.id, isoB.id] }),
      migrator.execute(isoAlloc, { userId: admin.id, onlyPillowIds: [isoA.id, isoB.id] }),
    ]);
    assert(
      concurrent.every((r) => r.status === 'ALREADY_MIGRATED'),
      'concurrent already migrated'
    );
    console.log('Test concurrent ALREADY_MIGRATED PASS');
  } finally {
    for (const id of isoIds) {
      await destroyPillow(id);
    }
  }

  const after = {
    pillowCount: await prisma.pillow.count(),
    stockSum: (await prisma.pillow.aggregate({ _sum: { stock: true } }))._sum.stock ?? 0,
    history: await prisma.pillowStockHistory.count(),
    balances: await prisma.inventoryBalance.count(),
    movements: await prisma.stockMovement.count(),
    transfers: await prisma.transfer.count(),
    pillowOrders: await prisma.pillowOrder.count(),
    orders: await prisma.order.count(),
    locations: await prisma.location.count(),
    migrationMoves: await prisma.stockMovement.count({ where: { referenceType: MIGRATION_REF } }),
  };

  assert(after.stockSum === before.stockSum, 'production Pillow.stock unchanged');
  assert(after.history === before.history, 'history unchanged');
  assert(after.balances === before.balances, 'production balances unchanged');
  assert(after.movements === before.movements, 'production movements unchanged');
  assert(after.transfers === before.transfers, 'transfers unchanged');
  assert(after.pillowOrders === before.pillowOrders, 'pillow orders unchanged');
  assert(after.orders === before.orders, 'orders unchanged');
  assert(after.locations === before.locations, 'locations unchanged');
  assert(after.pillowCount === before.pillowCount, 'pillow count restored');
  assert(after.migrationMoves === 0, 'no production migration movements');
  console.log('Tests production safety PASS');

  for (const f of [badAlloc, goodAlloc, unknownAlloc, isoAlloc]) {
    try {
      fs.unlinkSync(f);
    } catch {
      /* ignore */
    }
  }

  console.log('ALL TASK 6/9 LEGACY MIGRATION CHECKS PASSED (no production --execute)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
