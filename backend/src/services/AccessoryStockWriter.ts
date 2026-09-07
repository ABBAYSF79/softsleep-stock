import { PrismaClient } from '@prisma/client';
import { InventoryError, InventoryService, inventoryErrorToHttp } from './InventoryService';
import { getInventoryMode } from './InventoryMode';
import { isPillowInventoryMigrated } from './PillowStockMirror';

export { inventoryErrorToHttp };

export class AccessoryStockWriterError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'AccessoryStockWriterError';
    this.code = code;
  }
}

/**
 * Dual-path accessory stock writer (TASK 7 + TASK 13 hardening).
 *
 * - inventoryMode = LEGACY → Pillow.stock + PillowStockHistory
 * - inventoryMode = INVENTORY → InventoryService only (location required)
 *
 * Never guesses WH-MAIN / SR-MAIN.
 * Never writes Pillow.stock directly in INVENTORY mode (mirror only via InventoryService).
 */
export class AccessoryStockWriter {
  private readonly inventory: InventoryService;

  constructor(private readonly prisma: PrismaClient) {
    this.inventory = new InventoryService(prisma);
  }

  async isMigrated(pillowId: number): Promise<boolean> {
    return isPillowInventoryMigrated(this.prisma, pillowId);
  }

  private async isInventoryMode(): Promise<boolean> {
    return (await getInventoryMode(this.prisma)) === 'INVENTORY';
  }

  private async assertCutoverNotFrozen(context: string) {
    const { CutoverFreezeService, CutoverDomainError } = await import('./CutoverFreezeService');
    try {
      await new CutoverFreezeService(this.prisma).assertNotFrozen(this.prisma, context);
    } catch (e) {
      if (e instanceof CutoverDomainError) {
        throw new AccessoryStockWriterError(e.code, e.message);
      }
      throw e;
    }
  }

  /**
   * Resolve location id from explicit request fields only (no fallback).
   */
  resolveLocationId(body: { locationId?: unknown; locationCode?: unknown }): number | null {
    if (body.locationId !== undefined && body.locationId !== null && String(body.locationId).trim() !== '') {
      const id = Number(body.locationId);
      if (!Number.isInteger(id) || id <= 0) {
        throw new AccessoryStockWriterError('INVALID_LOCATION', 'Invalid locationId');
      }
      return id;
    }
    if (body.locationCode !== undefined && body.locationCode !== null && String(body.locationCode).trim() !== '') {
      return null;
    }
    return null;
  }

  async resolveLocationIdFromBody(body: {
    locationId?: unknown;
    locationCode?: unknown;
  }): Promise<number | null> {
    if (body.locationId !== undefined && body.locationId !== null && String(body.locationId).trim() !== '') {
      const id = Number(body.locationId);
      if (!Number.isInteger(id) || id <= 0) {
        throw new AccessoryStockWriterError('INVALID_LOCATION', 'Invalid locationId');
      }
      const loc = await this.prisma.location.findFirst({ where: { id, active: true } });
      if (!loc) throw new AccessoryStockWriterError('INVALID_LOCATION', 'Location not found or inactive');
      return loc.id;
    }
    if (body.locationCode !== undefined && body.locationCode !== null && String(body.locationCode).trim() !== '') {
      const code = String(body.locationCode).trim();
      const loc = await this.prisma.location.findFirst({ where: { code, active: true } });
      if (!loc) throw new AccessoryStockWriterError('INVALID_LOCATION', `Location code not found: ${code}`);
      return loc.id;
    }
    return null;
  }

  async supply(args: {
    pillowId: number;
    quantity: number;
    reason: string;
    userId: number;
    locationId?: number | null;
  }) {
    await this.assertCutoverNotFrozen('legacy/inventory supply');
    if (!(await this.isInventoryMode())) {
      return this.legacySupply(args);
    }
    if (!args.locationId) {
      throw new AccessoryStockWriterError(
        'INVENTORY_LOCATION_REQUIRED',
        'locationId (or locationCode) is required for supply in INVENTORY mode'
      );
    }
    await this.inventory.supply({
      pillowId: args.pillowId,
      locationId: args.locationId,
      quantity: args.quantity,
      reason: args.reason,
      userId: args.userId,
      referenceType: 'PILLOW_STOCK_SUPPLY',
    });
    const pillow = await this.prisma.pillow.findUnique({ where: { id: args.pillowId } });
    if (!pillow) throw new AccessoryStockWriterError('NOT_FOUND', 'Pillow not found');
    await this.prisma.activity.create({
      data: {
        userId: args.userId,
        type: 'PILLOW_SUPPLY',
        description: `Added ${args.quantity} to pillow "${pillow.name}" (inventory)`,
        details: args.reason,
      },
    });
    return { pillow, path: 'INVENTORY' as const };
  }

  async adjust(args: {
    pillowId: number;
    delta: number;
    reason: string;
    userId: number;
    locationId?: number | null;
  }) {
    await this.assertCutoverNotFrozen('legacy/inventory adjustment');
    if (!(await this.isInventoryMode())) {
      return this.legacyAdjust(args);
    }
    if (!args.locationId) {
      throw new AccessoryStockWriterError(
        'INVENTORY_LOCATION_REQUIRED',
        'locationId (or locationCode) is required for adjustment in INVENTORY mode'
      );
    }
    try {
      await this.inventory.adjustPhysical({
        pillowId: args.pillowId,
        locationId: args.locationId,
        delta: args.delta,
        reason: args.reason,
        userId: args.userId,
        referenceType: 'PILLOW_STOCK_ADJUSTMENT',
      });
    } catch (e) {
      if (e instanceof InventoryError) throw e;
      throw e;
    }
    const pillow = await this.prisma.pillow.findUnique({ where: { id: args.pillowId } });
    if (!pillow) throw new AccessoryStockWriterError('NOT_FOUND', 'Pillow not found');
    await this.prisma.activity.create({
      data: {
        userId: args.userId,
        type: 'PILLOW_ADJUSTMENT',
        description: `Adjusted pillow "${pillow.name}" by ${args.delta} (inventory)`,
        details: args.reason,
      },
    });
    return { pillow, path: 'INVENTORY' as const };
  }

  async setPresentation(args: {
    pillowId: number;
    presentation: number;
    reason?: string;
    userId: number;
    locationId?: number | null;
  }) {
    if (!(await this.isInventoryMode())) {
      throw new AccessoryStockWriterError(
        'INVENTORY_MODE_REQUIRED',
        'Presentation allocation is only available in INVENTORY mode'
      );
    }
    if (!args.locationId) {
      throw new AccessoryStockWriterError(
        'INVENTORY_LOCATION_REQUIRED',
        'locationId (or locationCode) is required for presentation in INVENTORY mode'
      );
    }
    await this.inventory.setPresentation({
      pillowId: args.pillowId,
      locationId: args.locationId,
      presentation: args.presentation,
      reason: args.reason,
      userId: args.userId,
      referenceType: 'PRESENTATION',
    });
    const pillow = await this.prisma.pillow.findUnique({ where: { id: args.pillowId } });
    if (!pillow) throw new AccessoryStockWriterError('NOT_FOUND', 'Pillow not found');
    await this.prisma.activity.create({
      data: {
        userId: args.userId,
        type: 'PILLOW_PRESENTATION',
        description: `Set presentation to ${args.presentation} for pillow "${pillow.name}"`,
        details: args.reason ?? null,
      },
    });
    return { pillow, path: 'INVENTORY' as const };
  }

  async outgoing(args: {
    pillowId: number;
    quantity: number;
    reason: string;
    userId: number;
    locationId?: number | null;
  }) {
    await this.assertCutoverNotFrozen('legacy/inventory outgoing');
    if (!(await this.isInventoryMode())) {
      return this.legacyOutgoing(args);
    }
    if (!args.locationId) {
      throw new AccessoryStockWriterError(
        'INVENTORY_LOCATION_REQUIRED',
        'locationId (or locationCode) is required for outgoing in INVENTORY mode'
      );
    }
    try {
      await this.inventory.decreasePhysical({
        pillowId: args.pillowId,
        locationId: args.locationId,
        quantity: args.quantity,
        type: 'SALE',
        reason: args.reason,
        userId: args.userId,
        referenceType: 'PILLOW_STOCK_OUTGOING',
        forceSyncMirror: true,
      });
    } catch (e) {
      if (e instanceof InventoryError && e.code === 'INSUFFICIENT_AVAILABLE_STOCK') {
        throw new AccessoryStockWriterError('INSUFFICIENT_STOCK', e.message);
      }
      throw e;
    }
    const pillow = await this.prisma.pillow.findUnique({ where: { id: args.pillowId } });
    if (!pillow) throw new AccessoryStockWriterError('NOT_FOUND', 'Pillow not found');
    await this.prisma.activity.create({
      data: {
        userId: args.userId,
        type: 'PILLOW_OUTGOING',
        description: `Removed ${args.quantity} from pillow "${pillow.name}" (inventory)`,
        details: args.reason,
      },
    });
    return { pillow, path: 'INVENTORY' as const };
  }

  private async legacySupply(args: {
    pillowId: number;
    quantity: number;
    reason: string;
    userId: number;
  }) {
    const result = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: number; name: string; stock: number }>>`
        SELECT id, name, stock
        FROM Pillow
        WHERE id = ${args.pillowId}
        FOR UPDATE
      `;
      const pillow = locked[0];
      if (!pillow) throw new AccessoryStockWriterError('NOT_FOUND', 'Pillow not found');

      const previousStock = pillow.stock;
      const newStock = previousStock + args.quantity;
      const updated = await tx.pillow.update({
        where: { id: args.pillowId },
        data: { stock: newStock },
      });
      await tx.pillowStockHistory.create({
        data: {
          pillowId: args.pillowId,
          quantity: args.quantity,
          type: 'SUPPLY',
          reason: args.reason,
          previousStock,
          newStock,
          userId: args.userId,
        },
      });
      await tx.activity.create({
        data: {
          userId: args.userId,
          type: 'PILLOW_SUPPLY',
          description: `Added ${args.quantity} to pillow "${pillow.name}"`,
          details: args.reason,
        },
      });
      return updated;
    });
    return { pillow: result, path: 'LEGACY' as const };
  }

  private async legacyAdjust(args: {
    pillowId: number;
    delta: number;
    reason: string;
    userId: number;
  }) {
    if (!Number.isInteger(args.delta) || args.delta === 0) {
      throw new AccessoryStockWriterError('INVALID_QUANTITY', 'Adjustment delta must be a non-zero integer');
    }
    if (!String(args.reason ?? '').trim()) {
      throw new AccessoryStockWriterError('REASON_REQUIRED', 'Adjustment reason is required');
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: number; name: string; stock: number }>>`
        SELECT id, name, stock
        FROM Pillow
        WHERE id = ${args.pillowId}
        FOR UPDATE
      `;
      const pillow = locked[0];
      if (!pillow) throw new AccessoryStockWriterError('NOT_FOUND', 'Pillow not found');

      const previousStock = pillow.stock;
      const newStock = previousStock + args.delta;
      if (newStock < 0) {
        throw new AccessoryStockWriterError('INSUFFICIENT_STOCK', 'Adjustment would make stock negative');
      }
      const updated = await tx.pillow.update({
        where: { id: args.pillowId },
        data: { stock: newStock },
      });
      await tx.pillowStockHistory.create({
        data: {
          pillowId: args.pillowId,
          quantity: args.delta,
          type: 'ADJUSTMENT',
          reason: args.reason,
          previousStock,
          newStock,
          userId: args.userId,
        },
      });
      await tx.activity.create({
        data: {
          userId: args.userId,
          type: 'PILLOW_ADJUSTMENT',
          description: `Adjusted pillow "${pillow.name}" by ${args.delta}`,
          details: args.reason,
        },
      });
      return updated;
    });
    return { pillow: result, path: 'LEGACY' as const };
  }

  private async legacyOutgoing(args: {
    pillowId: number;
    quantity: number;
    reason: string;
    userId: number;
  }) {
    const result = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: number; name: string; stock: number }>>`
        SELECT id, name, stock
        FROM Pillow
        WHERE id = ${args.pillowId}
        FOR UPDATE
      `;
      const pillow = locked[0];
      if (!pillow) throw new AccessoryStockWriterError('NOT_FOUND', 'Pillow not found');

      const previousStock = pillow.stock;
      const newStock = previousStock - args.quantity;
      if (newStock < 0) {
        throw new AccessoryStockWriterError('INSUFFICIENT_STOCK', 'Insufficient stock');
      }
      const updated = await tx.pillow.update({
        where: { id: args.pillowId },
        data: { stock: newStock },
      });
      await tx.pillowStockHistory.create({
        data: {
          pillowId: args.pillowId,
          quantity: -args.quantity,
          type: 'OUTGOING',
          reason: args.reason,
          previousStock,
          newStock,
          userId: args.userId,
        },
      });
      await tx.activity.create({
        data: {
          userId: args.userId,
          type: 'PILLOW_OUTGOING',
          description: `Removed ${args.quantity} from pillow "${pillow.name}"`,
          details: args.reason,
        },
      });
      return updated;
    });
    return { pillow: result, path: 'LEGACY' as const };
  }
}

export function accessoryWriterErrorToHttp(
  error: unknown
): { status: number; body: { error: string; code?: string } } {
  if (error instanceof AccessoryStockWriterError) {
    const status =
      error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'INVENTORY_LOCATION_REQUIRED' ||
            error.code === 'LOCATION_REQUIRED' ||
            error.code === 'INSUFFICIENT_STOCK' ||
            error.code === 'REASON_REQUIRED' ||
            error.code === 'INVENTORY_MODE_REQUIRED'
          ? 400
          : 400;
    return { status, body: { error: error.message, code: error.code } };
  }
  if (error instanceof InventoryError) {
    return inventoryErrorToHttp(error);
  }
  return { status: 500, body: { error: 'Internal stock writer error' } };
}
