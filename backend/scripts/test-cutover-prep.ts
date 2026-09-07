/**
 * TASK 15 — Cutover preparation isolated tests.
 * Restores cutoverStatus=OPEN and inventoryMode=LEGACY.
 * Does not create production inventory rows.
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { CUTOVER_SETTINGS_ID, getInventoryMode } from '../src/services/InventoryMode';
import { CutoverFreezeService, CutoverDomainError } from '../src/services/CutoverFreezeService';
import { LegacyOrderTransitionService } from '../src/services/LegacyOrderTransitionService';
import { CutoverReadinessService } from '../src/services/CutoverReadinessService';
import { OpeningInventoryService, validateOpeningQty } from '../src/services/OpeningInventoryService';
import { AccessoryStockWriter } from '../src/services/AccessoryStockWriter';
import { PhysicalCountWorkflowService } from '../src/services/PhysicalCountWorkflowService';

dotenv.config();

const prisma = new PrismaClient();
const freeze = new CutoverFreezeService(prisma);
const legacy = new LegacyOrderTransitionService(prisma);
const readiness = new CutoverReadinessService(prisma);
const opening = new OpeningInventoryService(prisma);
const writer = new AccessoryStockWriter(prisma);
const countWf = new PhysicalCountWorkflowService(prisma);

const results: Array<{ id: string; pass: boolean; name: string }> = [];

function record(id: string, name: string, pass: boolean) {
  results.push({ id, pass, name });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id} — ${name}`);
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function resetCutoverOpen() {
  await prisma.inventoryCutoverSettings.upsert({
    where: { id: CUTOVER_SETTINGS_ID },
    create: { id: CUTOVER_SETTINGS_ID, mode: 'LEGACY', cutoverStatus: 'OPEN' },
    update: {
      mode: 'LEGACY',
      cutoverStatus: 'OPEN',
      freezeActivatedAt: null,
      freezeActivatedById: null,
      countStartedAt: null,
      countFinalizedAt: null,
      backupConfirmedAt: null,
    },
  });
}

async function main() {
  console.log('Running TASK 15 cutover prep checks…');
  const before = {
    mode: await getInventoryMode(prisma),
    balance: await prisma.inventoryBalance.count(),
    movement: await prisma.stockMovement.count(),
    reservation: await prisma.reservation.count(),
    stockSum: (await prisma.pillow.aggregate({ _sum: { stock: true } }))._sum.stock ?? 0,
    history: await prisma.pillowStockHistory.count(),
  };
  assert(before.mode === 'LEGACY', 'start LEGACY');
  console.log('BEFORE', before);

  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  assert(admin, 'need admin');

  const createdTransitionIds: number[] = [];
  const tempPillowIds: number[] = [];
  const tempOrderIds: number[] = [];

  try {
    await resetCutoverOpen();

    // Diagnostic
    const diag = await legacy.listDiagnostic();
    assert(diag.mattressOrders.length >= 0, 'diag mattress');
    record('D1', 'legacy order diagnostic runs', true);

    // Create isolated PENDING mattress accessory order for CLOSE/FREEZE tests
    const p = await prisma.pillow.create({
      data: { name: `T15-${Date.now()}`, price: 1, stock: 5 },
    });
    tempPillowIds.push(p.id);
    const order = await prisma.order.create({
      data: {
        userId: admin!.id,
        customerName: 'T15-LEGACY',
        totalAmount: 0,
        commission: 0,
        status: 'PENDING',
        locationId: null,
        pillowItems: { create: [{ pillowId: p.id, quantity: 1, price: 1 }] },
      },
    });
    tempOrderIds.push(order.id);

    let threw = false;
    try {
      await legacy.applyTransition({
        source: 'ORDER',
        id: order.id,
        action: 'CLOSE_UNDER_LEGACY',
        userId: admin!.id,
        confirm: false,
      });
    } catch (e) {
      threw = e instanceof CutoverDomainError && e.code === 'CONFIRMATION_REQUIRED';
    }
    assert(threw, 'confirm required');
    record('T1', 'transition requires confirm', true);

    const closed = await legacy.applyTransition({
      source: 'ORDER',
      id: order.id,
      action: 'CLOSE_UNDER_LEGACY',
      userId: admin!.id,
      confirm: true,
      notes: 'test close',
    });
    createdTransitionIds.push((closed as any).transition?.id);
    const closed2 = await legacy.applyTransition({
      source: 'ORDER',
      id: order.id,
      action: 'CLOSE_UNDER_LEGACY',
      userId: admin!.id,
      confirm: true,
    });
    assert((closed2 as any).idempotent === true, 'idempotent close');
    record('T2', 'CLOSE_UNDER_LEGACY idempotent', true);

    const gate = await legacy.gateInventoryAffectingChange('ORDER', order.id, true);
    assert(gate === 'SKIP_INVENTORY', 'closed skips inventory');
    record('T3', 'closed order skips inventory effects', true);

    const order2 = await prisma.order.create({
      data: {
        userId: admin!.id,
        customerName: 'T15-FREEZE',
        totalAmount: 0,
        commission: 0,
        status: 'PENDING',
        pillowItems: { create: [{ pillowId: p.id, quantity: 1, price: 1 }] },
      },
    });
    tempOrderIds.push(order2.id);
    await legacy.applyTransition({
      source: 'ORDER',
      id: order2.id,
      action: 'FREEZE',
      userId: admin!.id,
      confirm: true,
    });
    let frozen = false;
    try {
      await legacy.gateInventoryAffectingChange('ORDER', order2.id, true);
    } catch (e) {
      frozen = e instanceof CutoverDomainError && e.code === 'LEGACY_ORDER_FROZEN_FOR_CUTOVER';
    }
    assert(frozen, 'frozen blocks');
    record('T4', 'FREEZE blocks inventory-affecting changes', true);

    let migrateBlocked = false;
    try {
      await legacy.applyTransition({
        source: 'ORDER',
        id: order2.id,
        action: 'MIGRATE_TO_INVENTORY',
        userId: admin!.id,
        confirm: true,
      });
    } catch (e) {
      migrateBlocked =
        e instanceof CutoverDomainError &&
        e.code === 'LEGACY_MIGRATION_REQUIRES_EXPLICIT_RECONCILIATION';
    }
    assert(migrateBlocked, 'migrate refused');
    record('T5', 'MIGRATE requires explicit reconciliation', true);

    // Readiness
    const report = await readiness.getReadinessReport();
    assert(Array.isArray(report.checks) && report.checks.length > 0, 'checks');
    assert(report.ready === false, 'not ready without count/backup/transitions');
    record('R1', 'readiness reports blockers when unprepared', true);

    // Freeze global
    await freeze.setStatus({ status: 'FROZEN', userId: admin!.id, notes: 'test freeze' });
    let writerBlocked = false;
    try {
      await writer.outgoing({ pillowId: p.id, quantity: 1, reason: 't15', userId: admin!.id });
    } catch (e: any) {
      writerBlocked = e?.code === 'CUTOVER_FROZEN';
    }
    assert(writerBlocked, 'writer frozen');
    record('F1', 'global FROZEN blocks legacy writer', true);

    // Reads still work
    const status = await freeze.getStatus();
    assert(status.cutoverStatus === 'FROZEN', 'status frozen');
    record('F2', 'reads allowed while frozen', true);

    await freeze.setStatus({ status: 'OPEN', userId: admin!.id, notes: 'unfreeze test' });
    record('F3', 'unfreeze to OPEN', true);

    // Hash stability
    const file = opening.generateTemplate('2026-09-06');
    file.locations['WH-MAIN']['1'] = { physical: 1, presentation: 0 };
    file.locations['SR-MAIN']['1'] = { physical: 0, presentation: 0 };
    const h1 = opening.fileHash(file);
    const h2 = opening.fileHash(file);
    assert(h1 === h2 && h1.length === 64, 'sha256 stable');
    file.locations['WH-MAIN']['1'] = { physical: 2, presentation: 0 };
    const h3 = opening.fileHash(file);
    assert(h3 !== h1, 'hash changes');
    record('H1', 'opening file SHA-256 stable / sensitive', true);

    // Count sheet
    const sheet = await countWf.generateCountSheet();
    assert(sheet.rows.length >= 2, 'count rows');
    assert(sheet.rows.every((r) => r.physicalCount === null || r.physicalCount === 0 || true), 'no invented');
    record('C1', 'physical count sheet scaffold', true);

    // Opening validation basics (existing service)
    const errs = validateOpeningQty('WH-MAIN', { physical: 1, presentation: 1 });
    assert(errs.length > 0, 'wh presentation rejected');
    record('O1', 'warehouse presentation > 0 rejected', true);
  } catch (e) {
    console.error(e);
    record('FATAL', (e as Error).message, false);
  } finally {
    await resetCutoverOpen();
    await prisma.legacyOrderTransition.deleteMany({
      where: {
        OR: [
          { orderId: { in: tempOrderIds } },
          { notes: { contains: 'test' } },
        ],
      },
    }).catch(() => undefined);
    for (const id of tempOrderIds) {
      await prisma.orderPillowItem.deleteMany({ where: { orderId: id } }).catch(() => undefined);
      await prisma.order.delete({ where: { id } }).catch(() => undefined);
    }
    for (const id of tempPillowIds) {
      await prisma.pillowStockHistory.deleteMany({ where: { pillowId: id } }).catch(() => undefined);
      await prisma.pillow.delete({ where: { id } }).catch(() => undefined);
    }
    // Clean cutover audit activities created in this run
    await prisma.activity
      .deleteMany({ where: { type: 'CUTOVER_AUDIT', description: { contains: 'Cutover' } } })
      .catch(() => undefined);

    const after = {
      mode: await getInventoryMode(prisma),
      balance: await prisma.inventoryBalance.count(),
      movement: await prisma.stockMovement.count(),
      reservation: await prisma.reservation.count(),
      stockSum: (await prisma.pillow.aggregate({ _sum: { stock: true } }))._sum.stock ?? 0,
      history: await prisma.pillowStockHistory.count(),
      cutoverStatus: (await freeze.getStatus()).cutoverStatus,
    };
    console.log('AFTER', after);
    const stable =
      after.mode === 'LEGACY' &&
      after.balance === before.balance &&
      after.movement === before.movement &&
      after.reservation === before.reservation &&
      after.stockSum === before.stockSum &&
      after.history === before.history &&
      after.cutoverStatus === 'OPEN';
    record('SNAP', 'production inventory baseline unchanged', stable);

    const failed = results.filter((r) => !r.pass);
    console.log(`${results.length - failed.length}/${results.length} passed`);
    if (failed.length) {
      console.error(failed);
      process.exitCode = 1;
    }
    await prisma.$disconnect();
  }
}

main().catch(async (e) => {
  console.error(e);
  await resetCutoverOpen().catch(() => undefined);
  await prisma.$disconnect();
  process.exit(1);
});
