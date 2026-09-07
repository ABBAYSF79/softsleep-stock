import { Prisma, PrismaClient, StockMovementType } from '@prisma/client';
import { computeAvailable } from '../utils/inventory-balance';
import { isPillowInventoryMigrated, syncPillowStockMirror } from './PillowStockMirror';

type TxClient = Prisma.TransactionClient;

export type BalanceSnapshot = {
  id: number;
  pillowId: number;
  locationId: number;
  physical: number;
  presentation: number;
  reserved: number;
  available: number;
};

export type InventoryMutationMeta = {
  type: StockMovementType;
  reason?: string | null;
  referenceType?: string | null;
  referenceId?: number | null;
  referenceNumber?: string | null;
  userId?: number | null;
  /**
   * Force Pillow.stock mirror sync even if the pillow had no InventoryBalance rows
   * before this mutation (bootstrap / controlled migration only).
   * Default: sync only when the pillow was already migrated.
   */
  forceSyncMirror?: boolean;
  /**
   * Skip Pillow.stock mirror sync (caller will sync after related Transfer status
   * updates so in-transit is included). Used by BS/BE validation.
   */
  skipMirrorSync?: boolean;
  /**
   * Test-only: throw after InventoryBalance update and before StockMovement insert
   * to verify transactional rollback. Do not use in production code.
   */
  __testThrowAfterBalanceUpdate?: Error;
};

export class InventoryError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'InventoryError';
    this.code = code;
  }
}

function assertPositiveInt(value: number, label: string) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new InventoryError('INVALID_QUANTITY', `${label} must be a positive integer`);
  }
}

function assertNonNegativeInt(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0) {
    throw new InventoryError('INVALID_QUANTITY', `${label} must be a non-negative integer`);
  }
}

function assertValidState(physical: number, presentation: number, reserved: number) {
  if (physical < 0 || presentation < 0 || reserved < 0) {
    throw new InventoryError('NEGATIVE_STOCK_NOT_ALLOWED', 'Stock quantities cannot be negative');
  }
  if (presentation > physical) {
    throw new InventoryError(
      'PRESENTATION_EXCEEDS_PHYSICAL',
      'Presentation quantity exceeds physical stock'
    );
  }
  if (reserved > physical - presentation) {
    throw new InventoryError(
      'RESERVED_EXCEEDS_AVAILABLE',
      'Reserved quantity exceeds available stock'
    );
  }
  const available = computeAvailable(physical, presentation, reserved);
  if (available < 0) {
    throw new InventoryError('NEGATIVE_AVAILABLE_NOT_ALLOWED', 'Available stock cannot be negative');
  }
}

function toSnapshot(row: {
  id: number;
  pillowId: number;
  locationId: number;
  physical: number;
  presentation: number;
  reserved: number;
}): BalanceSnapshot {
  return {
    id: row.id,
    pillowId: row.pillowId,
    locationId: row.locationId,
    physical: row.physical,
    presentation: row.presentation,
    reserved: row.reserved,
    available: computeAvailable(row.physical, row.presentation, row.reserved),
  };
}

/**
 * Inventory engine (TASK 4 + TASK 7 writer cutover).
 * Mutates InventoryBalance + StockMovement atomically.
 * Syncs Pillow.stock compatibility mirror only when the pillow is already migrated
 * (has InventoryBalance rows) or when forceSyncMirror is set — never invents
 * a company stock figure for unmigrated legacy pillows.
 * Does not write PillowStockHistory.
 */
export class InventoryService {
  constructor(private readonly prisma: PrismaClient) {}

  computeAvailable = computeAvailable;

  async getBalance(pillowId: number, locationId: number): Promise<BalanceSnapshot | null> {
    const row = await this.prisma.inventoryBalance.findUnique({
      where: { pillowId_locationId: { pillowId, locationId } },
    });
    return row ? toSnapshot(row) : null;
  }

  async increasePhysical(
    args: {
      pillowId: number;
      locationId: number;
      quantity: number;
    } & InventoryMutationMeta
  ): Promise<{ balance: BalanceSnapshot; movementId: number }> {
    assertPositiveInt(args.quantity, 'quantity');
    return this.mutateBalance({
      pillowId: args.pillowId,
      locationId: args.locationId,
      meta: args,
      apply: (before) => {
        const physical = before.physical + args.quantity;
        const presentation = before.presentation;
        const reserved = before.reserved;
        assertValidState(physical, presentation, reserved);
        return {
          physical,
          presentation,
          reserved,
          quantity: args.quantity,
        };
      },
    });
  }

  async decreasePhysical(
    args: {
      pillowId: number;
      locationId: number;
      quantity: number;
    } & InventoryMutationMeta
  ): Promise<{ balance: BalanceSnapshot; movementId: number }> {
    assertPositiveInt(args.quantity, 'quantity');
    return this.mutateBalance({
      pillowId: args.pillowId,
      locationId: args.locationId,
      meta: args,
      apply: (before) => {
        const available = computeAvailable(before.physical, before.presentation, before.reserved);
        if (args.quantity > available) {
          throw new InventoryError(
            'INSUFFICIENT_AVAILABLE_STOCK',
            `Insufficient available stock (available: ${available}, requested: ${args.quantity})`
          );
        }
        const physical = before.physical - args.quantity;
        const presentation = before.presentation;
        const reserved = before.reserved;
        assertValidState(physical, presentation, reserved);
        return {
          physical,
          presentation,
          reserved,
          quantity: -args.quantity,
        };
      },
    });
  }

  /**
   * Same as decreasePhysical but runs inside an existing Prisma transaction
   * (for BS/BE validation atomicity). Does not open a nested transaction.
   */
  async decreasePhysicalInTx(
    tx: TxClient,
    args: {
      pillowId: number;
      locationId: number;
      quantity: number;
      requireExistingBalance?: boolean;
    } & InventoryMutationMeta
  ): Promise<{ balance: BalanceSnapshot; movementId: number }> {
    assertPositiveInt(args.quantity, 'quantity');
    return this.mutateBalanceInTx(tx, {
      pillowId: args.pillowId,
      locationId: args.locationId,
      requireExistingBalance: args.requireExistingBalance ?? false,
      meta: args,
      apply: (before) => {
        const available = computeAvailable(before.physical, before.presentation, before.reserved);
        if (args.quantity > available) {
          throw new InventoryError(
            'INSUFFICIENT_AVAILABLE_STOCK',
            `Insufficient available stock (available: ${available}, requested: ${args.quantity})`
          );
        }
        const physical = before.physical - args.quantity;
        const presentation = before.presentation;
        const reserved = before.reserved;
        assertValidState(physical, presentation, reserved);
        return {
          physical,
          presentation,
          reserved,
          quantity: -args.quantity,
        };
      },
    });
  }

  async increasePhysicalInTx(
    tx: TxClient,
    args: {
      pillowId: number;
      locationId: number;
      quantity: number;
      requireExistingBalance?: boolean;
    } & InventoryMutationMeta
  ): Promise<{ balance: BalanceSnapshot; movementId: number }> {
    assertPositiveInt(args.quantity, 'quantity');
    return this.mutateBalanceInTx(tx, {
      pillowId: args.pillowId,
      locationId: args.locationId,
      requireExistingBalance: args.requireExistingBalance ?? false,
      meta: args,
      apply: (before) => {
        const physical = before.physical + args.quantity;
        const presentation = before.presentation;
        const reserved = before.reserved;
        assertValidState(physical, presentation, reserved);
        return {
          physical,
          presentation,
          reserved,
          quantity: args.quantity,
        };
      },
    });
  }

  /**
   * Location-aware supply: physical += quantity (SUPPLY movement).
   * Requires active location. Syncs Pillow.stock mirror.
   */
  async supply(args: {
    pillowId: number;
    locationId: number;
    quantity: number;
    reason: string;
    userId?: number | null;
    referenceType?: string | null;
    referenceId?: number | null;
    referenceNumber?: string | null;
  }): Promise<{ balance: BalanceSnapshot; movementId: number }> {
    const reason = String(args.reason ?? '').trim();
    if (!reason) {
      throw new InventoryError('REASON_REQUIRED', 'Supply reason is required');
    }
    await this.assertActiveLocation(args.locationId);
    return this.increasePhysical({
      pillowId: args.pillowId,
      locationId: args.locationId,
      quantity: args.quantity,
      type: 'SUPPLY',
      reason,
      userId: args.userId ?? null,
      referenceType: args.referenceType ?? 'SUPPLY',
      referenceId: args.referenceId ?? null,
      referenceNumber: args.referenceNumber ?? null,
      forceSyncMirror: true,
    });
  }

  /**
   * Location-aware physical adjustment by signed delta.
   * Positive = increase, negative = decrease. Reason required.
   * Rejects invariant violations; does not auto-fix presentation/reserved.
   */
  async adjustPhysical(args: {
    pillowId: number;
    locationId: number;
    delta: number;
    reason: string;
    userId?: number | null;
    referenceType?: string | null;
    referenceId?: number | null;
    referenceNumber?: string | null;
  }): Promise<{ balance: BalanceSnapshot; movementId: number }> {
    const reason = String(args.reason ?? '').trim();
    if (!reason) {
      throw new InventoryError('REASON_REQUIRED', 'Adjustment reason is required');
    }
    if (!Number.isInteger(args.delta) || args.delta === 0) {
      throw new InventoryError('INVALID_QUANTITY', 'Adjustment delta must be a non-zero integer');
    }
    await this.assertActiveLocation(args.locationId);
    assertPositiveInt(args.pillowId, 'pillowId');
    assertPositiveInt(args.locationId, 'locationId');

    return this.mutateBalance({
      pillowId: args.pillowId,
      locationId: args.locationId,
      requireExistingBalance: args.delta < 0,
      meta: {
        type: 'ADJUSTMENT',
        reason,
        userId: args.userId ?? null,
        referenceType: args.referenceType ?? 'ADJUSTMENT',
        referenceId: args.referenceId ?? null,
        referenceNumber: args.referenceNumber ?? null,
        forceSyncMirror: true,
      },
      apply: (before) => {
        const physical = before.physical + args.delta;
        if (physical < 0) {
          throw new InventoryError(
            'NEGATIVE_PHYSICAL',
            `Adjustment would make physical negative (current: ${before.physical}, delta: ${args.delta})`
          );
        }
        const presentation = before.presentation;
        const reserved = before.reserved;
        // Do not auto-fix presentation/reserved — reject if invariants break
        if (presentation > physical) {
          throw new InventoryError(
            'PRESENTATION_EXCEEDS_PHYSICAL',
            `Adjustment would leave presentation (${presentation}) > physical (${physical})`
          );
        }
        if (reserved > physical - presentation) {
          throw new InventoryError(
            'RESERVED_EXCEEDS_AVAILABLE',
            `Adjustment would leave reserved (${reserved}) exceeding physical - presentation`
          );
        }
        assertValidState(physical, presentation, reserved);
        return {
          physical,
          presentation,
          reserved,
          quantity: args.delta,
        };
      },
    });
  }

  /**
   * Absolute presentation target. Does not change physical or Pillow.stock.
   * Only locations with allowsPresentation=true may have presentation > 0.
   */
  async setPresentation(
    args: {
      pillowId: number;
      locationId: number;
      presentation: number;
    } & Omit<InventoryMutationMeta, 'type'> & { type?: StockMovementType }
  ): Promise<{ balance: BalanceSnapshot; movementId: number }> {
    assertNonNegativeInt(args.presentation, 'presentation');
    const location = await this.prisma.location.findUnique({ where: { id: args.locationId } });
    if (!location || !location.active) {
      throw new InventoryError('INVALID_LOCATION', 'Location not found or inactive');
    }
    if (!location.allowsPresentation && args.presentation > 0) {
      throw new InventoryError(
        'PRESENTATION_NOT_ALLOWED',
        `Location ${location.code} does not allow presentation stock`
      );
    }

    const beforeSnap = await this.getBalance(args.pillowId, args.locationId).catch(() => null);
    const prevPresentation = beforeSnap?.presentation ?? 0;
    const reason =
      args.reason?.trim() ||
      (args.presentation > prevPresentation
        ? 'PRESENTATION_ALLOCATION'
        : args.presentation < prevPresentation
          ? 'PRESENTATION_RELEASE'
          : 'PRESENTATION_UNCHANGED');

    return this.mutateBalance({
      pillowId: args.pillowId,
      locationId: args.locationId,
      requireExistingBalance: true,
      meta: {
        ...args,
        type: args.type ?? 'ADJUSTMENT',
        reason,
        // Presentation does not change company physical — skip mirror sync
        skipMirrorSync: true,
      },
      apply: (before) => {
        const maxPresentation = before.physical - before.reserved;
        if (args.presentation > maxPresentation) {
          throw new InventoryError(
            'PRESENTATION_EXCEEDS_AVAILABLE_PHYSICAL',
            `Presentation quantity exceeds available physical stock (max: ${maxPresentation})`
          );
        }
        const physical = before.physical;
        const presentation = args.presentation;
        const reserved = before.reserved;
        assertValidState(physical, presentation, reserved);
        return {
          physical,
          presentation,
          reserved,
          quantity: presentation - before.presentation,
        };
      },
    });
  }

  private async assertActiveLocation(locationId: number) {
    assertPositiveInt(locationId, 'locationId');
    const location = await this.prisma.location.findUnique({ where: { id: locationId } });
    if (!location || !location.active) {
      throw new InventoryError('INVALID_LOCATION', 'Location not found or inactive');
    }
    return location;
  }

  /**
   * Absolute reserved target. Does not change physical.
   * Constraint: 0 <= reserved <= physical - presentation
   */
  async setReserved(
    args: {
      pillowId: number;
      locationId: number;
      reserved: number;
    } & Omit<InventoryMutationMeta, 'type'> & { type?: StockMovementType }
  ): Promise<{ balance: BalanceSnapshot; movementId: number }> {
    assertNonNegativeInt(args.reserved, 'reserved');
    return this.mutateBalance({
      pillowId: args.pillowId,
      locationId: args.locationId,
      meta: {
        ...args,
        type: args.type ?? 'RESERVATION',
      },
      apply: (before) => {
        const maxReserved = before.physical - before.presentation;
        if (args.reserved > maxReserved) {
          throw new InventoryError(
            'RESERVED_EXCEEDS_AVAILABLE',
            `Reserved quantity exceeds available stock (max: ${maxReserved})`
          );
        }
        const physical = before.physical;
        const presentation = before.presentation;
        const reserved = args.reserved;
        assertValidState(physical, presentation, reserved);
        const delta = reserved - before.reserved;
        const resolvedType: StockMovementType =
          args.type ?? (delta < 0 ? 'RELEASE' : 'RESERVATION');
        return {
          physical,
          presentation,
          reserved,
          quantity: delta,
          resolvedType,
        };
      },
    });
  }

  /** Increase reserved by delta (reservation). Physical unchanged. */
  async increaseReservedInTx(
    tx: TxClient,
    args: {
      pillowId: number;
      locationId: number;
      quantity: number;
      requireExistingBalance?: boolean;
    } & Omit<InventoryMutationMeta, 'type'> & { type?: StockMovementType }
  ): Promise<{ balance: BalanceSnapshot; movementId: number }> {
    assertPositiveInt(args.quantity, 'quantity');
    return this.mutateBalanceInTx(tx, {
      pillowId: args.pillowId,
      locationId: args.locationId,
      requireExistingBalance: args.requireExistingBalance ?? true,
      meta: { ...args, type: args.type ?? 'RESERVATION' },
      apply: (before) => {
        const available = computeAvailable(before.physical, before.presentation, before.reserved);
        if (args.quantity > available) {
          throw new InventoryError(
            'INSUFFICIENT_AVAILABLE_STOCK',
            `Insufficient available stock (available: ${available}, requested: ${args.quantity})`
          );
        }
        const physical = before.physical;
        const presentation = before.presentation;
        const reserved = before.reserved + args.quantity;
        assertValidState(physical, presentation, reserved);
        return {
          physical,
          presentation,
          reserved,
          quantity: args.quantity,
          resolvedType: 'RESERVATION',
        };
      },
    });
  }

  /** Decrease reserved by delta (release). Physical unchanged. */
  async releaseReservedInTx(
    tx: TxClient,
    args: {
      pillowId: number;
      locationId: number;
      quantity: number;
      requireExistingBalance?: boolean;
    } & Omit<InventoryMutationMeta, 'type'> & { type?: StockMovementType }
  ): Promise<{ balance: BalanceSnapshot; movementId: number }> {
    assertPositiveInt(args.quantity, 'quantity');
    return this.mutateBalanceInTx(tx, {
      pillowId: args.pillowId,
      locationId: args.locationId,
      requireExistingBalance: args.requireExistingBalance ?? true,
      meta: { ...args, type: args.type ?? 'RELEASE' },
      apply: (before) => {
        if (args.quantity > before.reserved) {
          throw new InventoryError(
            'RELEASE_EXCEEDS_RESERVED',
            `Cannot release ${args.quantity}; reserved is ${before.reserved}`
          );
        }
        const physical = before.physical;
        const presentation = before.presentation;
        const reserved = before.reserved - args.quantity;
        assertValidState(physical, presentation, reserved);
        return {
          physical,
          presentation,
          reserved,
          quantity: -args.quantity,
          resolvedType: 'RELEASE',
        };
      },
    });
  }

  /**
   * Fulfill from reservation: physical -= qty AND reserved -= qty atomically.
   * Movement type SALE; quantity is -qty (physical delta).
   */
  async fulfillReservedInTx(
    tx: TxClient,
    args: {
      pillowId: number;
      locationId: number;
      quantity: number;
      requireExistingBalance?: boolean;
    } & Omit<InventoryMutationMeta, 'type'> & { type?: StockMovementType }
  ): Promise<{ balance: BalanceSnapshot; movementId: number }> {
    assertPositiveInt(args.quantity, 'quantity');
    return this.mutateBalanceInTx(tx, {
      pillowId: args.pillowId,
      locationId: args.locationId,
      requireExistingBalance: args.requireExistingBalance ?? true,
      meta: { ...args, type: args.type ?? 'SALE' },
      apply: (before) => {
        if (args.quantity > before.reserved) {
          throw new InventoryError(
            'FULFILL_EXCEEDS_RESERVED',
            `Cannot fulfill ${args.quantity}; reserved is ${before.reserved}`
          );
        }
        if (args.quantity > before.physical - before.presentation) {
          throw new InventoryError(
            'INSUFFICIENT_PHYSICAL_STOCK',
            `Cannot fulfill ${args.quantity}; physical after presentation is insufficient`
          );
        }
        const physical = before.physical - args.quantity;
        const presentation = before.presentation;
        const reserved = before.reserved - args.quantity;
        assertValidState(physical, presentation, reserved);
        return {
          physical,
          presentation,
          reserved,
          quantity: -args.quantity,
          resolvedType: 'SALE',
        };
      },
    });
  }

  /**
   * Reverse a prior fulfill: physical += qty AND reserved += qty atomically.
   * Used for DELIVERED → PENDING delivery reversal (not customer RETURN).
   * Movement type RETURN; quantity is +qty (physical delta).
   */
  async unfulfillReservedInTx(
    tx: TxClient,
    args: {
      pillowId: number;
      locationId: number;
      quantity: number;
      requireExistingBalance?: boolean;
    } & Omit<InventoryMutationMeta, 'type'> & { type?: StockMovementType }
  ): Promise<{ balance: BalanceSnapshot; movementId: number }> {
    assertPositiveInt(args.quantity, 'quantity');
    return this.mutateBalanceInTx(tx, {
      pillowId: args.pillowId,
      locationId: args.locationId,
      requireExistingBalance: args.requireExistingBalance ?? true,
      meta: { ...args, type: args.type ?? 'RETURN' },
      apply: (before) => {
        const physical = before.physical + args.quantity;
        const presentation = before.presentation;
        const reserved = before.reserved + args.quantity;
        assertValidState(physical, presentation, reserved);
        return {
          physical,
          presentation,
          reserved,
          quantity: args.quantity,
          resolvedType: 'RETURN',
        };
      },
    });
  }

  private async mutateBalance(params: {
    pillowId: number;
    locationId: number;
    meta: InventoryMutationMeta;
    requireExistingBalance?: boolean;
    apply: (before: {
      physical: number;
      presentation: number;
      reserved: number;
    }) => {
      physical: number;
      presentation: number;
      reserved: number;
      quantity: number;
      resolvedType?: StockMovementType;
    };
  }): Promise<{ balance: BalanceSnapshot; movementId: number }> {
    assertPositiveInt(params.pillowId, 'pillowId');
    assertPositiveInt(params.locationId, 'locationId');

    return this.prisma.$transaction(async (tx) => this.mutateBalanceInTx(tx, params));
  }

  /** Core mutation used by both standalone transactions and nested BS/BE validation. */
  async mutateBalanceInTx(
    tx: TxClient,
    params: {
      pillowId: number;
      locationId: number;
      meta: InventoryMutationMeta;
      requireExistingBalance?: boolean;
      apply: (before: {
        physical: number;
        presentation: number;
        reserved: number;
      }) => {
        physical: number;
        presentation: number;
        reserved: number;
        quantity: number;
        resolvedType?: StockMovementType;
      };
    }
  ): Promise<{ balance: BalanceSnapshot; movementId: number }> {
    assertPositiveInt(params.pillowId, 'pillowId');
    assertPositiveInt(params.locationId, 'locationId');

    const wasMigrated = await isPillowInventoryMigrated(tx, params.pillowId);
    const willSyncMirror =
      !params.meta.skipMirrorSync &&
      (wasMigrated || params.meta.forceSyncMirror || params.requireExistingBalance);

    // Lock Pillow before InventoryBalance so concurrent multi-location
    // mutations serialize on the mirror and cannot overwrite with a stale SUM.
    if (willSyncMirror) {
      const pillowLock = await tx.$queryRaw<Array<{ id: number }>>`
        SELECT id FROM Pillow WHERE id = ${params.pillowId} FOR UPDATE
      `;
      if (!pillowLock[0]) {
        throw new InventoryError('NOT_FOUND', `Pillow ${params.pillowId} not found`);
      }
    }

    let before: {
      id: number;
      pillowId: number;
      locationId: number;
      physical: number;
      presentation: number;
      reserved: number;
    };

    if (params.requireExistingBalance) {
      const locked = await this.selectForUpdate(tx, params.pillowId, params.locationId);
      if (!locked) {
        throw new InventoryError(
          'INVENTORY_BALANCE_NOT_FOUND',
          `No InventoryBalance for pillow ${params.pillowId} at location ${params.locationId}`
        );
      }
      before = locked;
    } else {
      before = await this.lockOrCreateBalance(tx, params.pillowId, params.locationId);
    }

    const next = params.apply(before);
    const movementType = next.resolvedType ?? params.meta.type;

    const updated = await tx.inventoryBalance.update({
      where: { id: before.id },
      data: {
        physical: next.physical,
        presentation: next.presentation,
        reserved: next.reserved,
      },
    });

    if (params.meta.__testThrowAfterBalanceUpdate) {
      throw params.meta.__testThrowAfterBalanceUpdate;
    }

    const movement = await this.recordMovement(tx, {
      pillowId: params.pillowId,
      locationId: params.locationId,
      type: movementType,
      quantity: next.quantity,
      previousPhysical: before.physical,
      newPhysical: next.physical,
      previousPresentation: before.presentation,
      newPresentation: next.presentation,
      previousReserved: before.reserved,
      newReserved: next.reserved,
      reason: params.meta.reason ?? null,
      referenceType: params.meta.referenceType ?? null,
      referenceId: params.meta.referenceId ?? null,
      referenceNumber: params.meta.referenceNumber ?? null,
      userId: params.meta.userId ?? null,
    });

    if (willSyncMirror) {
      await syncPillowStockMirror(tx, params.pillowId);
    }

    return { balance: toSnapshot(updated), movementId: movement.id };
  }

  /**
   * Lock existing balance row with SELECT … FOR UPDATE, or create 0/0/0 then lock.
   * Handles concurrent create via unique constraint (P2002) + retry read.
   */
  private async lockOrCreateBalance(
    tx: TxClient,
    pillowId: number,
    locationId: number
  ): Promise<{
    id: number;
    pillowId: number;
    locationId: number;
    physical: number;
    presentation: number;
    reserved: number;
  }> {
    const locked = await this.selectForUpdate(tx, pillowId, locationId);
    if (locked) return locked;

    try {
      await tx.inventoryBalance.create({
        data: {
          pillowId,
          locationId,
          physical: 0,
          presentation: 0,
          reserved: 0,
        },
      });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) {
        throw e;
      }
      // Concurrent create won — fall through to lock the winner row
    }

    const afterCreate = await this.selectForUpdate(tx, pillowId, locationId);
    if (!afterCreate) {
      throw new InventoryError('INVENTORY_BALANCE_NOT_FOUND', 'Inventory balance not found after create');
    }
    return afterCreate;
  }

  private async selectForUpdate(
    tx: TxClient,
    pillowId: number,
    locationId: number
  ): Promise<{
    id: number;
    pillowId: number;
    locationId: number;
    physical: number;
    presentation: number;
    reserved: number;
  } | null> {
    const rows = await tx.$queryRaw<
      Array<{
        id: number;
        pillowId: number;
        locationId: number;
        physical: number;
        presentation: number;
        reserved: number;
      }>
    >`
      SELECT id, pillowId, locationId, physical, presentation, reserved
      FROM InventoryBalance
      WHERE pillowId = ${pillowId} AND locationId = ${locationId}
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  private async recordMovement(
    tx: TxClient,
    data: {
      pillowId: number;
      locationId: number;
      type: StockMovementType;
      quantity: number;
      previousPhysical: number;
      newPhysical: number;
      previousPresentation: number;
      newPresentation: number;
      previousReserved: number;
      newReserved: number;
      reason: string | null;
      referenceType: string | null;
      referenceId: number | null;
      referenceNumber: string | null;
      userId: number | null;
    }
  ) {
    return tx.stockMovement.create({ data });
  }
}

export function inventoryErrorToHttp(error: unknown): { status: number; body: { error: string; code?: string } } {
  if (error instanceof InventoryError) {
    const status = error.code === 'INVENTORY_BALANCE_NOT_FOUND' ? 404 : 400;
    return { status, body: { error: error.message, code: error.code } };
  }
  return { status: 500, body: { error: 'Internal inventory error' } };
}
