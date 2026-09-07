/**
 * TASK 5 Transfer + BS/BE foundation tests.
 * No InventoryBalance / StockMovement / Pillow.stock mutations expected.
 * Cleans up all transfer/document rows it creates.
 *
 * Usage: npx ts-node scripts/test-transfer-documents.ts
 */
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { TransferService } from '../src/services/TransferService';
import { StockDocumentService } from '../src/services/StockDocumentService';
import { DocumentSequenceService } from '../src/services/DocumentSequenceService';
import { TransferDomainError } from '../src/services/transfer-errors';

dotenv.config();

const prisma = new PrismaClient();
const transfers = new TransferService(prisma);
const documents = new StockDocumentService(prisma);
const sequences = new DocumentSequenceService(prisma);

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
}

async function legacySnapshot() {
  return {
    pillowCount: await prisma.pillow.count(),
    stockSum: (await prisma.pillow.aggregate({ _sum: { stock: true } }))._sum.stock ?? 0,
    historyCount: await prisma.pillowStockHistory.count(),
    locationCount: await prisma.location.count(),
    balanceCount: await prisma.inventoryBalance.count(),
    movementCount: await prisma.stockMovement.count(),
  };
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

async function main() {
  console.log('Running TASK 5 transfer/document checks…');
  const before = await legacySnapshot();
  const createdTransferIds: number[] = [];

  const wh = await prisma.location.findFirst({ where: { code: 'WH-MAIN' } });
  const sr = await prisma.location.findFirst({ where: { code: 'SR-MAIN' } });
  const pillow = await prisma.pillow.findFirst({ orderBy: { id: 'asc' } });
  assert(wh && sr && pillow, 'need WH-MAIN, SR-MAIN, and a pillow');

  // Test 1 — create transfer
  const t1 = await transfers.createTransfer({
    sourceLocationId: wh.id,
    destinationLocationId: sr.id,
    reason: 'TASK5 test',
    lines: [{ pillowId: pillow.id, quantity: 10 }],
  });
  createdTransferIds.push(t1.id);
  assert(t1.status === 'DRAFT', 'status DRAFT');
  assert(t1.referenceNumber.startsWith('TR-'), 'TR number');
  assert(t1.lines[0].sentQuantity === 10 && t1.lines[0].inTransit === 10, 'line 10 in transit conceptually');
  // before dispatch, received=0 so inTransit = sent - received = 10, but status DRAFT — OK for display
  console.log('Test 1 PASS — transfer creation');

  // Test 2 — same source/destination
  let failed = false;
  try {
    await transfers.createTransfer({
      sourceLocationId: wh.id,
      destinationLocationId: wh.id,
      lines: [{ pillowId: pillow.id, quantity: 1 }],
    });
  } catch (e) {
    failed = e instanceof TransferDomainError && e.code === 'SOURCE_DESTINATION_MUST_DIFFER';
  }
  assert(failed, 'same location must fail');
  console.log('Test 2 PASS — source != destination');

  // Test 3 — invalid quantities
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
  assert(failed, 'qty 0 must fail');
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
  assert(failed, 'qty -1 must fail');
  console.log('Test 3 PASS — invalid quantity');

  // Test 4 — BS creation
  const bs = await documents.createDraftDocument({
    type: 'BON_SORTIE',
    transferId: t1.id,
    lines: [{ pillowId: pillow.id, quantity: 10 }],
  });
  assert(bs.status === 'DRAFT', 'BS DRAFT');
  assert(bs.documentNumber.startsWith('BS-'), 'BS number');
  assert(bs.locationId === wh.id, 'BS location = source');
  console.log('Test 4 PASS — BS creation');

  // Test 5 — second BS fails
  failed = false;
  try {
    await documents.createDraftDocument({
      type: 'BON_SORTIE',
      transferId: t1.id,
      lines: [{ pillowId: pillow.id, quantity: 10 }],
    });
  } catch (e) {
    failed = e instanceof TransferDomainError && e.code === 'DUPLICATE_BON_SORTIE';
  }
  assert(failed, 'second BS must fail');
  console.log('Test 5 PASS — one BS per transfer');

  // Test 13 — draft edit transfer
  const edited = await transfers.updateDraftTransfer(t1.id, { reason: 'edited draft' });
  assert(edited.reason === 'edited draft', 'draft editable');
  console.log('Test 13 PASS — draft edit');

  // Test 6 — dispatch via validate BS
  const midBalances = await prisma.inventoryBalance.count();
  const midMovements = await prisma.stockMovement.count();
  const midStock = (await prisma.pillow.aggregate({ _sum: { stock: true } }))._sum.stock ?? 0;
  await documents.validateDocument(bs.id);
  const afterDispatch = await transfers.getTransfer(t1.id);
  assert(afterDispatch.status === 'DISPATCHED', 'DISPATCHED');
  assert((await prisma.inventoryBalance.count()) === midBalances, 'no balance mutation');
  assert((await prisma.stockMovement.count()) === midMovements, 'no movement mutation');
  assert(((await prisma.pillow.aggregate({ _sum: { stock: true } }))._sum.stock ?? 0) === midStock, 'Pillow.stock unchanged');
  console.log('Test 6 PASS — dispatch without stock mutation');

  // Test 12 — validated BS immutable
  failed = false;
  try {
    await documents.updateDraftDocument(bs.id, { reason: 'hack' });
  } catch (e) {
    failed = e instanceof TransferDomainError && e.code === 'FORBIDDEN_STATUS';
  }
  assert(failed, 'validated BS not editable');
  console.log('Test 12 PASS — document immutability');

  // Test 7 — first BE receive 4
  const be1 = await documents.createDraftDocument({
    type: 'BON_ENTREE',
    transferId: t1.id,
    lines: [{ pillowId: pillow.id, quantity: 4 }],
  });
  await documents.validateDocument(be1.id);
  let t = await transfers.getTransfer(t1.id);
  assert(t.status === 'PARTIALLY_RECEIVED', 'PARTIALLY_RECEIVED');
  assert(t.lines[0].receivedQuantity === 4 && t.lines[0].inTransit === 6, '4/6');
  console.log('Test 7 PASS — first BE');

  // Test 8 — second BE receive 3
  const be2 = await documents.createDraftDocument({
    type: 'BON_ENTREE',
    transferId: t1.id,
    lines: [{ pillowId: pillow.id, quantity: 3 }],
  });
  await documents.validateDocument(be2.id);
  t = await transfers.getTransfer(t1.id);
  assert(t.lines[0].receivedQuantity === 7 && t.lines[0].inTransit === 3, '7/3');
  assert(t.status === 'PARTIALLY_RECEIVED', 'still partial');
  console.log('Test 8 PASS — second BE');

  // Test 9 — final BE receive 3
  const be3 = await documents.createDraftDocument({
    type: 'BON_ENTREE',
    transferId: t1.id,
    lines: [{ pillowId: pillow.id, quantity: 3 }],
  });
  await documents.validateDocument(be3.id);
  t = await transfers.getTransfer(t1.id);
  assert(t.lines[0].receivedQuantity === 10 && t.lines[0].inTransit === 0, 'complete');
  assert(t.status === 'RECEIVED', 'RECEIVED');
  console.log('Test 9 PASS — final BE');

  // Fresh transfer for over-receive + concurrent tests
  const t2 = await transfers.createTransfer({
    sourceLocationId: wh.id,
    destinationLocationId: sr.id,
    lines: [{ pillowId: pillow.id, quantity: 10 }],
  });
  createdTransferIds.push(t2.id);
  const bs2 = await documents.createDraftDocument({
    type: 'BON_SORTIE',
    transferId: t2.id,
    lines: [{ pillowId: pillow.id, quantity: 10 }],
  });
  await documents.validateDocument(bs2.id);
  const beEarly = await documents.createDraftDocument({
    type: 'BON_ENTREE',
    transferId: t2.id,
    lines: [{ pillowId: pillow.id, quantity: 8 }],
  });
  await documents.validateDocument(beEarly.id);

  // Test 10 — over-receiving
  failed = false;
  try {
    const over = await documents.createDraftDocument({
      type: 'BON_ENTREE',
      transferId: t2.id,
      lines: [{ pillowId: pillow.id, quantity: 3 }],
    });
    await documents.validateDocument(over.id);
  } catch (e) {
    failed = e instanceof TransferDomainError && e.code === 'OVER_RECEIVE';
  }
  assert(failed, 'over-receive must fail');
  t = await transfers.getTransfer(t2.id);
  assert(t.lines[0].receivedQuantity === 8, 'still 8 received');
  console.log('Test 10 PASS — over-receiving');

  // Test 11 — concurrent receiving (remaining 2; two BE drafts of 2 — only one validate wins if both try 2... 
  // Spec: remaining 4 with concurrent +3 +3. Reset with new transfer.
  const t3 = await transfers.createTransfer({
    sourceLocationId: wh.id,
    destinationLocationId: sr.id,
    lines: [{ pillowId: pillow.id, quantity: 10 }],
  });
  createdTransferIds.push(t3.id);
  const bs3 = await documents.createDraftDocument({
    type: 'BON_SORTIE',
    transferId: t3.id,
    lines: [{ pillowId: pillow.id, quantity: 10 }],
  });
  await documents.validateDocument(bs3.id);
  const beSetup = await documents.createDraftDocument({
    type: 'BON_ENTREE',
    transferId: t3.id,
    lines: [{ pillowId: pillow.id, quantity: 6 }],
  });
  await documents.validateDocument(beSetup.id);

  const draftA = await documents.createDraftDocument({
    type: 'BON_ENTREE',
    transferId: t3.id,
    lines: [{ pillowId: pillow.id, quantity: 3 }],
  });
  const draftB = await documents.createDraftDocument({
    type: 'BON_ENTREE',
    transferId: t3.id,
    lines: [{ pillowId: pillow.id, quantity: 3 }],
  });

  const results = await Promise.allSettled([
    documents.validateDocument(draftA.id),
    documents.validateDocument(draftB.id),
  ]);
  const okCount = results.filter((r) => r.status === 'fulfilled').length;
  const failCount = results.filter((r) => r.status === 'rejected').length;
  assert(okCount === 1 && failCount === 1, `expected 1 success 1 fail, got ${okCount}/${failCount}`);
  t = await transfers.getTransfer(t3.id);
  assert(t.lines[0].receivedQuantity === 9, `received must be 9 not 12, got ${t.lines[0].receivedQuantity}`);
  console.log('Test 11 PASS — concurrent receiving protected');

  // Test 15 — number uniqueness under concurrency
  const nums = await Promise.all([
    sequences.nextNumber('TR'),
    sequences.nextNumber('TR'),
    sequences.nextNumber('TR'),
    sequences.nextNumber('BS'),
    sequences.nextNumber('BS'),
    sequences.nextNumber('BE'),
    sequences.nextNumber('BE'),
  ]);
  assert(new Set(nums).size === nums.length, 'duplicate sequence numbers');
  console.log('Test 15 PASS — number uniqueness');

  // Cleanup
  await cleanupTransfers(createdTransferIds);

  const after = await legacySnapshot();
  assert(after.stockSum === before.stockSum, 'SUM(Pillow.stock) unchanged');
  assert(after.historyCount === before.historyCount, 'history unchanged');
  assert(after.balanceCount === before.balanceCount, 'balances unchanged');
  assert(after.movementCount === before.movementCount, 'movements unchanged');
  assert(after.locationCount === before.locationCount, 'locations unchanged');
  console.log('Test 14 PASS — legacy stock untouched');
  console.log(JSON.stringify({ before, after }));
  console.log('ALL TASK 5 CHECKS PASSED');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
