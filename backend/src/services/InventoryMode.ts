import { Prisma, PrismaClient } from '@prisma/client';

export type InventoryMode = 'LEGACY' | 'INVENTORY';

export const CUTOVER_SETTINGS_ID = 1;

/**
 * Read the explicit inventory cutover mode.
 * Default / missing row = LEGACY (safe for production until opening cutover commits).
 */
export async function getInventoryMode(
  prisma: PrismaClient | Prisma.TransactionClient
): Promise<InventoryMode> {
  const row = await prisma.inventoryCutoverSettings.findUnique({
    where: { id: CUTOVER_SETTINGS_ID },
  });
  if (!row) return 'LEGACY';
  return row.mode === 'INVENTORY' ? 'INVENTORY' : 'LEGACY';
}

export async function getCutoverSettings(prisma: PrismaClient | Prisma.TransactionClient) {
  return prisma.inventoryCutoverSettings.findUnique({ where: { id: CUTOVER_SETTINGS_ID } });
}
