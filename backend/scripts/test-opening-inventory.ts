/**
 * TASK 9 clean cutover opening inventory tests (isolated pillows only).
 * Usage: npm run test:opening-inventory
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import {
  OpeningInventoryService,
  OPENING_REF,
  validateOpeningQty,
  openingReferenceNumber,
} from '../src/services/OpeningInventoryService';
import { CUTOVER_SETTINGS_ID, getInventoryMode } from '../src/services/InventoryMode';

dotenv.config();

const prisma = new PrismaClient();

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
}

async function snapshot() {
  return {
    pillowCount: await prisma.pillow.count(),
    stockSum: (await prisma.pillow.aggregate({ _sum: { stock: true } }))._sum.stock ?? 0,
    historyCount: await prisma.pillowStockHistory.count(),
    balanceCount: await prisma.inventoryBalance.count(),
    movementCount: await prisma.stockMovement.count(),
    transferCount: await prisma.transfer.count(),
    orderCount: await prisma.order.count(),
    pillowOrderCount: await prisma.pillowOrder.count(),
    mode: await getInventoryMode(prisma),
    openingMoves: await prisma.stockMovement.count({
      where: { referenceType: OPENING_REF },
    }),
  };
}

async function destroyPillow(id: number) {
  await prisma.stockMovement.deleteMany({ where: { pillowId: id } });
  await prisma.inventoryBalance.deleteMany({ where: { pillowId: id } });
  await prisma.pillowStockHistory.deleteMany({ where: { pillowId: id } });
  await prisma.activity.deleteMany({ where: { type: OPENING_REF, details: { contains: String(id) } } }).catch(() => undefined);
  await prisma.pillow.delete({ where: { id } }).catch(() => undefined);
}

async function resetCutoverSettings() {
  await prisma.inventoryCutoverSettings.upsert({
    where: { id: CUTOVER_SETTINGS_ID },
    create: { id: CUTOVER_SETTINGS_ID, mode: 'LEGACY' },
    update: {
      mode: 'LEGACY',
      cutoverAt: null,
      cutoverDate: null,
      referenceType: null,
      openingFileHash: null,
      notes: null,
    },
  });
}

async function main() {
  console.log('Running TASK 9 opening inventory checks…');
  await resetCutoverSettings();

  assert(validateOpeningQty('WH-MAIN', { physical: 5, presentation: 0 }).length === 0, 'wh ok');
  assert(validateOpeningQty('WH-MAIN', { physical: 5, presentation: 1 }).length > 0, 'wh presentation');
  assert(validateOpeningQty('SR-MAIN', { physical: 5, presentation: 6 }).length > 0, 'sr > physical');
  assert(validateOpeningQty('SR-MAIN', { physical: -1, presentation: 0 }).length > 0, 'negative');
  console.log('Tests 4–6 PASS — validation');

  const before = await snapshot();
  assert(before.mode === 'LEGACY', 'mode LEGACY');
  assert(before.openingMoves === 0, 'no production opening moves');

  const service = new OpeningInventoryService(prisma);
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  assert(admin, 'admin');

  const tmpDir = path.resolve(__dirname, '../data');
  fs.mkdirSync(tmpDir, { recursive: true });
  const isoFile = path.join(tmpDir, '_test-opening-iso.json');

  let missing = false;
  try {
    service.loadFile(path.join(tmpDir, '_missing-opening.json'));
  } catch {
    missing = true;
  }
  assert(missing, 'missing file');

  const isoA = await prisma.pillow.create({
    data: { name: `TASK9C-A-${Date.now()}`, price: 1, stock: 16 },
  });
  const isoB = await prisma.pillow.create({
    data: { name: `TASK9C-B-${Date.now()}`, price: 1, stock: 46 },
  });
  const ids = [isoA.id, isoB.id];

  try {
    // Invalid pillow id
    fs.writeFileSync(
      isoFile,
      JSON.stringify({
        version: 1,
        cutoverDate: '2026-09-05',
        locations: {
          'WH-MAIN': {
            [String(isoA.id)]: { physical: 10, presentation: 0 },
            '999999': { physical: 1, presentation: 0 },
          },
          'SR-MAIN': {
            [String(isoA.id)]: { physical: 5, presentation: 1 },
            '999999': { physical: 0, presentation: 0 },
          },
        },
      })
    );
    // scoped only isoA — unknown 999999 ignored when scoped; include invalid by onlyPillowIds wrong
    let badId = false;
    try {
      await service.buildPlan(JSON.parse(fs.readFileSync(isoFile, 'utf8')), {
        onlyPillowIds: [isoA.id, 999999],
      });
    } catch (e: any) {
      badId = String(e.message).includes('unknown pillow');
    }
    assert(badId, 'invalid pillow id');
    console.log('Test 2 PASS — invalid pillow');

    // Negative / presentation
    fs.writeFileSync(
      isoFile,
      JSON.stringify({
        version: 1,
        cutoverDate: '2026-09-05',
        locations: {
          'WH-MAIN': {
            [String(isoA.id)]: { physical: 10, presentation: 0 },
            [String(isoB.id)]: { physical: 5, presentation: 0 },
          },
          'SR-MAIN': {
            [String(isoA.id)]: { physical: 5, presentation: 9 },
            [String(isoB.id)]: { physical: 2, presentation: 0 },
          },
        },
      })
    );
    const presBad = await service.buildPlan(JSON.parse(fs.readFileSync(isoFile, 'utf8')), {
      onlyPillowIds: ids,
    });
    assert(!presBad.canExecute, 'presentation > physical blocks');
    console.log('Test presentation>physical PASS');

    // Valid opening — new count may differ from old stock
    fs.writeFileSync(
      isoFile,
      JSON.stringify({
        version: 1,
        cutoverDate: '2026-09-05',
        cutoverAt: '2026-09-05T12:00:00.000Z',
        locations: {
          'WH-MAIN': {
            [String(isoA.id)]: { physical: 10, presentation: 0 },
            [String(isoB.id)]: { physical: 40, presentation: 0 },
          },
          'SR-MAIN': {
            [String(isoA.id)]: { physical: 5, presentation: 2 },
            [String(isoB.id)]: { physical: 0, presentation: 0 },
          },
        },
      })
    );
    const plan = await service.buildPlan(JSON.parse(fs.readFileSync(isoFile, 'utf8')), {
      onlyPillowIds: ids,
    });
    assert(plan.canExecute, 'can execute');
    const rowA = plan.rows.find((r) => r.pillowId === isoA.id)!;
    assert(rowA.differenceVsOld === 10 + 5 - 16, 'diff informational -1');
    assert(rowA.newCompanyPhysical === 15, 'new physical 15');
    assert(plan.plannedMovements.some((m) => m.quantity === 10), 'WH movement');
    assert(
      !plan.plannedMovements.some(
        (m) => m.pillowId === isoB.id && m.locationCode === 'SR-MAIN'
      ),
      'zero SR no movement'
    );
    assert(plan.plannedBalances.length === 4, '4 balances planned');
    console.log('Tests 1/11/19 PASS — valid plan + zero movement + diff');

    // Dry-run creates no writes (buildPlan only already; load via dryRun)
    const beforeIso = {
      bals: await prisma.inventoryBalance.count({ where: { pillowId: { in: ids } } }),
      moves: await prisma.stockMovement.count({ where: { pillowId: { in: ids } } }),
      stockA: (await prisma.pillow.findUnique({ where: { id: isoA.id } }))!.stock,
    };
    await service.dryRun(isoFile, { onlyPillowIds: ids });
    assert(
      (await prisma.inventoryBalance.count({ where: { pillowId: { in: ids } } })) === beforeIso.bals,
      'dry-run no balances'
    );
    assert(
      (await prisma.stockMovement.count({ where: { pillowId: { in: ids } } })) === beforeIso.moves,
      'dry-run no moves'
    );
    console.log('Test 8 PASS — dry-run no writes');

    const exec1 = await service.execute(isoFile, {
      userId: admin.id,
      onlyPillowIds: ids,
      skipModeFlip: true,
    });
    assert(exec1.status === 'EXECUTED', 'executed');
    assert(exec1.balancesCreated === 4, '4 balances');
    // movements: WH A, SR A, WH B = 3 (SR B physical 0)
    assert(exec1.movementsCreated === 3, '3 INITIAL movements');

    const pillowA = await prisma.pillow.findUnique({ where: { id: isoA.id } });
    assert(pillowA?.stock === 15, 'Pillow.stock mirror updated to 15');
    const pillowB = await prisma.pillow.findUnique({ where: { id: isoB.id } });
    assert(pillowB?.stock === 40, 'Pillow.stock mirror updated to 40');

    const bals = await prisma.inventoryBalance.findMany({ where: { pillowId: { in: ids } } });
    assert(bals.length === 4, '4 balances exist');
    assert(bals.every((b) => b.reserved === 0), 'reserved 0');

    const moves = await prisma.stockMovement.findMany({
      where: { pillowId: { in: ids }, referenceType: OPENING_REF, type: 'INITIAL' },
    });
    assert(moves.length === 3, '3 initial');
    assert(
      moves.some((m) => m.referenceNumber === openingReferenceNumber(isoA.id, 'WH')),
      'ref WH'
    );
    console.log('Tests 9–12 PASS — execute balances/movements/mirror');

    // Idempotent
    const exec2 = await service.execute(isoFile, {
      userId: admin.id,
      onlyPillowIds: ids,
      skipModeFlip: true,
    });
    assert(exec2.status === 'ALREADY_CUTOVER', 'second ALREADY_CUTOVER');
    assert(
      (await prisma.stockMovement.count({
        where: { pillowId: { in: ids }, referenceType: OPENING_REF, type: 'INITIAL' },
      })) === 3,
      'no duplicate moves'
    );
    console.log('Test 14 PASS — idempotent');

    // Conflict pillow
    const conflict = await prisma.pillow.create({
      data: { name: `TASK9C-CONFLICT-${Date.now()}`, price: 1, stock: 3 },
    });
    ids.push(conflict.id);
    const wh = await prisma.location.findFirst({ where: { code: 'WH-MAIN' } });
    assert(wh, 'wh');
    await prisma.inventoryBalance.create({
      data: {
        pillowId: conflict.id,
        locationId: wh.id,
        physical: 3,
        presentation: 0,
        reserved: 0,
      },
    });
    const conflictFile = path.join(tmpDir, '_test-opening-conflict.json');
    fs.writeFileSync(
      conflictFile,
      JSON.stringify({
        version: 1,
        cutoverDate: '2026-09-05',
        locations: {
          'WH-MAIN': { [String(conflict.id)]: { physical: 3, presentation: 0 } },
          'SR-MAIN': { [String(conflict.id)]: { physical: 0, presentation: 0 } },
        },
      })
    );
    const cPlan = await service.buildPlan(JSON.parse(fs.readFileSync(conflictFile, 'utf8')), {
      onlyPillowIds: [conflict.id],
    });
    assert(cPlan.rows.some((r) => r.status === 'CONFLICT'), 'conflict');
    assert(!cPlan.canExecute, 'conflict blocks');
    fs.unlinkSync(conflictFile);
    console.log('Conflict PASS');

    // Concurrent already-cutover
    const concurrent = await Promise.all([
      service.execute(isoFile, { userId: admin.id, onlyPillowIds: [isoA.id, isoB.id], skipModeFlip: true }),
      service.execute(isoFile, { userId: admin.id, onlyPillowIds: [isoA.id, isoB.id], skipModeFlip: true }),
    ]);
    assert(concurrent.every((r) => r.status === 'ALREADY_CUTOVER'), 'concurrent safe');
    console.log('Test 18 PASS — concurrent');

    assert((await getInventoryMode(prisma)) === 'LEGACY', 'scoped execute did not flip production mode');
  } finally {
    for (const id of ids) await destroyPillow(id);
    await prisma.activity.deleteMany({ where: { type: OPENING_REF } }).catch(() => undefined);
    await resetCutoverSettings();
    try {
      fs.unlinkSync(isoFile);
    } catch {
      /* ignore */
    }
  }

  const after = await snapshot();
  assert(after.stockSum === before.stockSum, 'production stock unchanged');
  assert(after.historyCount === before.historyCount, 'history unchanged');
  assert(after.balanceCount === before.balanceCount, 'balances unchanged');
  assert(after.movementCount === before.movementCount, 'movements unchanged');
  assert(after.transferCount === before.transferCount, 'transfers unchanged');
  assert(after.orderCount === before.orderCount, 'orders unchanged');
  assert(after.pillowOrderCount === before.pillowOrderCount, 'pillow orders unchanged');
  assert(after.mode === 'LEGACY', 'mode still LEGACY');
  assert(after.openingMoves === 0, 'no production opening moves');
  console.log('Tests 15–17 PASS — production safety');

  // Generate template (zeros) without executing
  const template = await service.generateTemplateFromDb('2026-09-05');
  const templatePath = path.join(tmpDir, 'opening-inventory.template.json');
  fs.writeFileSync(templatePath, JSON.stringify(template, null, 2));
  assert(template.locations['WH-MAIN']['1']?.physical === 0, 'template zeros');
  console.log('Template PASS');

  console.log('ALL TASK 9 OPENING INVENTORY CHECKS PASSED');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
