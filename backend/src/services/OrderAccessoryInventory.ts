import { Prisma, PrismaClient, OrderStatus } from '@prisma/client';
import { getInventoryMode } from './InventoryMode';
import {
  ReservationDomainError,
  ReservationService,
  ReserveLineInput,
} from './ReservationService';

type TxClient = Prisma.TransactionClient;

/**
 * Mode-aware accessory inventory for orders (TASK 12 + TASK 14.1).
 *
 * Status mapping (INVENTORY mode):
 *
 *   CREATE            → reserve (same transaction as order create when possible)
 *   IN_PROCESS        → no inventory change (stay reserved)
 *   DELIVERED         → fulfill remaining
 *   DELIVERED→PENDING → reverseDelivery (physical↑ reserved↑, reservation ACTIVE again)
 *   → RETURNED        → return fulfilled qty + release remaining
 *
 * Pre-cutover orders with accessory lines but no Reservation:
 *   throw LEGACY_ORDER_INVENTORY_MIGRATION_REQUIRED (never silent skip).
 *
 * LEGACY mode: this helper no-ops (callers keep Pillow.stock behavior).
 */
export class OrderAccessoryInventory {
  private readonly reservations: ReservationService;

  constructor(private readonly prisma: PrismaClient) {
    this.reservations = new ReservationService(prisma);
  }

  get service() {
    return this.reservations;
  }

  async isInventoryMode(client: PrismaClient | TxClient = this.prisma): Promise<boolean> {
    return (await getInventoryMode(client)) === 'INVENTORY';
  }

  async requireLocationForInventory(locationId: number | null | undefined): Promise<number> {
    if (!locationId || !Number.isInteger(locationId) || locationId <= 0) {
      throw new ReservationDomainError(
        'INVENTORY_LOCATION_REQUIRED',
        'A sellable fulfillment location is required when inventory mode is active'
      );
    }
    return locationId;
  }

  /**
   * Reserve accessories inside an existing transaction (order create atomicity).
   */
  async reserveMattressOrderInTx(
    tx: TxClient,
    args: {
      orderId: number;
      locationId: number | null;
      lines: ReserveLineInput[];
      userId?: number | null;
    }
  ) {
    if (!args.lines.length) return null;
    const locationId = await this.requireLocationForInventory(args.locationId);
    return this.reservations.reserveInTx(tx, {
      source: 'ORDER',
      orderId: args.orderId,
      locationId,
      lines: args.lines,
      createdById: args.userId ?? null,
      idempotencyKey: `ORDER:${args.orderId}:RESERVE`,
      referenceLabel: `Order #${args.orderId}`,
    });
  }

  async reservePillowOrderInTx(
    tx: TxClient,
    args: {
      pillowOrderId: number;
      locationId: number | null;
      lines: ReserveLineInput[];
      userId?: number | null;
    }
  ) {
    if (!args.lines.length) return null;
    const locationId = await this.requireLocationForInventory(args.locationId);
    return this.reservations.reserveInTx(tx, {
      source: 'PILLOW_ORDER',
      pillowOrderId: args.pillowOrderId,
      locationId,
      lines: args.lines,
      createdById: args.userId ?? null,
      idempotencyKey: `PILLOW_ORDER:${args.pillowOrderId}:RESERVE`,
      referenceLabel: `PillowOrder #${args.pillowOrderId}`,
    });
  }

  async onPillowOrderCreated(args: {
    pillowOrderId: number;
    locationId: number | null;
    lines: Array<{ pillowId: number; quantity: number }>;
    userId?: number | null;
  }) {
    if (!(await this.isInventoryMode())) return null;
    if (!args.lines.length) return null;
    return this.prisma.$transaction((tx) => this.reservePillowOrderInTx(tx, args));
  }

  async onMattressOrderCreated(args: {
    orderId: number;
    locationId: number | null;
    lines: Array<{ pillowId: number; quantity: number }>;
    userId?: number | null;
  }) {
    if (!(await this.isInventoryMode())) return null;
    if (!args.lines.length) return null;
    return this.prisma.$transaction((tx) => this.reserveMattressOrderInTx(tx, args));
  }

  /**
   * Apply inventory side-effects for accessory lines on status change.
   * Must run inside the same transaction as the order status update.
   *
   * Returns true if INVENTORY mode handled accessories (caller must skip legacy pillow stock).
   */
  async onStatusChangeInTx(
    tx: TxClient,
    args: {
      source: 'ORDER' | 'PILLOW_ORDER';
      orderId: number;
      oldStatus: OrderStatus | string;
      newStatus: OrderStatus | string;
      userId?: number | null;
      /** When true, order currently has accessory lines (needed for legacy-order detection). */
      hasAccessoryLines: boolean;
    }
  ): Promise<boolean> {
    if (!(await this.isInventoryMode(tx))) return false;

    const oldS = args.oldStatus;
    const newS = args.newStatus;
    if (oldS === newS) return true;

    // Explicit admin transitions (TASK 15)
    const { LegacyOrderTransitionService } = await import('./LegacyOrderTransitionService');
    const transitions = new LegacyOrderTransitionService(this.prisma);
    const gate = await transitions.gateInventoryAffectingChange(
      args.source,
      args.orderId,
      args.hasAccessoryLines
    );
    if (gate === 'SKIP_INVENTORY') return true;
    // CutoverDomainError from FREEZE propagates to route mappers

    const reservation =
      args.source === 'ORDER'
        ? await this.reservations.findOpenForOrderInTx(tx, args.orderId, 'ORDER')
        : await this.reservations.findOpenForOrderInTx(tx, args.orderId, 'PILLOW_ORDER');

    if (!reservation) {
      if (args.hasAccessoryLines) {
        throw new ReservationDomainError(
          'LEGACY_ORDER_INVENTORY_MIGRATION_REQUIRED',
          'This order was created before inventory cutover and requires transition handling before its accessory inventory can be changed.'
        );
      }
      // No accessories → nothing to do
      return true;
    }

    // Fulfill on DELIVERED
    if (newS === 'DELIVERED' && oldS !== 'DELIVERED') {
      if (reservation.status === 'ACTIVE' || reservation.status === 'PARTIALLY_FULFILLED') {
        await this.reservations.fulfillReservationInTx(tx, reservation.id, {
          userId: args.userId,
          reason: `${args.source} #${args.orderId} delivered`,
        });
      }
      // FULFILLED already → idempotent no-op
      return true;
    }

    // Cancel / hold back to PENDING — reverse delivery so re-delivery can fulfill again
    if (newS === 'PENDING' && (oldS === 'IN_PROCESS' || oldS === 'DELIVERED')) {
      const current =
        args.source === 'ORDER'
          ? await this.reservations.findOpenForOrderInTx(tx, args.orderId, 'ORDER')
          : await this.reservations.findOpenForOrderInTx(tx, args.orderId, 'PILLOW_ORDER');
      if (!current) return true;

      if (current.status === 'FULFILLED' || current.status === 'PARTIALLY_FULFILLED') {
        await this.reservations.reverseDeliveryInTx(tx, current.id, {
          userId: args.userId,
          reason: `${args.source} #${args.orderId} reverted to PENDING`,
        });
      }

      // After reverse, release only if we came from IN_PROCESS with no intent to keep reservation?
      // Spec: DELIVERED → PENDING must leave reservation eligible for future delivery (ACTIVE).
      // IN_PROCESS → PENDING: still keep ACTIVE reservation (order still open).
      // Do NOT release on PENDING hold — reservation stays for the order.
      return true;
    }

    // RETURNED — customer return path (not re-open for delivery)
    if (newS === 'RETURNED' && oldS !== 'RETURNED') {
      const current =
        args.source === 'ORDER'
          ? await this.reservations.findOpenForOrderInTx(tx, args.orderId, 'ORDER')
          : await this.reservations.findOpenForOrderInTx(tx, args.orderId, 'PILLOW_ORDER');
      if (!current) return true;

      if (current.status === 'ACTIVE' || current.status === 'PARTIALLY_FULFILLED') {
        const toReturn = current.lines
          .filter((l: { fulfilledQuantity: number; returnedQuantity: number }) => l.fulfilledQuantity - l.returnedQuantity > 0)
          .map((l: { pillowId: number; fulfilledQuantity: number; returnedQuantity: number }) => ({
            pillowId: l.pillowId,
            quantity: l.fulfilledQuantity - l.returnedQuantity,
          }));
        if (toReturn.length) {
          await this.reservations.returnFulfilledInTx(tx, current.id, {
            lines: toReturn,
            userId: args.userId,
            reason: `${args.source} #${args.orderId} returned`,
          });
        }
        await this.reservations.releaseReservationInTx(tx, current.id, {
          userId: args.userId,
          reason: `${args.source} #${args.orderId} returned`,
        });
      } else if (current.status === 'FULFILLED') {
        const toReturn = current.lines
          .filter((l: { returnableQuantity: number }) => l.returnableQuantity > 0)
          .map((l: { pillowId: number; returnableQuantity: number }) => ({
            pillowId: l.pillowId,
            quantity: l.returnableQuantity,
          }));
        if (toReturn.length) {
          await this.reservations.returnFulfilledInTx(tx, current.id, {
            lines: toReturn,
            userId: args.userId,
            reason: `${args.source} #${args.orderId} returned`,
          });
        }
      }
      return true;
    }

    // IN_PROCESS: stay reserved — no-op
    return true;
  }

  /** Standalone wrapper (opens its own transaction). Prefer onStatusChangeInTx. */
  async onStatusChange(args: {
    source: 'ORDER' | 'PILLOW_ORDER';
    orderId: number;
    oldStatus: OrderStatus | string;
    newStatus: OrderStatus | string;
    userId?: number | null;
    hasAccessoryLines?: boolean;
  }): Promise<boolean> {
    if (!(await this.isInventoryMode())) return false;

    let hasAccessoryLines = args.hasAccessoryLines;
    if (hasAccessoryLines === undefined) {
      if (args.source === 'ORDER') {
        const count = await this.prisma.orderPillowItem.count({ where: { orderId: args.orderId } });
        hasAccessoryLines = count > 0;
      } else {
        const count = await this.prisma.pillowOrderItem.count({ where: { orderId: args.orderId } });
        hasAccessoryLines = count > 0;
      }
    }

    return this.prisma.$transaction((tx) =>
      this.onStatusChangeInTx(tx, { ...args, hasAccessoryLines: !!hasAccessoryLines })
    );
  }

  /**
   * After full-update replaces accessory lines: reconcile ACTIVE reservation quantities.
   * For DELIVERED orders, reverse delivery first, sync lines, then re-fulfill.
   */
  async reconcileOrderAccessoriesInTx(
    tx: TxClient,
    args: {
      orderId: number;
      locationId: number | null;
      status: string;
      lines: ReserveLineInput[];
      userId?: number | null;
    }
  ) {
    if (!(await this.isInventoryMode(tx))) return null;

    const consolidated = this.consolidateLines(args.lines);
    const existing = await this.reservations.findOpenForOrderInTx(tx, args.orderId, 'ORDER');

    if (!consolidated.length) {
      if (existing && (existing.status === 'ACTIVE' || existing.status === 'PARTIALLY_FULFILLED')) {
        if (existing.status === 'PARTIALLY_FULFILLED' || existing.totals.fulfilled > 0) {
          await this.reservations.reverseDeliveryInTx(tx, existing.id, {
            userId: args.userId,
            reason: `Order #${args.orderId} accessories cleared`,
          });
        }
        await this.reservations.releaseReservationInTx(tx, existing.id, {
          userId: args.userId,
          reason: `Order #${args.orderId} accessories cleared`,
        });
      } else if (!existing) {
        // No reservation and no accessories — ok
      } else if (existing.status === 'FULFILLED') {
        await this.reservations.reverseDeliveryInTx(tx, existing.id, {
          userId: args.userId,
          reason: `Order #${args.orderId} accessories cleared`,
        });
        await this.reservations.releaseReservationInTx(tx, existing.id, {
          userId: args.userId,
          reason: `Order #${args.orderId} accessories cleared`,
        });
      }
      return null;
    }

    if (!existing) {
      // Accessories present but no reservation — legacy pre-cutover order
      throw new ReservationDomainError(
        'LEGACY_ORDER_INVENTORY_MIGRATION_REQUIRED',
        'This order was created before inventory cutover and requires transition handling before its accessory inventory can be changed.'
      );
    }

    const locationId = args.locationId ?? existing.location?.id;
    if (!locationId) {
      throw new ReservationDomainError(
        'INVENTORY_LOCATION_REQUIRED',
        'A sellable fulfillment location is required when inventory mode is active'
      );
    }

    const wasDelivered = args.status === 'DELIVERED';
    if (wasDelivered || existing.status === 'FULFILLED' || existing.totals.fulfilled > 0) {
      await this.reservations.reverseDeliveryInTx(tx, existing.id, {
        userId: args.userId,
        reason: `Order #${args.orderId} full update before accessory sync`,
      });
    }

    const open = await this.reservations.findOpenForOrderInTx(tx, args.orderId, 'ORDER');
    if (!open || open.status === 'RELEASED' || open.status === 'CANCELLED') {
      return this.reservations.reserveInTx(tx, {
        source: 'ORDER',
        orderId: args.orderId,
        locationId,
        lines: consolidated,
        createdById: args.userId ?? null,
        idempotencyKey: `ORDER:${args.orderId}:RESERVE:FULL:${Date.now()}`,
        referenceLabel: `Order #${args.orderId}`,
      });
    }

    await this.reservations.syncActiveReservationLinesInTx(tx, {
      reservationId: open.id,
      desiredLines: consolidated,
      userId: args.userId,
      reason: `Order #${args.orderId} full update accessory sync`,
    });

    if (wasDelivered) {
      await this.reservations.fulfillReservationInTx(tx, open.id, {
        userId: args.userId,
        reason: `Order #${args.orderId} re-fulfilled after full update`,
      });
    }

    if (args.status === 'RETURNED') {
      const current = await this.reservations.findOpenForOrderInTx(tx, args.orderId, 'ORDER');
      if (current) {
        if (current.status === 'FULFILLED' || current.totals.fulfilled > 0) {
          const toReturn = current.lines
            .filter((l: { returnableQuantity: number }) => l.returnableQuantity > 0)
            .map((l: { pillowId: number; returnableQuantity: number }) => ({
              pillowId: l.pillowId,
              quantity: l.returnableQuantity,
            }));
          if (toReturn.length) {
            await this.reservations.returnFulfilledInTx(tx, current.id, {
              lines: toReturn,
              userId: args.userId,
              reason: `Order #${args.orderId} returned via full update`,
            });
          }
        }
        const openAfter = await this.reservations.findOpenForOrderInTx(tx, args.orderId, 'ORDER');
        if (openAfter && (openAfter.status === 'ACTIVE' || openAfter.status === 'PARTIALLY_FULFILLED')) {
          await this.reservations.releaseReservationInTx(tx, openAfter.id, {
            userId: args.userId,
            reason: `Order #${args.orderId} returned via full update`,
          });
        }
      }
    }

    const final = await tx.reservation.findUnique({
      where: { id: open.id },
      include: {
        location: { select: { id: true, code: true, name: true, type: true } },
        lines: {
          include: { pillow: { select: { id: true, name: true } } },
          orderBy: { id: 'asc' as const },
        },
      },
    });
    return final;
  }

  /**
   * Prepare order delete: release active reservation or reverse+release fulfilled.
   * Throws ORDER_HAS_ACTIVE_INVENTORY_RESERVATION only if we choose reject policy —
   * we prefer release-then-delete.
   */
  async prepareOrderDeleteInTx(
    tx: TxClient,
    args: { orderId: number; userId?: number | null }
  ) {
    if (!(await this.isInventoryMode(tx))) return;

    const reservation = await this.reservations.findReservationForOrderInTx(
      tx,
      args.orderId,
      'ORDER'
    );
    if (!reservation) return;

    if (reservation.status === 'RELEASED' || reservation.status === 'CANCELLED') {
      // Detach FK so order can be deleted
      await tx.reservation.update({
        where: { id: reservation.id },
        data: { orderId: null },
      });
      return;
    }

    if (reservation.status === 'FULFILLED' || reservation.totals.fulfilled > 0) {
      await this.reservations.reverseDeliveryInTx(tx, reservation.id, {
        userId: args.userId,
        reason: `Order #${args.orderId} deleted`,
      });
    }

    const open = await this.reservations.findOpenForOrderInTx(tx, args.orderId, 'ORDER');
    if (open && (open.status === 'ACTIVE' || open.status === 'PARTIALLY_FULFILLED')) {
      await this.reservations.releaseReservationInTx(tx, open.id, {
        userId: args.userId,
        reason: `Order #${args.orderId} deleted`,
      });
    }

    // Detach FK after release (reservation row retained for audit)
    await tx.reservation.update({
      where: { id: reservation.id },
      data: { orderId: null },
    });
  }

  private consolidateLines(lines: ReserveLineInput[]): ReserveLineInput[] {
    const map = new Map<number, number>();
    for (const l of lines) {
      const pillowId = Number(l.pillowId);
      const quantity = Number(l.quantity);
      if (!Number.isInteger(pillowId) || pillowId <= 0) continue;
      if (!Number.isInteger(quantity) || quantity <= 0) continue;
      map.set(pillowId, (map.get(pillowId) || 0) + quantity);
    }
    return Array.from(map.entries()).map(([pillowId, quantity]) => ({ pillowId, quantity }));
  }
}
