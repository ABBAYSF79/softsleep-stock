/**
 * TASK 10 — Inventory transfers & BS/BE stock integration tests.
 *
 * Safety:
 * - Uses isolated temp pillows only (never production pillow ids 1/2).
 * - Temporarily sets inventoryMode=INVENTORY for INVENTORY-path tests, then restores LEGACY.
 * - Refuses to run if SOFTSLEEP_ENV=production without ALLOW_ISOLATED_INVENTORY_TESTS=1.
 * - Does NOT execute opening inventory, cutover, or production transfers.
 *
 * Usage: npm run test:inventory-transfers
 */
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { TransferService } from '../src/services/TransferService';
import { StockDocumentService } from '../src/services/StockDocumentService';
import { DocumentSequenceService } from '../src/services/DocumentSequenceService';
import { TransferDomainError } from '../src/services/transfer-errors';
import { InventoryService } from '../src/services/InventoryService';
import { CUTOVER_SETTINGS_ID, getInventoryMode } from '../src/services/InventoryMode';
import { computeAvailable } from '../src/utils/inventory-balance';

dotenv.config();

const prisma = new PrismaClient();
const transfers = new TransferService(prisma);
const documents = new StockDocumentService(prisma);
const sequences = new DocumentSequenceService(prisma);
const inventory = new InventoryService(prisma);

const results: Array<{ id: number | string; name: string; pass: boolean; detail?: string }> = [];

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
}

function record(id: number | string, name: string, pass: boolean, detail?: string) {
  results.push({ id, name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id} — ${name}${detail ? ` (${detail})` : ''}`);
}

async function assertSafeTestEnvironment() {
  if (process.env.SOFTSLEEP_ENV === 'production' && process.env.ALLOW_ISOLATED_INVENTORY_TESTS !== '1') {
    throw new Error(
      'Refusing to run TASK 10 tests against production (set ALLOW_ISOLATED_INVENTORY_TESTS=1 for isolated DB only)'
    );
  }
  const mode = await getInventoryMode(prisma);
  if (mode !== 'LEGACY' && process.env.ALLOW_ISOLATED_INVENTORY_TESTS !== '1') {
    throw new Error(
      `Refusing to run while inventoryMode=${mode} without ALLOW_ISOLATED_INVENTORY_TESTS=1`
    );
  }
}

async function setInventoryMode(mode: 'LEGACY' | 'INVENTORY') {
  await prisma.inventoryCutoverSettings.upsert({
    where: { id: CUTOVER_SETTINGS_ID },
    create: { id: CUTOVER_SETTINGS_ID, mode },
    update: { mode },
  });
}

async function snapshot() {
  return {
    pillowCount: await prisma.pillow.count(),
    stockSum: (await prisma.pillow.aggregate({ _sum: { stock: true } }))._sum.stock ?? 0,
    historyCount: await prisma.pillowStockHistory.count(),
    balanceCount: await prisma.inventoryBalance.count(),
    movementCount: await prisma.stockMovement.count(),
    transferCount: await prisma.transfer.count(),
    mode: await getInventoryMode(prisma),
  };
}

async function createTempPillow(nameSuffix: string, stock = 0) {
  return prisma.pillow.create({
    data: {
      name: `TASK10-${nameSuffix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      price: 10,
      stock,
    },
  });
}

async function destroyPillow(pillowId: number) {
  await prisma.stockDocumentLine.deleteMany({
    where: { stockDocument: { lines: { some: { pillowId } } } },
  }).catch(() => undefined);
  // Safer: delete via transfers linked to this pillow
  const lines = await prisma.transferLine.findMany({ where: { pillowId }, select: { transferId: true } });
  const transferIds = Array.from(new Set(lines.map((l) => l.transferId)));
  if (transferIds.length) {
    await prisma.stockDocumentLine.deleteMany({
      where: { stockDocument: { transferId: { in: transferIds } } },
    });
    await prisma.stockDocument.deleteMany({ where: { transferId: { in: transferIds } } });
    await prisma.transferLine.deleteMany({ where: { transferId: { in: transferIds } } });
    await prisma.transfer.deleteMany({ where: { id: { in: transferIds } } });
  }
  await prisma.stockMovement.deleteMany({ where: { pillowId } });
  await prisma.inventoryBalance.deleteMany({ where: { pillowId } });
  await prisma.pillowStockHistory.deleteMany({ where: { pillowId } });
  await prisma.activity.deleteMany({
    where: {
      OR: [
        { details: { contains: `pillowId\":${pillowId}` } },
        { details: { contains: String(pillowId) }, type: { in: ['TRANSFER_BS_VALIDATED', 'TRANSFER_BE_VALIDATED'] } },
      ],
    },
  }).catch(() => undefined);
  await prisma.pillow.delete({ where: { id: pillowId } }).catch(() => undefined);
}

async function cleanupTransfers(ids: number[]) {
  if (!ids.length) return;
  await prisma.stockDocumentLine.deleteMany({
    where: { stockDocument: { transferId: { in: ids } } },
  });
  await prisma.stockDocument.deleteMany({ where: { transferId: { in: ids } } });
  await prisma.transferLine.deleteMany({ where: { transferId: { in: ids } } });
  await prisma.transfer.deleteMany({ where: { id: { in: ids } } });
}

async function bootstrapBalances(
  pillowId: number,
  whId: number,
  srId: number,
  opts: {
    whPhysical: number;
    whPresentation?: number;
    whReserved?: number;
    srPhysical?: number;
    srPresentation?: number;
    srReserved?: number;
  }
) {
  if (opts.whPhysical > 0) {
    await inventory.increasePhysical({
      pillowId,
      locationId: whId,
      quantity: opts.whPhysical,
      type: 'SUPPLY',
      reason: 'TASK10 bootstrap WH',
      forceSyncMirror: true,
    });
  } else {
    await prisma.inventoryBalance.upsert({
      where: { pillowId_locationId: { pillowId, locationId: whId } },
      create: { pillowId, locationId: whId, physical: 0, presentation: 0, reserved: 0 },
      update: { physical: 0, presentation: 0, reserved: 0 },
    });
  }

  if (opts.whPresentation) {
    throw new Error('TASK10 bootstrap: warehouse cannot have presentation; use srPresentation or whReserved');
  }
  if (opts.whReserved) {
    await inventory.setReserved({
      pillowId,
      locationId: whId,
      reserved: opts.whReserved,
      reason: 'TASK10 reserved',
    });
  }

  const srPhys = opts.srPhysical ?? 0;
  if (srPhys > 0) {
    await inventory.increasePhysical({
      pillowId,
      locationId: srId,
      quantity: srPhys,
      type: 'SUPPLY',
      reason: 'TASK10 bootstrap SR',
      forceSyncMirror: true,
    });
  } else {
    await prisma.inventoryBalance.upsert({
      where: { pillowId_locationId: { pillowId, locationId: srId } },
      create: { pillowId, locationId: srId, physical: 0, presentation: 0, reserved: 0 },
      update: {},
    });
  }
  if (opts.srPresentation) {
    await inventory.setPresentation({
      pillowId,
      locationId: srId,
      presentation: opts.srPresentation,
      reason: 'TASK10 SR presentation',
    });
  }
  if (opts.srReserved) {
    await inventory.setReserved({
      pillowId,
      locationId: srId,
      reserved: opts.srReserved,
      reason: 'TASK10 SR reserved',
    });
  }
}

async function bal(pillowId: number, locationId: number) {
  return prisma.inventoryBalance.findUnique({
    where: { pillowId_locationId: { pillowId, locationId } },
  });
}

async function main() {
  console.log('Running TASK 10 inventory transfer stock integration checks…');
  await assertSafeTestEnvironment();

  const before = await snapshot();
  assert(before.mode === 'LEGACY', 'start in LEGACY');
  console.log('BEFORE', before);

  const wh = await prisma.location.findFirst({ where: { code: 'WH-MAIN', active: true } });
  const sr = await prisma.location.findFirst({ where: { code: 'SR-MAIN', active: true } });
  assert(wh && sr, 'need WH-MAIN and SR-MAIN');
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  assert(admin, 'need admin');

  const createdPillowIds: number[] = [];
  const createdTransferIds: number[] = [];

  try {
    // ─── Creation (no stock) ───
    {
      const pillow = await createTempPillow('create');
      createdPillowIds.push(pillow.id);

      const t = await transfers.createTransfer({
        sourceLocationId: wh.id,
        destinationLocationId: sr.id,
        reason: 'TASK10 create',
        lines: [{ pillowId: pillow.id, quantity: 5 }],
        createdById: admin.id,
      });
      createdTransferIds.push(t.id);
      assert(t.status === 'DRAFT', 'DRAFT');
      assert(t.lines[0].sentQuantity === 5 && t.lines[0].receivedQuantity === 0, 'qty');
      assert(t.reference.startsWith('TR-'), 'reference');
      record(1, 'Create valid DRAFT transfer', true);

      let failed = false;
      try {
        await transfers.createTransfer({
          sourceLocationId: 999999,
          destinationLocationId: sr.id,
          lines: [{ pillowId: pillow.id, quantity: 1 }],
        });
      } catch (e) {
        failed = e instanceof TransferDomainError && e.code === 'INVALID_LOCATION';
      }
      assert(failed, 'invalid location');
      record(2, 'Invalid source/destination rejected', true);

      failed = false;
      try {
        await transfers.createTransfer({
          sourceLocationId: wh.id,
          destinationLocationId: wh.id,
          lines: [{ pillowId: pillow.id, quantity: 1 }],
        });
      } catch (e) {
        failed = e instanceof TransferDomainError && e.code === 'SOURCE_DESTINATION_MUST_DIFFER';
      }
      assert(failed, 'same loc');
      record(3, 'Source = destination rejected', true);

      failed = false;
      try {
        await transfers.createTransfer({
          sourceLocationId: wh.id,
          destinationLocationId: sr.id,
          lines: [{ pillowId: pillow.id, quantity: -1 }],
        });
      } catch (e) {
        failed = e instanceof TransferDomainError && e.code === 'INVALID_QUANTITY';
      }
      assert(failed, 'neg');
      record(4, 'Negative quantity rejected', true);

      failed = false;
      try {
        await transfers.createTransfer({
          sourceLocationId: wh.id,
          destinationLocationId: sr.id,
          lines: [{ pillowId: pillow.id, quantity: 0 }],
        });
      } catch (e) {
        failed = e instanceof TransferDomainError && e.code === 'INVALID_QUANTITY';
      }
      assert(failed, 'zero');
      record(5, 'Zero quantity rejected', true);

      failed = false;
      try {
        await transfers.createTransfer({
          sourceLocationId: wh.id,
          destinationLocationId: sr.id,
          lines: [{ pillowId: 99999999, quantity: 1 }],
        });
      } catch (e) {
        failed = e instanceof TransferDomainError && e.code === 'INVALID_PILLOW';
      }
      assert(failed, 'unknown pillow');
      record(6, 'Unknown Pillow rejected', true);
    }

    // ─── INVENTORY mode stock effects ───
    await setInventoryMode('INVENTORY');
    assert((await getInventoryMode(prisma)) === 'INVENTORY', 'mode INVENTORY for stock tests');

    {
      const pillow = await createTempPillow('dispatch');
      createdPillowIds.push(pillow.id);
      await bootstrapBalances(pillow.id, wh.id, sr.id, {
        whPhysical: 20,
        whReserved: 8,
        srPhysical: 0,
      });
      // available = 20-0-8 = 12
      const beforeWh = await bal(pillow.id, wh.id);
      assert(beforeWh && computeAvailable(beforeWh.physical, beforeWh.presentation, beforeWh.reserved) === 12, 'avail 12');
      const stockBefore = (await prisma.pillow.findUnique({ where: { id: pillow.id } }))!.stock;

      const t = await transfers.createTransfer({
        sourceLocationId: wh.id,
        destinationLocationId: sr.id,
        lines: [{ pillowId: pillow.id, quantity: 10 }],
        createdById: admin.id,
      });
      createdTransferIds.push(t.id);

      const bs = await documents.dispatchTransfer(t.id, admin.id);
      assert(bs.status === 'VALIDATED' && bs.type === 'BON_SORTIE', 'BS validated');
      const after = await transfers.getTransfer(t.id);
      assert(after.status === 'DISPATCHED', 'DISPATCHED');
      record(7, 'DRAFT dispatch with enough available stock', true);

      const whAfter = await bal(pillow.id, wh.id);
      assert(whAfter!.physical === 10, `physical 10 got ${whAfter!.physical}`);
      record(8, 'Physical decreases correctly', true);

      const mov = await prisma.stockMovement.findFirst({
        where: { pillowId: pillow.id, type: 'TRANSFER_OUT', referenceType: 'TRANSFER', referenceId: t.id },
        orderBy: { id: 'desc' },
      });
      assert(mov && mov.previousPhysical === 20 && mov.newPhysical === 10, 'TRANSFER_OUT');
      assert(mov.referenceNumber === after.referenceNumber, 'ref number');
      record(9, 'TRANSFER_OUT movement created', true);

      assert(whAfter!.presentation === 0, 'presentation unchanged (warehouse)');
      record(10, 'Presentation unchanged', true);
      assert(whAfter!.reserved === 8, 'reserved unchanged');
      record(11, 'Reserved unchanged', true);

      assert(after.lines[0].inTransitQuantity === 10, 'inTransit 10');
      assert(after.lines[0].availableRemainingToReceive === 10, 'remaining 10');
      record(12, 'In-transit calculated correctly', true);

      // Company physical conserved via mirror (physical 10 + inTransit 10 = 20)
      const stockAfter = (await prisma.pillow.findUnique({ where: { id: pillow.id } }))!.stock;
      assert(stockAfter === stockBefore, `mirror conserved ${stockAfter} vs ${stockBefore}`);

      // Insufficient available: available now = 10-5-3 = 2
      const tFail = await transfers.createTransfer({
        sourceLocationId: wh.id,
        destinationLocationId: sr.id,
        lines: [{ pillowId: pillow.id, quantity: 5 }],
      });
      createdTransferIds.push(tFail.id);
      let failed = false;
      try {
        await documents.dispatchTransfer(tFail.id, admin.id);
      } catch (e) {
        failed = e instanceof TransferDomainError && e.code === 'INSUFFICIENT_AVAILABLE_STOCK';
      }
      assert(failed, 'insufficient');
      assert((await transfers.getTransfer(tFail.id)).status === 'DRAFT', 'still DRAFT');
      assert((await bal(pillow.id, wh.id))!.physical === 10, 'physical unchanged after reject');
      record(13, 'Insufficient available stock rejected', true);

      // Rollback: multi-line where second exceeds available
      const pillow2 = await createTempPillow('rollback');
      createdPillowIds.push(pillow2.id);
      await bootstrapBalances(pillow2.id, wh.id, sr.id, { whPhysical: 5, srPhysical: 0 });
      const pillow3 = await createTempPillow('rollback-b');
      createdPillowIds.push(pillow3.id);
      await bootstrapBalances(pillow3.id, wh.id, sr.id, { whPhysical: 1, srPhysical: 0 });

      const tRoll = await transfers.createTransfer({
        sourceLocationId: wh.id,
        destinationLocationId: sr.id,
        lines: [
          { pillowId: pillow2.id, quantity: 3 },
          { pillowId: pillow3.id, quantity: 5 }, // exceeds available 1
        ],
      });
      createdTransferIds.push(tRoll.id);
      const phys2Before = (await bal(pillow2.id, wh.id))!.physical;
      failed = false;
      try {
        await documents.dispatchTransfer(tRoll.id, admin.id);
      } catch (e) {
        failed = e instanceof TransferDomainError;
      }
      assert(failed, 'rollback dispatch failed');
      assert((await bal(pillow2.id, wh.id))!.physical === phys2Before, 'line1 rolled back');
      assert((await transfers.getTransfer(tRoll.id)).status === 'DRAFT', 'rollback status');
      record(14, 'Rollback on failure', true);
    }

    // ─── Partial + final receipt ───
    {
      const pillow = await createTempPillow('receive');
      createdPillowIds.push(pillow.id);
      await bootstrapBalances(pillow.id, wh.id, sr.id, { whPhysical: 10, srPhysical: 0 });

      const t = await transfers.createTransfer({
        sourceLocationId: wh.id,
        destinationLocationId: sr.id,
        lines: [{ pillowId: pillow.id, quantity: 10 }],
      });
      createdTransferIds.push(t.id);
      await documents.dispatchTransfer(t.id, admin.id);

      const be1 = await documents.receiveTransfer(
        t.id,
        [{ pillowId: pillow.id, quantity: 6 }],
        admin.id
      );
      assert(be1.status === 'VALIDATED' && be1.type === 'BON_ENTREE', 'BE1');
      let tr = await transfers.getTransfer(t.id);
      assert(tr.status === 'PARTIALLY_RECEIVED', 'partial');
      assert(tr.lines[0].receivedQuantity === 6 && tr.lines[0].inTransitQuantity === 4, '6/4');
      record(15, 'Receive part of transfer', true);

      const srBal = await bal(pillow.id, sr.id);
      assert(srBal!.physical === 6, 'dest +6');
      record(16, 'Destination physical increases', true);

      const movIn = await prisma.stockMovement.findFirst({
        where: { pillowId: pillow.id, type: 'TRANSFER_IN', referenceId: t.id },
        orderBy: { id: 'desc' },
      });
      assert(movIn && movIn.newPhysical === 6, 'TRANSFER_IN');
      record(17, 'TRANSFER_IN created', true);
      record(18, 'Remaining in-transit correct', true, '4');
      record(19, 'Status = PARTIALLY_RECEIVED', true);

      await documents.receiveTransfer(t.id, [{ pillowId: pillow.id, quantity: 4 }], admin.id);
      tr = await transfers.getTransfer(t.id);
      assert(tr.status === 'RECEIVED', 'RECEIVED');
      assert(tr.lines[0].inTransitQuantity === 0 && tr.lines[0].receivedQuantity === 10, 'done');
      record(20, 'Receive remaining quantity', true);
      record(21, 'Status = RECEIVED', true);
      record(22, 'In-transit = 0', true);
      assert((await bal(pillow.id, sr.id))!.physical === 10, 'dest 10');
      assert((await bal(pillow.id, wh.id))!.physical === 0, 'src 0');
      record(23, 'Destination physical correct', true);

      // Over-receive on fresh partial
      const t2 = await transfers.createTransfer({
        sourceLocationId: sr.id,
        destinationLocationId: wh.id,
        lines: [{ pillowId: pillow.id, quantity: 5 }],
      });
      createdTransferIds.push(t2.id);
      await documents.dispatchTransfer(t2.id, admin.id);
      await documents.receiveTransfer(t2.id, [{ pillowId: pillow.id, quantity: 3 }], admin.id);
      let failed = false;
      try {
        await documents.receiveTransfer(t2.id, [{ pillowId: pillow.id, quantity: 4 }], admin.id);
      } catch (e) {
        failed = e instanceof TransferDomainError && e.code === 'OVER_RECEIVE';
      }
      assert(failed, 'over-receive');
      assert((await transfers.getTransfer(t2.id)).lines[0].receivedQuantity === 3, 'still 3');
      record(24, 'Over-receive rejected', true);
    }

    // ─── Concurrency ───
    {
      const pillow = await createTempPillow('conc');
      createdPillowIds.push(pillow.id);
      await bootstrapBalances(pillow.id, wh.id, sr.id, { whPhysical: 10, srPhysical: 0 });
      const t = await transfers.createTransfer({
        sourceLocationId: wh.id,
        destinationLocationId: sr.id,
        lines: [{ pillowId: pillow.id, quantity: 10 }],
      });
      createdTransferIds.push(t.id);
      await documents.dispatchTransfer(t.id, admin.id);
      await documents.receiveTransfer(t.id, [{ pillowId: pillow.id, quantity: 6 }], admin.id);

      const draftA = await documents.createDraftDocument({
        type: 'BON_ENTREE',
        transferId: t.id,
        lines: [{ pillowId: pillow.id, quantity: 3 }],
      });
      const draftB = await documents.createDraftDocument({
        type: 'BON_ENTREE',
        transferId: t.id,
        lines: [{ pillowId: pillow.id, quantity: 3 }],
      });
      const recvResults = await Promise.allSettled([
        documents.validateDocument(draftA.id, admin.id),
        documents.validateDocument(draftB.id, admin.id),
      ]);
      const ok = recvResults.filter((r) => r.status === 'fulfilled').length;
      const fail = recvResults.filter((r) => r.status === 'rejected').length;
      assert(ok === 1 && fail === 1, `recv concurrent ${ok}/${fail}`);
      assert((await transfers.getTransfer(t.id)).lines[0].receivedQuantity === 9, 'received 9');
      record(25, 'Two simultaneous receives cannot over-receive', true);

      // Double dispatch
      const pillowD = await createTempPillow('dbl-dispatch');
      createdPillowIds.push(pillowD.id);
      await bootstrapBalances(pillowD.id, wh.id, sr.id, { whPhysical: 8, srPhysical: 0 });
      const td = await transfers.createTransfer({
        sourceLocationId: wh.id,
        destinationLocationId: sr.id,
        lines: [{ pillowId: pillowD.id, quantity: 5 }],
      });
      createdTransferIds.push(td.id);
      const bs = await documents.createDraftDocument({
        type: 'BON_SORTIE',
        transferId: td.id,
        lines: [{ pillowId: pillowD.id, quantity: 5 }],
      });
      const dispResults = await Promise.allSettled([
        documents.validateDocument(bs.id, admin.id),
        documents.validateDocument(bs.id, admin.id),
      ]);
      const dok = dispResults.filter((r) => r.status === 'fulfilled').length;
      assert(dok === 1, `double dispatch ok=${dok}`);
      assert((await bal(pillowD.id, wh.id))!.physical === 3, 'decreased once');
      record(26, 'Two simultaneous dispatches cannot double-decrease stock', true);

      const nums = await Promise.all([
        sequences.nextNumber('BS'),
        sequences.nextNumber('BS'),
        sequences.nextNumber('BE'),
        sequences.nextNumber('BE'),
        sequences.nextNumber('TR'),
        sequences.nextNumber('TR'),
      ]);
      assert(new Set(nums).size === nums.length, 'unique seq');
      record(27, 'Document sequence cannot duplicate numbers', true);
    }

    // ─── Immutability ───
    {
      const pillow = await createTempPillow('immute');
      createdPillowIds.push(pillow.id);
      await bootstrapBalances(pillow.id, wh.id, sr.id, { whPhysical: 5, srPhysical: 0 });
      const t = await transfers.createTransfer({
        sourceLocationId: wh.id,
        destinationLocationId: sr.id,
        lines: [{ pillowId: pillow.id, quantity: 2 }],
      });
      createdTransferIds.push(t.id);
      const bs = await documents.dispatchTransfer(t.id, admin.id);
      let failed = false;
      try {
        await documents.updateDraftDocument(bs.id, { reason: 'hack' });
      } catch (e) {
        failed = e instanceof TransferDomainError && e.code === 'FORBIDDEN_STATUS';
      }
      assert(failed, 'BS immutable');
      record(28, 'Validated BS cannot be edited', true);

      const be = await documents.receiveTransfer(t.id, [{ pillowId: pillow.id, quantity: 2 }], admin.id);
      failed = false;
      try {
        await documents.updateDraftDocument(be.id, { reason: 'hack' });
      } catch (e) {
        failed = e instanceof TransferDomainError && e.code === 'FORBIDDEN_STATUS';
      }
      assert(failed, 'BE immutable');
      record(29, 'Validated BE cannot be edited', true);

      failed = false;
      try {
        await documents.cancelDraftDocument(bs.id);
      } catch (e) {
        failed = e instanceof TransferDomainError && e.code === 'FORBIDDEN_STATUS';
      }
      assert(failed, 'no cancel validated');
      // No delete API — cancel is the destructive path
      record(30, 'Validated documents cannot be deleted/cancelled', true);

      const tDraft = await transfers.createTransfer({
        sourceLocationId: wh.id,
        destinationLocationId: sr.id,
        lines: [{ pillowId: pillow.id, quantity: 1 }],
      });
      createdTransferIds.push(tDraft.id);
      const edited = await transfers.updateDraftTransfer(tDraft.id, { reason: 'ok edit' });
      assert(edited.reason === 'ok edit', 'draft editable');
      record(31, 'DRAFT remains editable', true);
    }

    // ─── Presentation / reservation ───
    {
      const pillow = await createTempPillow('pres');
      createdPillowIds.push(pillow.id);
      // Showroom source: physical 20, presentation 5, reserved 3 → available 12
      await bootstrapBalances(pillow.id, wh.id, sr.id, {
        whPhysical: 0,
        srPhysical: 20,
        srPresentation: 5,
        srReserved: 3,
      });
      const t = await transfers.createTransfer({
        sourceLocationId: sr.id,
        destinationLocationId: wh.id,
        lines: [{ pillowId: pillow.id, quantity: 13 }], // > 12
      });
      createdTransferIds.push(t.id);
      let failed = false;
      try {
        await documents.dispatchTransfer(t.id, admin.id);
      } catch (e) {
        failed = e instanceof TransferDomainError && e.code === 'INSUFFICIENT_AVAILABLE_STOCK';
      }
      assert(failed, 'cannot take presentation');
      const b = await bal(pillow.id, sr.id);
      assert(b!.physical === 20 && b!.presentation === 5 && b!.reserved === 3, 'unchanged');
      record(32, 'Transfer cannot consume presentation stock', true);
      record(33, 'Transfer cannot consume reserved stock', true);
      assert(computeAvailable(b!.physical, b!.presentation, b!.reserved) === 12, 'avail 12');
      record(34, 'Available calculation remains correct', true);
    }

    // ─── Cancellation ───
    {
      const pillow = await createTempPillow('cancel');
      createdPillowIds.push(pillow.id);
      await bootstrapBalances(pillow.id, wh.id, sr.id, { whPhysical: 5, srPhysical: 0 });
      const t = await transfers.createTransfer({
        sourceLocationId: wh.id,
        destinationLocationId: sr.id,
        lines: [{ pillowId: pillow.id, quantity: 2 }],
      });
      createdTransferIds.push(t.id);
      const cancelled = await transfers.cancelDraftTransfer(t.id);
      assert(cancelled.status === 'CANCELLED', 'cancelled');
      record(35, 'DRAFT can cancel', true);

      const t2 = await transfers.createTransfer({
        sourceLocationId: wh.id,
        destinationLocationId: sr.id,
        lines: [{ pillowId: pillow.id, quantity: 2 }],
      });
      createdTransferIds.push(t2.id);
      await documents.dispatchTransfer(t2.id, admin.id);
      let failed = false;
      try {
        await transfers.cancelDraftTransfer(t2.id);
      } catch (e) {
        failed = e instanceof TransferDomainError && e.code === 'CANCELLATION_NOT_ALLOWED';
      }
      assert(failed, 'no silent cancel dispatched');
      record(36, 'DISPATCHED cannot silently cancel', true);

      await documents.receiveTransfer(t2.id, [{ pillowId: pillow.id, quantity: 2 }], admin.id);
      failed = false;
      try {
        await transfers.cancelDraftTransfer(t2.id);
      } catch (e) {
        failed = e instanceof TransferDomainError && e.code === 'CANCELLATION_NOT_ALLOWED';
      }
      assert(failed, 'no cancel received');
      record(37, 'RECEIVED cannot cancel', true);
    }

    // ─── Mirror ───
    {
      const pillow = await createTempPillow('mirror');
      createdPillowIds.push(pillow.id);
      await bootstrapBalances(pillow.id, wh.id, sr.id, { whPhysical: 10, srPhysical: 0 });
      const start = (await prisma.pillow.findUnique({ where: { id: pillow.id } }))!.stock;
      assert(start === 10, 'start stock 10');

      const t = await transfers.createTransfer({
        sourceLocationId: wh.id,
        destinationLocationId: sr.id,
        lines: [{ pillowId: pillow.id, quantity: 4 }],
      });
      createdTransferIds.push(t.id);
      await documents.dispatchTransfer(t.id, admin.id);
      const mid = (await prisma.pillow.findUnique({ where: { id: pillow.id } }))!.stock;
      assert(mid === 10, `after BS mirror still 10 (got ${mid})`);
      await documents.receiveTransfer(t.id, [{ pillowId: pillow.id, quantity: 4 }], admin.id);
      const end = (await prisma.pillow.findUnique({ where: { id: pillow.id } }))!.stock;
      assert(end === 10, `after BE mirror still 10 (got ${end})`);
      record(38, 'Pillow.stock compatibility mirror remains correct in INVENTORY mode', true);
    }

    // ─── LEGACY mode: no InventoryBalance mutation on validate ───
    await setInventoryMode('LEGACY');
    {
      const pillow = await createTempPillow('legacy');
      createdPillowIds.push(pillow.id);
      // Seed balances but mode LEGACY — validate must NOT mutate them
      await prisma.inventoryBalance.create({
        data: { pillowId: pillow.id, locationId: wh.id, physical: 7, presentation: 0, reserved: 0 },
      });
      await prisma.inventoryBalance.create({
        data: { pillowId: pillow.id, locationId: sr.id, physical: 0, presentation: 0, reserved: 0 },
      });
      await prisma.pillow.update({ where: { id: pillow.id }, data: { stock: 99 } });

      const t = await transfers.createTransfer({
        sourceLocationId: wh.id,
        destinationLocationId: sr.id,
        lines: [{ pillowId: pillow.id, quantity: 3 }],
      });
      createdTransferIds.push(t.id);
      const movBefore = await prisma.stockMovement.count({ where: { pillowId: pillow.id } });
      await documents.dispatchTransfer(t.id, admin.id);
      assert((await bal(pillow.id, wh.id))!.physical === 7, 'LEGACY no WH decrease');
      assert((await prisma.stockMovement.count({ where: { pillowId: pillow.id } })) === movBefore, 'no mov');
      assert((await prisma.pillow.findUnique({ where: { id: pillow.id } }))!.stock === 99, 'Pillow.stock untouched');
      await documents.receiveTransfer(t.id, [{ pillowId: pillow.id, quantity: 3 }], admin.id);
      assert((await bal(pillow.id, sr.id))!.physical === 0, 'LEGACY no SR increase');
      assert((await transfers.getTransfer(t.id)).status === 'RECEIVED', 'doc status still works');
      record(39, 'Existing legacy behavior remains intact', true);
    }
  } finally {
    await setInventoryMode('LEGACY');
    await cleanupTransfers(createdTransferIds);
    for (const id of createdPillowIds) {
      await destroyPillow(id);
    }
  }

  const after = await snapshot();
  assert(after.mode === 'LEGACY', 'mode restored LEGACY');
  assert(after.stockSum === before.stockSum, 'production Pillow.stock sum unchanged');
  assert(after.historyCount === before.historyCount, 'history unchanged');
  assert(after.balanceCount === before.balanceCount, 'balances unchanged');
  assert(after.movementCount === before.movementCount, 'movements unchanged');
  assert(after.pillowCount === before.pillowCount, 'pillow count unchanged');
  console.log('Production safety PASS', { before, after });

  const failed = results.filter((r) => !r.pass);
  if (failed.length) {
    console.error('FAILED', failed);
    process.exit(1);
  }
  console.log(`ALL ${results.length} TASK 10 CHECKS PASSED`);
  console.log(
    JSON.stringify({
      productionUntouched: true,
      inventoryMode: after.mode,
      testCount: results.length,
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
