import { PrismaClient, OrderStatus } from '@prisma/client';
import { CutoverDomainError, CutoverFreezeService } from './CutoverFreezeService';
import { getInventoryMode } from './InventoryMode';

export type LegacyOrderSource = 'ORDER' | 'PILLOW_ORDER';
export type LegacyTransitionAction = 'CLOSE_UNDER_LEGACY' | 'FREEZE' | 'MIGRATE_TO_INVENTORY';

export type LegacyOrderClassification =
  | 'READY_TO_CLOSE'
  | 'TRANSITION_REQUIRED'
  | 'MIGRATION_REQUIRED'
  | 'FREEZE_REQUIRED'
  | 'LOW_RISK'
  | 'CLOSED_UNDER_LEGACY'
  | 'FROZEN'
  | 'HAS_RESERVATION';

/**
 * Read-only diagnostics + explicit admin transitions for pre-cutover accessory orders.
 * Never auto-runs. MIGRATE refuses automatic reservation (explicit reconciliation required).
 */
export class LegacyOrderTransitionService {
  private readonly freeze: CutoverFreezeService;

  constructor(private readonly prisma: PrismaClient) {
    this.freeze = new CutoverFreezeService(prisma);
  }

  async listDiagnostic() {
    const openStatuses: OrderStatus[] = ['PENDING', 'IN_PROCESS'];
    const [mattress, pillowOrders, transitions] = await Promise.all([
      this.prisma.order.findMany({
        where: { status: { in: openStatuses }, pillowItems: { some: {} } },
        select: {
          id: true,
          status: true,
          locationId: true,
          createdAt: true,
          updatedAt: true,
          pillowItems: {
            select: {
              pillowId: true,
              quantity: true,
              pillow: { select: { name: true } },
            },
          },
          reservations: { select: { id: true, status: true }, take: 1, orderBy: { id: 'desc' } },
        },
        orderBy: { id: 'asc' },
        take: 500,
      }),
      this.prisma.pillowOrder.findMany({
        where: { status: { in: openStatuses } },
        select: {
          id: true,
          status: true,
          locationId: true,
          createdAt: true,
          updatedAt: true,
          items: {
            select: {
              pillowId: true,
              quantity: true,
              pillow: { select: { name: true } },
            },
          },
          reservations: { select: { id: true, status: true }, take: 1, orderBy: { id: 'desc' } },
        },
        orderBy: { id: 'asc' },
        take: 500,
      }),
      this.prisma.legacyOrderTransition.findMany(),
    ]);

    const byOrder = new Map(
      transitions.filter((t) => t.source === 'ORDER' && t.orderId != null).map((t) => [t.orderId!, t])
    );
    const byPillow = new Map(
      transitions
        .filter((t) => t.source === 'PILLOW_ORDER' && t.pillowOrderId != null)
        .map((t) => [t.pillowOrderId!, t])
    );

    const mattressRows = mattress.map((o) => {
      const transition = byOrder.get(o.id) ?? null;
      const hasReservation = o.reservations.length > 0;
      const legacyStockEffect = this.mattressLegacyEffect(o.status);
      const { classification, recommendedAction } = this.classify({
        hasReservation,
        locationId: o.locationId,
        legacyStockEffect,
        transitionAction: transition?.action as LegacyTransitionAction | undefined,
        status: o.status,
        source: 'ORDER',
      });
      return {
        id: o.id,
        type: 'ORDER' as const,
        status: o.status,
        locationId: o.locationId,
        hasReservation,
        reservationId: o.reservations[0]?.id ?? null,
        accessoryLines: o.pillowItems.map((i) => ({
          pillowId: i.pillowId,
          name: i.pillow.name,
          quantity: i.quantity,
        })),
        accessoryQuantities: o.pillowItems.reduce((s, i) => s + i.quantity, 0),
        legacyStockEffect,
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
        classification,
        recommendedAction,
        transition: transition
          ? { action: transition.action, status: transition.status, notes: transition.notes, at: transition.updatedAt }
          : null,
      };
    });

    const pillowRows = pillowOrders.map((o) => {
      const transition = byPillow.get(o.id) ?? null;
      const hasReservation = o.reservations.length > 0;
      const legacyStockEffect = 'DEDUCTED_ON_CREATE' as const;
      const { classification, recommendedAction } = this.classify({
        hasReservation,
        locationId: o.locationId,
        legacyStockEffect,
        transitionAction: transition?.action as LegacyTransitionAction | undefined,
        status: o.status,
        source: 'PILLOW_ORDER',
      });
      return {
        id: o.id,
        type: 'PILLOW_ORDER' as const,
        status: o.status,
        locationId: o.locationId,
        hasReservation,
        reservationId: o.reservations[0]?.id ?? null,
        accessoryLines: o.items.map((i) => ({
          pillowId: i.pillowId,
          name: i.pillow.name,
          quantity: i.quantity,
        })),
        accessoryQuantities: o.items.reduce((s, i) => s + i.quantity, 0),
        legacyStockEffect,
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
        classification,
        recommendedAction,
        transition: transition
          ? { action: transition.action, status: transition.status, notes: transition.notes, at: transition.updatedAt }
          : null,
      };
    });

    return {
      note: 'Read-only diagnostic + recommended actions. Admin must choose explicitly. No auto-migration.',
      mattressOrders: mattressRows,
      pillowOrders: pillowRows,
      summary: {
        total: mattressRows.length + pillowRows.length,
        transitionRequired: [...mattressRows, ...pillowRows].filter((r) =>
          ['TRANSITION_REQUIRED', 'MIGRATION_REQUIRED', 'FREEZE_REQUIRED'].includes(r.classification)
        ).length,
        closedOrFrozen: [...mattressRows, ...pillowRows].filter((r) =>
          ['CLOSED_UNDER_LEGACY', 'FROZEN', 'HAS_RESERVATION', 'LOW_RISK'].includes(r.classification)
        ).length,
      },
    };
  }

  /**
   * Apply an explicit admin transition. Requires confirm: true.
   */
  async applyTransition(args: {
    source: LegacyOrderSource;
    id: number;
    action: LegacyTransitionAction;
    userId: number;
    notes?: string;
    confirm: boolean;
  }) {
    if (!args.confirm) {
      throw new CutoverDomainError(
        'CONFIRMATION_REQUIRED',
        'Explicit confirm=true is required for legacy order transitions'
      );
    }

    if (args.source === 'ORDER') {
      const order = await this.prisma.order.findUnique({
        where: { id: args.id },
        include: { pillowItems: true, reservations: { take: 1 } },
      });
      if (!order) throw new CutoverDomainError('NOT_FOUND', 'Order not found');
      if (!order.pillowItems.length) {
        throw new CutoverDomainError('NO_ACCESSORIES', 'Order has no accessory lines');
      }
      return this.applyFor({
        source: 'ORDER',
        orderId: order.id,
        pillowOrderId: null,
        action: args.action,
        userId: args.userId,
        notes: args.notes,
        status: order.status,
        locationId: order.locationId,
        hasReservation: order.reservations.length > 0,
        legacyStockEffect: this.mattressLegacyEffect(order.status),
        lines: order.pillowItems.map((i) => ({ pillowId: i.pillowId, quantity: i.quantity })),
      });
    }

    const po = await this.prisma.pillowOrder.findUnique({
      where: { id: args.id },
      include: { items: true, reservations: { take: 1 } },
    });
    if (!po) throw new CutoverDomainError('NOT_FOUND', 'Pillow order not found');
    if (!po.items.length) {
      throw new CutoverDomainError('NO_ACCESSORIES', 'Pillow order has no items');
    }
    return this.applyFor({
      source: 'PILLOW_ORDER',
      orderId: null,
      pillowOrderId: po.id,
      action: args.action,
      userId: args.userId,
      notes: args.notes,
      status: po.status,
      locationId: po.locationId,
      hasReservation: po.reservations.length > 0,
      legacyStockEffect: 'DEDUCTED_ON_CREATE',
      lines: po.items.map((i) => ({ pillowId: i.pillowId, quantity: i.quantity })),
    });
  }

  /**
   * Look up applied transition for gate checks (freeze / close).
   */
  async getAppliedTransition(
    source: LegacyOrderSource,
    id: number
  ): Promise<{ action: string; status: string } | null> {
    const row =
      source === 'ORDER'
        ? await this.prisma.legacyOrderTransition.findFirst({
            where: { source: 'ORDER', orderId: id },
          })
        : await this.prisma.legacyOrderTransition.findFirst({
            where: { source: 'PILLOW_ORDER', pillowOrderId: id },
          });
    return row ? { action: row.action, status: row.status } : null;
  }

  /**
   * Gate for inventory-affecting changes. Throws if FROZEN.
   * Returns 'SKIP_INVENTORY' if CLOSED_UNDER_LEGACY (treat as no inventory work).
   */
  async gateInventoryAffectingChange(
    source: LegacyOrderSource,
    id: number,
    hasAccessoryLines: boolean
  ): Promise<'OK' | 'SKIP_INVENTORY'> {
    if (!hasAccessoryLines) return 'OK';
    const t = await this.getAppliedTransition(source, id);
    if (!t) return 'OK';
    if (t.action === 'FREEZE') {
      throw new CutoverDomainError(
        'LEGACY_ORDER_FROZEN_FOR_CUTOVER',
        'This legacy order is frozen for cutover and cannot change accessory inventory until an admin unfreezes or closes it under legacy policy'
      );
    }
    if (t.action === 'CLOSE_UNDER_LEGACY') {
      return 'SKIP_INVENTORY';
    }
    return 'OK';
  }

  private async applyFor(args: {
    source: LegacyOrderSource;
    orderId: number | null;
    pillowOrderId: number | null;
    action: LegacyTransitionAction;
    userId: number;
    notes?: string;
    status: string;
    locationId: number | null;
    hasReservation: boolean;
    legacyStockEffect: string;
    lines: Array<{ pillowId: number; quantity: number }>;
  }) {
    const existing = await this.getAppliedTransition(
      args.source,
      (args.orderId ?? args.pillowOrderId)!
    );
    if (existing && existing.action === args.action && existing.status === 'APPLIED') {
      return { idempotent: true, action: args.action, transition: existing };
    }

    if (args.action === 'MIGRATE_TO_INVENTORY') {
      return this.migrate(args);
    }

    const row = await this.prisma.legacyOrderTransition.upsert({
      where:
        args.source === 'ORDER'
          ? { source_orderId: { source: 'ORDER', orderId: args.orderId! } }
          : { source_pillowOrderId: { source: 'PILLOW_ORDER', pillowOrderId: args.pillowOrderId! } },
      create: {
        source: args.source,
        orderId: args.orderId,
        pillowOrderId: args.pillowOrderId,
        action: args.action,
        status: 'APPLIED',
        notes: args.notes ?? null,
        userId: args.userId,
      },
      update: {
        action: args.action,
        status: 'APPLIED',
        notes: args.notes ?? null,
        userId: args.userId,
      },
    });

    await this.freeze.writeAudit({
      action: 'LEGACY_TRANSITION',
      userId: args.userId,
      inventoryModeBefore: await getInventoryMode(this.prisma),
      inventoryModeAfter: await getInventoryMode(this.prisma),
      notes: args.notes ?? `${args.action} ${args.source}#${args.orderId ?? args.pillowOrderId}`,
      details: {
        source: args.source,
        orderId: args.orderId,
        pillowOrderId: args.pillowOrderId,
        action: args.action,
        legacyStockEffect: args.legacyStockEffect,
      },
    });

    return { idempotent: false, action: args.action, transition: row };
  }

  private async migrate(args: {
    source: LegacyOrderSource;
    orderId: number | null;
    pillowOrderId: number | null;
    userId: number;
    notes?: string;
    locationId: number | null;
    hasReservation: boolean;
    legacyStockEffect: string;
    lines: Array<{ pillowId: number; quantity: number }>;
  }) {
    if (args.hasReservation) {
      return {
        idempotent: true,
        action: 'MIGRATE_TO_INVENTORY' as const,
        message: 'Reservation already exists',
      };
    }

    // Never auto-reserve: legacy stock effects + physical opening count make this ambiguous.
    // Admin must CLOSE_UNDER_LEGACY or FREEZE, then reconcile after cutover if needed.
    void args;
    throw new CutoverDomainError(
      'LEGACY_MIGRATION_REQUIRES_EXPLICIT_RECONCILIATION',
      'Automatic MIGRATE_TO_INVENTORY is not safe: prior LEGACY stock effects and the forthcoming physical opening count must be reconciled by an administrator. Use CLOSE_UNDER_LEGACY or FREEZE until then.'
    );
  }

  private mattressLegacyEffect(status: string): 'NONE' | 'DEDUCTED_ON_STATUS' {
    if (status === 'IN_PROCESS' || status === 'DELIVERED') return 'DEDUCTED_ON_STATUS';
    return 'NONE';
  }

  private classify(args: {
    hasReservation: boolean;
    locationId: number | null;
    legacyStockEffect: string;
    transitionAction?: LegacyTransitionAction;
    status: string;
    source: LegacyOrderSource;
  }): { classification: LegacyOrderClassification; recommendedAction: string } {
    if (args.transitionAction === 'CLOSE_UNDER_LEGACY') {
      return { classification: 'CLOSED_UNDER_LEGACY', recommendedAction: 'NONE' };
    }
    if (args.transitionAction === 'FREEZE') {
      return { classification: 'FROZEN', recommendedAction: 'NONE_UNTIL_UNFROZEN_OR_CLOSE' };
    }
    if (args.hasReservation) {
      return { classification: 'HAS_RESERVATION', recommendedAction: 'NONE' };
    }
    if (args.legacyStockEffect !== 'NONE') {
      return {
        classification: 'TRANSITION_REQUIRED',
        recommendedAction: 'CLOSE_UNDER_LEGACY_OR_FREEZE — MIGRATE unsafe (legacy stock already affected)',
      };
    }
    if (!args.locationId) {
      return {
        classification: 'TRANSITION_REQUIRED',
        recommendedAction: 'CLOSE_UNDER_LEGACY_OR_FREEZE — assign location only with explicit admin approval later',
      };
    }
    return {
      classification: 'MIGRATION_REQUIRED',
      recommendedAction:
        'After cutover + opening balances: consider MIGRATE_TO_INVENTORY only if no legacy deduction; otherwise CLOSE_UNDER_LEGACY',
    };
  }
}
