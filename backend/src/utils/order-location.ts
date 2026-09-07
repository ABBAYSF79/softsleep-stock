import { Prisma, PrismaClient } from '@prisma/client';

type DbClient = PrismaClient | Prisma.TransactionClient;

export class OrderLocationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'OrderLocationError';
    this.code = code;
  }
}

/** Compact location payload for order API responses (backward-compatible additive). */
export const orderLocationSelect = {
  id: true,
  code: true,
  name: true,
  type: true,
  active: true,
  isSellable: true,
} as const;

export type OrderLocationSnapshot = {
  id: number;
  code: string;
  name: string;
  type: string;
  active: boolean;
  isSellable: boolean;
};

/**
 * Resolve optional fulfillment location for an order.
 * - omitted / null / '' → null (LEGACY / UNKNOWN) — never defaults to WH-MAIN or SR-MAIN
 * - provided id must exist, be active, and isSellable
 */
export async function resolveOptionalSellableLocationId(
  client: DbClient,
  raw: unknown
): Promise<number | null> {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return null;
  }

  const locationId = Number(raw);
  if (!Number.isInteger(locationId) || locationId <= 0) {
    throw new OrderLocationError('INVALID_LOCATION', 'Invalid locationId');
  }

  const location = await client.location.findUnique({ where: { id: locationId } });
  if (!location) {
    throw new OrderLocationError('INVALID_LOCATION', 'Location not found');
  }
  if (!location.active) {
    throw new OrderLocationError('INACTIVE_LOCATION', 'Location is inactive');
  }
  if (!location.isSellable) {
    throw new OrderLocationError('NON_SELLABLE_LOCATION', 'Location is not sellable for order fulfillment');
  }

  return location.id;
}

export function orderLocationErrorToHttp(error: unknown): {
  status: number;
  body: { error: string; code?: string };
} | null {
  if (error instanceof OrderLocationError) {
    return { status: 400, body: { error: error.message, code: error.code } };
  }
  return null;
}

/**
 * Whether changing fulfillment location is allowed for the current order status.
 * Location is metadata only in TASK 8 — never moves InventoryBalance.
 * Block when accessory/mattress stock has already been deducted for this order.
 */
export function canChangeOrderFulfillmentLocation(status: string): boolean {
  return status === 'PENDING' || status === 'RETURNED';
}
