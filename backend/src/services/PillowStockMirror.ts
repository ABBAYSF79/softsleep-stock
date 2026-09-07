import { Prisma, PrismaClient } from '@prisma/client';

type TxClient = Prisma.TransactionClient;

/**
 * Compatibility mirror: Pillow.stock reflects company physical inventory
 * ONLY when InventoryBalance rows exist for the pillow (migrated state).
 *
 * companyPhysical = SUM(InventoryBalance.physical) + open transfer in-transit
 *
 * Do NOT call this to invent balances for unmigrated pillows.
 */
export async function isPillowInventoryMigrated(
  client: PrismaClient | TxClient,
  pillowId: number
): Promise<boolean> {
  const count = await client.inventoryBalance.count({ where: { pillowId } });
  return count > 0;
}

export async function computeCompanyPhysicalStock(
  tx: TxClient,
  pillowId: number
): Promise<number> {
  const bal = await tx.inventoryBalance.aggregate({
    where: { pillowId },
    _sum: { physical: true },
  });
  const physical = bal._sum.physical ?? 0;

  const transitRows = await tx.$queryRaw<Array<{ qty: number | bigint | null }>>`
    SELECT COALESCE(SUM(tl.sentQuantity - tl.receivedQuantity), 0) AS qty
    FROM TransferLine tl
    INNER JOIN Transfer t ON t.id = tl.transferId
    WHERE tl.pillowId = ${pillowId}
      AND t.status IN ('DISPATCHED', 'PARTIALLY_RECEIVED')
  `;

  const inTransit = Number(transitRows[0]?.qty ?? 0);
  return physical + inTransit;
}

/**
 * Sync Pillow.stock from inventory balances + in-transit.
 * No-op (returns null) if pillow is not migrated (no InventoryBalance rows).
 *
 * Locks the Pillow row FOR UPDATE first, then locks all InventoryBalance rows
 * for the pillow so aggregate reads are current (not a stale REPEATABLE READ
 * snapshot). Concurrent multi-location mutations must lock Pillow before their
 * own balance row (see InventoryService.mutateBalanceInTx).
 */
export async function syncPillowStockMirror(
  tx: TxClient,
  pillowId: number
): Promise<{ previousStock: number; newStock: number } | null> {
  const migrated = await isPillowInventoryMigrated(tx, pillowId);
  if (!migrated) {
    return null;
  }

  const locked = await tx.$queryRaw<Array<{ id: number; stock: number }>>`
    SELECT id, stock
    FROM Pillow
    WHERE id = ${pillowId}
    FOR UPDATE
  `;
  const pillow = locked[0];
  if (!pillow) {
    throw new Error(`Pillow ${pillowId} not found while syncing stock mirror`);
  }

  // Current read of all location balances (avoids stale RR snapshot SUM)
  const balRows = await tx.$queryRaw<Array<{ physical: number }>>`
    SELECT physical FROM InventoryBalance WHERE pillowId = ${pillowId} FOR UPDATE
  `;
  const physicalSum = balRows.reduce((s, r) => s + Number(r.physical), 0);

  const transitRows = await tx.$queryRaw<Array<{ qty: number | bigint | null }>>`
    SELECT COALESCE(SUM(tl.sentQuantity - tl.receivedQuantity), 0) AS qty
    FROM TransferLine tl
    INNER JOIN Transfer t ON t.id = tl.transferId
    WHERE tl.pillowId = ${pillowId}
      AND t.status IN ('DISPATCHED', 'PARTIALLY_RECEIVED')
  `;
  const inTransit = Number(transitRows[0]?.qty ?? 0);
  const newStock = physicalSum + inTransit;
  if (newStock < 0) {
    throw new Error(`Computed company physical stock is negative for pillow ${pillowId}`);
  }

  if (pillow.stock !== newStock) {
    await tx.pillow.update({
      where: { id: pillowId },
      data: { stock: newStock },
    });
  }

  return { previousStock: pillow.stock, newStock };
}
