import {
  Prisma,
  PrismaClient,
  ReservationSource,
  ReservationStatus,
} from '@prisma/client';
import { DocumentSequenceService } from './DocumentSequenceService';
import { InventoryError, InventoryService } from './InventoryService';

type TxClient = Prisma.TransactionClient;

export class ReservationDomainError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ReservationDomainError';
    this.code = code;
  }
}

export type ReserveLineInput = { pillowId: number; quantity: number };

const reservationInclude = {
  location: { select: { id: true, code: true, name: true, type: true } },
  lines: {
    include: { pillow: { select: { id: true, name: true } } },
    orderBy: { id: 'asc' as const },
  },
  createdBy: { select: { id: true, name: true } },
  order: { select: { id: true, status: true, customerName: true } },
  pillowOrder: { select: { id: true, status: true, customerName: true } },
} satisfies Prisma.ReservationInclude;

/**
 * Reservation / fulfillment / return engine (TASK 12).
 * Only mutates InventoryBalance when inventoryMode = INVENTORY (caller gates).
 */
export class ReservationService {
  private readonly sequences: DocumentSequenceService;
  private readonly inventory: InventoryService;

  constructor(private readonly prisma: PrismaClient) {
    this.sequences = new DocumentSequenceService(prisma);
    this.inventory = new InventoryService(prisma);
  }

  async listReservations(filters?: {
    status?: ReservationStatus;
    orderId?: number;
    pillowOrderId?: number;
  }) {
    const rows = await this.prisma.reservation.findMany({
      where: {
        ...(filters?.status ? { status: filters.status } : {}),
        ...(filters?.orderId ? { orderId: filters.orderId } : {}),
        ...(filters?.pillowOrderId ? { pillowOrderId: filters.pillowOrderId } : {}),
      },
      include: reservationInclude,
      orderBy: { id: 'desc' },
      take: 200,
    });
    return rows.map((r) => this.serialize(r));
  }

  async getReservation(id: number) {
    const row = await this.prisma.reservation.findUnique({
      where: { id },
      include: reservationInclude,
    });
    if (!row) throw new ReservationDomainError('NOT_FOUND', 'Reservation not found');
    return this.serialize(row);
  }

  async getByIdempotencyKey(key: string) {
    const row = await this.prisma.reservation.findUnique({
      where: { idempotencyKey: key },
      include: reservationInclude,
    });
    return row ? this.serialize(row) : null;
  }

  /**
   * Create reservation + increase reserved on InventoryBalance.
   * Idempotent via idempotencyKey — returns existing if already created.
   */
  async reserve(args: {
    source: ReservationSource;
    orderId?: number | null;
    pillowOrderId?: number | null;
    locationId: number;
    lines: ReserveLineInput[];
    createdById?: number | null;
    idempotencyKey: string;
    referenceLabel?: string;
  }) {
    return this.prisma.$transaction((tx) => this.reserveInTx(tx, args));
  }

  async reserveInTx(
    tx: TxClient,
    args: {
      source: ReservationSource;
      orderId?: number | null;
      pillowOrderId?: number | null;
      locationId: number;
      lines: ReserveLineInput[];
      createdById?: number | null;
      idempotencyKey: string;
      referenceLabel?: string;
    }
  ) {
    if (!args.locationId || !Number.isInteger(args.locationId)) {
      throw new ReservationDomainError(
        'INVENTORY_LOCATION_REQUIRED',
        'A sellable fulfillment location is required for inventory reservations'
      );
    }
    if (args.source === 'ORDER' && !args.orderId) {
      throw new ReservationDomainError('INVALID_REFERENCE', 'orderId required for ORDER source');
    }
    if (args.source === 'PILLOW_ORDER' && !args.pillowOrderId) {
      throw new ReservationDomainError(
        'INVALID_REFERENCE',
        'pillowOrderId required for PILLOW_ORDER source'
      );
    }

    const lines = this.normalizeLines(args.lines);

    const existing = await tx.reservation.findUnique({
      where: { idempotencyKey: args.idempotencyKey },
      include: reservationInclude,
    });
    if (existing) return this.serialize(existing);

    const location = await tx.location.findUnique({ where: { id: args.locationId } });
    if (!location || !location.active || !location.isSellable) {
      throw new ReservationDomainError(
        'INVENTORY_LOCATION_REQUIRED',
        'Fulfillment location must be active and sellable'
      );
    }

    const referenceNumber = await this.sequences.nextNumberInTx(tx, 'RV');
    let reservation: { id: number };
    try {
      reservation = await tx.reservation.create({
        data: {
          referenceNumber,
          source: args.source,
          orderId: args.orderId ?? null,
          pillowOrderId: args.pillowOrderId ?? null,
          locationId: args.locationId,
          status: 'ACTIVE',
          idempotencyKey: args.idempotencyKey,
          createdById: args.createdById ?? null,
          lines: {
            create: lines.map((l) => ({
              pillowId: l.pillowId,
              quantity: l.quantity,
              fulfilledQuantity: 0,
              releasedQuantity: 0,
              returnedQuantity: 0,
            })),
          },
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const raced = await tx.reservation.findUnique({
          where: { idempotencyKey: args.idempotencyKey },
          include: reservationInclude,
        });
        if (raced) return this.serialize(raced);
      }
      throw e;
    }

    const refNumber =
      args.referenceLabel ??
      (args.source === 'ORDER'
        ? `Order #${args.orderId}`
        : `PillowOrder #${args.pillowOrderId}`);

    for (const line of lines) {
      try {
        await this.inventory.increaseReservedInTx(tx, {
          pillowId: line.pillowId,
          locationId: args.locationId,
          quantity: line.quantity,
          requireExistingBalance: true,
          type: 'RESERVATION',
          reason: `Reserve ${refNumber}`,
          referenceType: 'RESERVATION',
          referenceId: reservation.id,
          referenceNumber,
          userId: args.createdById ?? null,
          forceSyncMirror: true,
        });
      } catch (err) {
        this.rethrowInventory(err);
      }
    }

    const full = await tx.reservation.findUnique({
      where: { id: reservation.id },
      include: reservationInclude,
    });
    return this.serialize(full!);
  }

  /** Release remaining active reserved qty (cancel / hold). Idempotent. */
  async releaseReservation(
    reservationId: number,
    args?: { userId?: number | null; reason?: string }
  ) {
    return this.prisma.$transaction((tx) =>
      this.releaseReservationInTx(tx, reservationId, args)
    );
  }

  async releaseReservationInTx(
    tx: TxClient,
    reservationId: number,
    args?: { userId?: number | null; reason?: string }
  ) {
    const reservation = await this.lockReservation(tx, reservationId);
    if (
      reservation.status === 'RELEASED' ||
      reservation.status === 'CANCELLED' ||
      reservation.status === 'FULFILLED'
    ) {
      const full = await tx.reservation.findUnique({
        where: { id: reservationId },
        include: reservationInclude,
      });
      return this.serialize(full!);
    }

    const lines = await this.lockLines(tx, reservationId);
    for (const line of lines) {
      const remaining = line.quantity - line.fulfilledQuantity - line.releasedQuantity;
      if (remaining <= 0) continue;
      try {
        await this.inventory.releaseReservedInTx(tx, {
          pillowId: line.pillowId,
          locationId: reservation.locationId,
          quantity: remaining,
          requireExistingBalance: true,
          type: 'RELEASE',
          reason: args?.reason ?? `Release ${reservation.referenceNumber}`,
          referenceType: 'RESERVATION',
          referenceId: reservation.id,
          referenceNumber: reservation.referenceNumber,
          userId: args?.userId ?? null,
          forceSyncMirror: true,
        });
      } catch (e) {
        this.rethrowInventory(e);
      }
      await tx.reservationLine.update({
        where: { id: line.id },
        data: { releasedQuantity: line.releasedQuantity + remaining },
      });
    }

    const updated = await tx.reservation.update({
      where: { id: reservationId },
      data: {
        status: 'RELEASED',
        releasedAt: new Date(),
        cancelledAt: new Date(),
      },
      include: reservationInclude,
    });
    return this.serialize(updated);
  }

  /**
   * Fulfill remaining (or explicit line quantities). Idempotent for already-fulfilled lines.
   * Physical -= qty, reserved -= qty.
   */
  async fulfillReservation(
    reservationId: number,
    args?: {
      userId?: number | null;
      lines?: ReserveLineInput[];
      reason?: string;
    }
  ) {
    return this.prisma.$transaction((tx) =>
      this.fulfillReservationInTx(tx, reservationId, args)
    );
  }

  async fulfillReservationInTx(
    tx: TxClient,
    reservationId: number,
    args?: {
      userId?: number | null;
      lines?: ReserveLineInput[];
      reason?: string;
    }
  ) {
    const reservation = await this.lockReservation(tx, reservationId);
    if (reservation.status === 'FULFILLED') {
      const full = await tx.reservation.findUnique({
        where: { id: reservationId },
        include: reservationInclude,
      });
      return this.serialize(full!);
    }
    if (reservation.status === 'RELEASED' || reservation.status === 'CANCELLED') {
      throw new ReservationDomainError(
        'FORBIDDEN_STATUS',
        `Cannot fulfill reservation in status ${reservation.status}`
      );
    }

    const lines = await this.lockLines(tx, reservationId);
    const fulfillMap = new Map<number, number>();
    if (args?.lines?.length) {
      for (const l of this.normalizeLines(args.lines)) {
        fulfillMap.set(l.pillowId, l.quantity);
      }
    } else {
      for (const line of lines) {
        const remaining = line.quantity - line.fulfilledQuantity - line.releasedQuantity;
        if (remaining > 0) fulfillMap.set(line.pillowId, remaining);
      }
    }

    if (fulfillMap.size === 0) {
      const full = await tx.reservation.findUnique({
        where: { id: reservationId },
        include: reservationInclude,
      });
      return this.serialize(full!);
    }

    for (const line of lines) {
      const qty = fulfillMap.get(line.pillowId);
      if (!qty) continue;
      const remaining = line.quantity - line.fulfilledQuantity - line.releasedQuantity;
      if (qty > remaining) {
        throw new ReservationDomainError(
          'FULFILL_EXCEEDS_REMAINING',
          `Cannot fulfill ${qty} for pillow ${line.pillowId}; remaining reserved: ${remaining}`
        );
      }
      try {
        await this.inventory.fulfillReservedInTx(tx, {
          pillowId: line.pillowId,
          locationId: reservation.locationId,
          quantity: qty,
          requireExistingBalance: true,
          type: 'SALE',
          reason: args?.reason ?? `Fulfill ${reservation.referenceNumber}`,
          referenceType: 'RESERVATION',
          referenceId: reservation.id,
          referenceNumber: reservation.referenceNumber,
          userId: args?.userId ?? null,
          forceSyncMirror: true,
        });
      } catch (e) {
        this.rethrowInventory(e);
      }
      await tx.reservationLine.update({
        where: { id: line.id },
        data: { fulfilledQuantity: line.fulfilledQuantity + qty },
      });
    }

    const refreshed = await tx.reservationLine.findMany({
      where: { reservationId },
    });
    const status = this.computeStatus(refreshed);
    const updated = await tx.reservation.update({
      where: { id: reservationId },
      data: {
        status,
        fulfilledAt: status === 'FULFILLED' ? new Date() : reservation.fulfilledAt,
      },
      include: reservationInclude,
    });
    return this.serialize(updated);
  }

  /**
   * Return previously fulfilled quantity to physical stock at reservation location
   * (or explicit locationId). Idempotent via returnedQuantity tracking.
   */
  async returnFulfilled(
    reservationId: number,
    args: {
      lines: ReserveLineInput[];
      userId?: number | null;
      locationId?: number;
      reason?: string;
    }
  ) {
    return this.prisma.$transaction((tx) =>
      this.returnFulfilledInTx(tx, reservationId, args)
    );
  }

  async returnFulfilledInTx(
    tx: TxClient,
    reservationId: number,
    args: {
      lines: ReserveLineInput[];
      userId?: number | null;
      locationId?: number;
      reason?: string;
    }
  ) {
    const returnLines = this.normalizeLines(args.lines);
    const reservation = await this.lockReservation(tx, reservationId);
    const lines = await this.lockLines(tx, reservationId);
    const locationId = args.locationId ?? reservation.locationId;
    const byPillow = new Map(lines.map((l) => [l.pillowId, l]));

    for (const rl of returnLines) {
      const line = byPillow.get(rl.pillowId);
      if (!line) {
        throw new ReservationDomainError(
          'INVALID_LINE',
          `Pillow ${rl.pillowId} is not on this reservation`
        );
      }
      const returnable = line.fulfilledQuantity - line.returnedQuantity;
      if (rl.quantity > returnable) {
        throw new ReservationDomainError(
          'RETURN_EXCEEDS_FULFILLED',
          `Cannot return ${rl.quantity} for pillow ${rl.pillowId}; returnable: ${returnable}`
        );
      }
      try {
        await this.inventory.increasePhysicalInTx(tx, {
          pillowId: rl.pillowId,
          locationId,
          quantity: rl.quantity,
          requireExistingBalance: false,
          type: 'RETURN',
          reason: args.reason ?? `Return ${reservation.referenceNumber}`,
          referenceType: 'RESERVATION',
          referenceId: reservation.id,
          referenceNumber: reservation.referenceNumber,
          userId: args.userId ?? null,
          forceSyncMirror: true,
        });
      } catch (e) {
        this.rethrowInventory(e);
      }
      await tx.reservationLine.update({
        where: { id: line.id },
        data: { returnedQuantity: line.returnedQuantity + rl.quantity },
      });
    }

    const full = await tx.reservation.findUnique({
      where: { id: reservationId },
      include: reservationInclude,
    });
    return this.serialize(full!);
  }

  /**
   * Undo SALE fulfillment so an order can be re-delivered (DELIVERED → PENDING).
   * Restores physical + reserved via unfulfillReservedInTx. Idempotent when already undone.
   */
  async reverseDelivery(
    reservationId: number,
    args?: { userId?: number | null; reason?: string }
  ) {
    return this.prisma.$transaction((tx) =>
      this.reverseDeliveryInTx(tx, reservationId, args)
    );
  }

  async reverseDeliveryInTx(
    tx: TxClient,
    reservationId: number,
    args?: { userId?: number | null; reason?: string }
  ) {
    const reservation = await this.lockReservation(tx, reservationId);
    if (reservation.status === 'RELEASED' || reservation.status === 'CANCELLED') {
      throw new ReservationDomainError(
        'FORBIDDEN_STATUS',
        `Cannot reverse delivery for reservation in status ${reservation.status}`
      );
    }

    const lines = await this.lockLines(tx, reservationId);
    for (const line of lines) {
      const undoQty = line.fulfilledQuantity - line.returnedQuantity;
      if (undoQty <= 0) continue;

      try {
        await this.inventory.unfulfillReservedInTx(tx, {
          pillowId: line.pillowId,
          locationId: reservation.locationId,
          quantity: undoQty,
          requireExistingBalance: true,
          type: 'RETURN',
          reason: args?.reason ?? `Reverse delivery ${reservation.referenceNumber}`,
          referenceType: 'RESERVATION',
          referenceId: reservation.id,
          referenceNumber: reservation.referenceNumber,
          userId: args?.userId ?? null,
          forceSyncMirror: true,
        });
      } catch (e) {
        this.rethrowInventory(e);
      }

      await tx.reservationLine.update({
        where: { id: line.id },
        data: { fulfilledQuantity: line.returnedQuantity },
      });
    }

    const refreshed = await tx.reservationLine.findMany({
      where: { reservationId },
    });
    const status = this.computeStatus(refreshed);
    const updated = await tx.reservation.update({
      where: { id: reservationId },
      data: {
        status,
        fulfilledAt: status === 'FULFILLED' ? reservation.fulfilledAt : null,
      },
      include: reservationInclude,
    });
    return this.serialize(updated);
  }

  /** Find active/open reservation for an order (not released/cancelled). */
  async findOpenForOrder(orderId: number, source: ReservationSource = 'ORDER') {
    const row = await this.prisma.reservation.findFirst({
      where: {
        ...(source === 'ORDER' ? { orderId } : { pillowOrderId: orderId }),
        status: { in: ['ACTIVE', 'PARTIALLY_FULFILLED', 'FULFILLED'] },
      },
      include: reservationInclude,
      orderBy: { id: 'desc' },
    });
    return row ? this.serialize(row) : null;
  }

  async findOpenForOrderInTx(
    tx: TxClient,
    orderId: number,
    source: ReservationSource = 'ORDER'
  ) {
    const row = await tx.reservation.findFirst({
      where: {
        ...(source === 'ORDER' ? { orderId } : { pillowOrderId: orderId }),
        status: { in: ['ACTIVE', 'PARTIALLY_FULFILLED', 'FULFILLED'] },
      },
      include: reservationInclude,
      orderBy: { id: 'desc' },
    });
    return row ? this.serialize(row) : null;
  }

  /**
   * Find any reservation for an order (including RELEASED/CANCELLED/FULFILLED).
   * Latest by id desc — used for delete handling.
   */
  async findReservationForOrderInTx(
    tx: TxClient,
    orderId: number,
    source: ReservationSource = 'ORDER'
  ) {
    const row = await tx.reservation.findFirst({
      where: source === 'ORDER' ? { orderId } : { pillowOrderId: orderId },
      include: reservationInclude,
      orderBy: { id: 'desc' },
    });
    return row ? this.serialize(row) : null;
  }

  /**
   * Sync line quantities on an ACTIVE / PARTIALLY_FULFILLED reservation to match desired lines.
   * Removed pillows that were already fulfilled require reverseDelivery first.
   */
  async syncActiveReservationLinesInTx(
    tx: TxClient,
    args: {
      reservationId: number;
      desiredLines: Array<{ pillowId: number; quantity: number }>;
      userId?: number | null;
      reason?: string;
    }
  ) {
    const reservation = await this.lockReservation(tx, args.reservationId);
    if (
      reservation.status === 'FULFILLED' ||
      reservation.status === 'RELEASED' ||
      reservation.status === 'CANCELLED'
    ) {
      throw new ReservationDomainError(
        'FORBIDDEN_STATUS',
        `Cannot sync lines for reservation in status ${reservation.status}`
      );
    }

    const desired = this.normalizeLines(args.desiredLines);
    const desiredMap = new Map(desired.map((l) => [l.pillowId, l.quantity]));
    const lines = await this.lockLines(tx, args.reservationId);
    const currentByPillow = new Map(lines.map((l) => [l.pillowId, l]));
    const reasonBase = args.reason ?? `Sync ${reservation.referenceNumber}`;

    for (const line of lines) {
      const desiredQty = desiredMap.get(line.pillowId);
      if (desiredQty === undefined) {
        if (line.fulfilledQuantity > 0) {
          throw new ReservationDomainError(
            'FORBIDDEN_STATUS',
            `Cannot remove pillow ${line.pillowId} with fulfilled quantity; reverse delivery first`
          );
        }
        const remaining = line.quantity - line.fulfilledQuantity - line.releasedQuantity;
        if (remaining > 0) {
          try {
            await this.inventory.releaseReservedInTx(tx, {
              pillowId: line.pillowId,
              locationId: reservation.locationId,
              quantity: remaining,
              requireExistingBalance: true,
              type: 'RELEASE',
              reason: reasonBase,
              referenceType: 'RESERVATION',
              referenceId: reservation.id,
              referenceNumber: reservation.referenceNumber,
              userId: args.userId ?? null,
              forceSyncMirror: true,
            });
          } catch (e) {
            this.rethrowInventory(e);
          }
        }
        await tx.reservationLine.delete({ where: { id: line.id } });
        continue;
      }

      if (desiredQty === line.quantity) continue;

      if (desiredQty > line.quantity) {
        const delta = desiredQty - line.quantity;
        try {
          await this.inventory.increaseReservedInTx(tx, {
            pillowId: line.pillowId,
            locationId: reservation.locationId,
            quantity: delta,
            requireExistingBalance: true,
            type: 'RESERVATION',
            reason: reasonBase,
            referenceType: 'RESERVATION',
            referenceId: reservation.id,
            referenceNumber: reservation.referenceNumber,
            userId: args.userId ?? null,
            forceSyncMirror: true,
          });
        } catch (e) {
          this.rethrowInventory(e);
        }
        await tx.reservationLine.update({
          where: { id: line.id },
          data: { quantity: desiredQty },
        });
        continue;
      }

      const decrease = line.quantity - desiredQty;
      const remaining = line.quantity - line.fulfilledQuantity - line.releasedQuantity;
      if (decrease > remaining) {
        throw new ReservationDomainError(
          'INVALID_QUANTITY',
          `Cannot decrease pillow ${line.pillowId} by ${decrease}; remaining reserved: ${remaining}`
        );
      }
      try {
        await this.inventory.releaseReservedInTx(tx, {
          pillowId: line.pillowId,
          locationId: reservation.locationId,
          quantity: decrease,
          requireExistingBalance: true,
          type: 'RELEASE',
          reason: reasonBase,
          referenceType: 'RESERVATION',
          referenceId: reservation.id,
          referenceNumber: reservation.referenceNumber,
          userId: args.userId ?? null,
          forceSyncMirror: true,
        });
      } catch (e) {
        this.rethrowInventory(e);
      }
      await tx.reservationLine.update({
        where: { id: line.id },
        data: { quantity: desiredQty },
      });
    }

    for (const [pillowId, quantity] of desiredMap) {
      if (currentByPillow.has(pillowId)) continue;
      try {
        await this.inventory.increaseReservedInTx(tx, {
          pillowId,
          locationId: reservation.locationId,
          quantity,
          requireExistingBalance: true,
          type: 'RESERVATION',
          reason: reasonBase,
          referenceType: 'RESERVATION',
          referenceId: reservation.id,
          referenceNumber: reservation.referenceNumber,
          userId: args.userId ?? null,
          forceSyncMirror: true,
        });
      } catch (e) {
        this.rethrowInventory(e);
      }
      await tx.reservationLine.create({
        data: {
          reservationId: args.reservationId,
          pillowId,
          quantity,
          fulfilledQuantity: 0,
          releasedQuantity: 0,
          returnedQuantity: 0,
        },
      });
    }

    const refreshed = await tx.reservationLine.findMany({
      where: { reservationId: args.reservationId },
    });
    const status = this.computeStatus(refreshed);
    const updated = await tx.reservation.update({
      where: { id: args.reservationId },
      data: {
        status,
        fulfilledAt: status === 'FULFILLED' ? reservation.fulfilledAt ?? new Date() : null,
      },
      include: reservationInclude,
    });
    return this.serialize(updated);
  }

  private computeStatus(
    lines: Array<{ quantity: number; fulfilledQuantity: number; releasedQuantity: number }>
  ): ReservationStatus {
    const total = lines.reduce((s, l) => s + l.quantity, 0);
    const fulfilled = lines.reduce((s, l) => s + l.fulfilledQuantity, 0);
    const released = lines.reduce((s, l) => s + l.releasedQuantity, 0);
    if (released >= total && fulfilled === 0) return 'RELEASED';
    if (fulfilled >= total) return 'FULFILLED';
    if (fulfilled > 0) return 'PARTIALLY_FULFILLED';
    if (released > 0 && fulfilled + released >= total) return 'RELEASED';
    return 'ACTIVE';
  }

  private async lockReservation(tx: TxClient, id: number) {
    const rows = await tx.$queryRaw<
      Array<{
        id: number;
        status: ReservationStatus;
        locationId: number;
        referenceNumber: string;
        fulfilledAt: Date | null;
      }>
    >`
      SELECT id, status, locationId, referenceNumber, fulfilledAt
      FROM Reservation
      WHERE id = ${id}
      FOR UPDATE
    `;
    if (!rows[0]) throw new ReservationDomainError('NOT_FOUND', 'Reservation not found');
    return rows[0];
  }

  private async lockLines(tx: TxClient, reservationId: number) {
    return tx.$queryRaw<
      Array<{
        id: number;
        pillowId: number;
        quantity: number;
        fulfilledQuantity: number;
        releasedQuantity: number;
        returnedQuantity: number;
      }>
    >`
      SELECT id, pillowId, quantity, fulfilledQuantity, releasedQuantity, returnedQuantity
      FROM ReservationLine
      WHERE reservationId = ${reservationId}
      FOR UPDATE
    `;
  }

  private normalizeLines(lines: ReserveLineInput[]) {
    if (!Array.isArray(lines) || lines.length === 0) {
      throw new ReservationDomainError('INVALID_LINES', 'At least one line is required');
    }
    const map = new Map<number, number>();
    for (const row of lines) {
      const pillowId = Number(row.pillowId);
      const quantity = Number(row.quantity);
      if (!Number.isInteger(pillowId) || pillowId <= 0) {
        throw new ReservationDomainError('INVALID_LINES', 'Invalid pillowId');
      }
      if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new ReservationDomainError('INVALID_QUANTITY', 'Quantity must be a positive integer');
      }
      map.set(pillowId, (map.get(pillowId) || 0) + quantity);
    }
    return Array.from(map.entries()).map(([pillowId, quantity]) => ({ pillowId, quantity }));
  }

  private rethrowInventory(e: unknown): never {
    if (e instanceof InventoryError) {
      throw new ReservationDomainError(e.code, e.message);
    }
    throw e;
  }

  private serialize(r: any) {
    const lines = (r.lines || []).map((l: any) => {
      const remaining = Math.max(0, l.quantity - l.fulfilledQuantity - l.releasedQuantity);
      const returnable = Math.max(0, l.fulfilledQuantity - l.returnedQuantity);
      return {
        id: l.id,
        pillowId: l.pillowId,
        pillow: l.pillow,
        quantity: l.quantity,
        fulfilledQuantity: l.fulfilledQuantity,
        releasedQuantity: l.releasedQuantity,
        returnedQuantity: l.returnedQuantity,
        remainingQuantity: remaining,
        returnableQuantity: returnable,
      };
    });
    return {
      id: r.id,
      reference: r.referenceNumber,
      referenceNumber: r.referenceNumber,
      source: r.source,
      status: r.status,
      location: r.location,
      orderId: r.orderId,
      pillowOrderId: r.pillowOrderId,
      order: r.order,
      pillowOrder: r.pillowOrder,
      lines,
      totals: {
        reserved: lines.reduce((s: number, l: any) => s + l.quantity, 0),
        fulfilled: lines.reduce((s: number, l: any) => s + l.fulfilledQuantity, 0),
        released: lines.reduce((s: number, l: any) => s + l.releasedQuantity, 0),
        remaining: lines.reduce((s: number, l: any) => s + l.remainingQuantity, 0),
        returnable: lines.reduce((s: number, l: any) => s + l.returnableQuantity, 0),
      },
      createdBy: r.createdBy,
      createdAt: r.createdAt,
      releasedAt: r.releasedAt,
      fulfilledAt: r.fulfilledAt,
      cancelledAt: r.cancelledAt,
      updatedAt: r.updatedAt,
    };
  }
}

export function reservationErrorToHttp(error: unknown): {
  status: number;
  body: { error: string; code?: string };
} {
  if (error instanceof ReservationDomainError) {
    const status =
      error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'FORBIDDEN_STATUS'
          ? 409
          : 400;
    return { status, body: { error: error.message, code: error.code } };
  }
  return { status: 500, body: { error: 'Internal reservation error' } };
}
