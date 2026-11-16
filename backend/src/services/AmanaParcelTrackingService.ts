import {
  AmanaParcelStatus,
  OrderStatus,
  Prisma,
  PrismaClient,
  User,
  UserRole,
} from '@prisma/client';
import {
  assertCanAccessOrder,
  getUserDeliveryServiceIds,
  OrderAccessError,
} from '../utils/order-access';
import {
  AMANA_PARCEL_INITIAL_STATUS,
  AMANA_PARCEL_NOTE_MAX,
  AMANA_PARCEL_STATUSES,
  AMANA_PARCEL_STATUS_LABELS,
  AMANA_PARCEL_STATUS_COLORS,
  amanaParcelStatusMeta,
  isAmanaParcelStatus,
  parseAmanaParcelStatus,
} from '../utils/amanaParcelStatus';
import {
  AmanaParcelAlertSeverity,
  amanaParcelAlertSeverity,
  amanaParcelAlertSuggestedAction,
} from '../utils/amanaParcelAlerts';

type TxClient = Prisma.TransactionClient;

export class AmanaParcelTrackingError extends Error {
  constructor(
    message: string,
    public readonly code: string = 'AMANA_PARCEL_ERROR'
  ) {
    super(message);
    this.name = 'AmanaParcelTrackingError';
  }
}

export function amanaParcelErrorToHttp(
  error: unknown
): { status: number; body: object } | null {
  if (error instanceof OrderAccessError) {
    return { status: 403, body: { error: error.message, code: 'FORBIDDEN' } };
  }
  if (error instanceof AmanaParcelTrackingError) {
    const statusByCode: Record<string, number> = {
      NOT_FOUND: 404,
      NOT_AMANA: 400,
      NOT_IN_PROCESS: 400,
      MISSING_IN_PROCESS_AT: 400,
      INVALID_STATUS: 400,
      INVALID_NOTE: 400,
      INVALID_EXPORT_IDS: 400,
      EXPORT_TOO_LARGE: 413,
      FORBIDDEN: 403,
      NO_CHANGE: 200,
    };
    return {
      status: statusByCode[error.code] ?? 400,
      body: {
        error: error.message,
        code: error.code,
      },
    };
  }
  return null;
}

function normalizeNote(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string') {
    throw new AmanaParcelTrackingError('note must be a string', 'INVALID_NOTE');
  }
  const note = raw.trim();
  if (!note) return null;
  if (note.length > AMANA_PARCEL_NOTE_MAX) {
    throw new AmanaParcelTrackingError(
      `note must be at most ${AMANA_PARCEL_NOTE_MAX} characters`,
      'INVALID_NOTE'
    );
  }
  return note;
}

function assertCanMutateAmanaParcel(user: User): void {
  if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUIVI) {
    throw new AmanaParcelTrackingError(
      'Only ADMIN and SUIVI can update Amana parcel tracking',
      'FORBIDDEN'
    );
  }
}

const historyInclude = {
  changedBy: { select: { id: true, name: true, role: true } },
} as const;

const trackingInclude = {
  history: {
    include: historyInclude,
    orderBy: { changedAt: 'desc' as const },
  },
} as const;

function mapHistoryRow(row: {
  id: number;
  oldStatus: AmanaParcelStatus | null;
  newStatus: AmanaParcelStatus;
  changedAt: Date;
  changedByUserId: number | null;
  note: string | null;
  changedBy: { id: number; name: string; role: string } | null;
}) {
  return {
    id: row.id,
    oldStatus: row.oldStatus
      ? amanaParcelStatusMeta(row.oldStatus)
      : null,
    newStatus: amanaParcelStatusMeta(row.newStatus),
    changedAt: row.changedAt,
    note: row.note,
    changedBy: row.changedBy
      ? {
          id: row.changedBy.id,
          name: row.changedBy.name,
          role: row.changedBy.role,
        }
      : null,
  };
}

function mapTracking(row: {
  id: number;
  orderId: number;
  status: AmanaParcelStatus;
  initialStatusAt: Date;
  lastStatusAt: Date;
  createdAt: Date;
  updatedAt: Date;
  history?: Array<{
    id: number;
    oldStatus: AmanaParcelStatus | null;
    newStatus: AmanaParcelStatus;
    changedAt: Date;
    changedByUserId: number | null;
    note: string | null;
    changedBy: { id: number; name: string; role: string } | null;
  }>;
}) {
  return {
    id: row.id,
    orderId: row.orderId,
    status: amanaParcelStatusMeta(row.status),
    initialStatusAt: row.initialStatusAt,
    lastStatusAt: row.lastStatusAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    history: Array.isArray(row.history) ? row.history.map(mapHistoryRow) : undefined,
  };
}

export class AmanaParcelTrackingService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Idempotent ensure: create tracking + initial history if missing.
   * No-op when record already exists (preserves history on re-entry).
   * Returns null when order is not eligible (not IN_PROCESS by default).
   *
   * Initial timestamp:
   * - Prefer Order.inProcessAt when present (new / normal path).
   * - If null, fall back to Order.createdAt (legacy Orders only — does not write Order.inProcessAt).
   */
  async ensureForOrderInTx(
    tx: TxClient,
    args: {
      orderId: number;
      userId?: number | null;
      /** When true, require Order.status === IN_PROCESS (default). */
      requireInProcess?: boolean;
    }
  ): Promise<{
    created: boolean;
    trackingId: number;
    initialAtSource?: 'inProcessAt' | 'createdAt';
  } | null> {
    const existing = await tx.amanaParcelTracking.findUnique({
      where: { orderId: args.orderId },
      select: { id: true },
    });
    if (existing) {
      return { created: false, trackingId: existing.id };
    }

    const order = await tx.order.findUnique({
      where: { id: args.orderId },
      select: {
        id: true,
        status: true,
        inProcessAt: true,
        createdAt: true,
      },
    });
    if (!order) {
      throw new AmanaParcelTrackingError('Order not found', 'NOT_FOUND');
    }

    const requireInProcess = args.requireInProcess !== false;
    if (requireInProcess && order.status !== OrderStatus.IN_PROCESS) {
      return null;
    }

    const initialAtSource: 'inProcessAt' | 'createdAt' = order.inProcessAt
      ? 'inProcessAt'
      : 'createdAt';
    const initialAt = order.inProcessAt ?? order.createdAt;
    if (!initialAt) {
      throw new AmanaParcelTrackingError(
        'Order.inProcessAt and Order.createdAt are both missing',
        'MISSING_IN_PROCESS_AT'
      );
    }

    const status = AMANA_PARCEL_INITIAL_STATUS;

    try {
      const tracking = await tx.amanaParcelTracking.create({
        data: {
          orderId: order.id,
          status,
          initialStatusAt: initialAt,
          lastStatusAt: initialAt,
          history: {
            create: {
              oldStatus: null,
              newStatus: status,
              changedAt: initialAt,
              changedByUserId: args.userId ?? null,
              note: null,
            },
          },
        },
        select: { id: true },
      });
      return {
        created: true,
        trackingId: tracking.id,
        initialAtSource,
      };
    } catch (error) {
      // Concurrent ensure: unique orderId race → treat as already exists
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const again = await tx.amanaParcelTracking.findUnique({
          where: { orderId: args.orderId },
          select: { id: true },
        });
        if (again) return { created: false, trackingId: again.id };
      }
      throw error;
    }
  }

  async ensureForOrder(
    orderId: number,
    userId?: number | null
  ): Promise<{
    created: boolean;
    trackingId: number;
    initialAtSource?: 'inProcessAt' | 'createdAt';
  } | null> {
    return this.prisma.$transaction((tx) =>
      this.ensureForOrderInTx(tx, { orderId, userId })
    );
  }

  /**
   * Backfill existing IN_PROCESS orders missing tracking (any delivery service).
   * Includes legacy rows with null inProcessAt (uses createdAt for initial timestamps).
   * Idempotent. Does not run automatically — call from authorized endpoint only.
   * Never mutates Order.inProcessAt / createdAt / status / stock.
   */
  async backfillMissingForActiveAmanaOrders(userId?: number | null): Promise<{
    scanned: number;
    created: number;
    skippedExisting: number;
    usedInProcessAt: number;
    usedCreatedAtFallback: number;
  }> {
    const orders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.IN_PROCESS,
        amanaParcelTracking: null,
      },
      select: { id: true, inProcessAt: true, createdAt: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    let created = 0;
    let skippedExisting = 0;
    let usedInProcessAt = 0;
    let usedCreatedAtFallback = 0;

    for (const order of orders) {
      const result = await this.ensureForOrder(order.id, userId);
      if (!result) continue;
      if (result.created) {
        created += 1;
        if (result.initialAtSource === 'createdAt') usedCreatedAtFallback += 1;
        else usedInProcessAt += 1;
      } else {
        skippedExisting += 1;
      }
    }

    return {
      scanned: orders.length,
      created,
      skippedExisting,
      usedInProcessAt,
      usedCreatedAtFallback,
    };
  }

  /** Active list window: orders created within the last 3 calendar months. */
  static createdAtSinceLast3Months(from: Date = new Date()): Date {
    const since = new Date(from);
    since.setMonth(since.getMonth() - 3);
    return since;
  }

  /**
   * Shared eligibility filters for list + status overview.
   * Includes access, IN_PROCESS, 3-month window, optional city/search.
   * Does NOT include Amana parcel status filter (overview must ignore it).
   */
  private buildActiveBaseWhere(
    accessWhere: Prisma.OrderWhereInput,
    args: { search?: string; city?: string; referenceAt?: Date }
  ): Prisma.OrderWhereInput {
    const createdSince = AmanaParcelTrackingService.createdAtSinceLast3Months(args.referenceAt);
    const and: Prisma.OrderWhereInput[] = [
      accessWhere,
      {
        status: OrderStatus.IN_PROCESS,
        createdAt: { gte: createdSince },
      },
    ];

    if (args.city && args.city !== 'all') {
      and.push({ city: args.city });
    }

    if (args.search?.trim()) {
      const searchStr = args.search.trim();
      const or: Prisma.OrderWhereInput[] = [
        { customerName: { contains: searchStr } },
        { phone: { contains: searchStr } },
        { trackingCode: { contains: searchStr } },
      ];
      if (!Number.isNaN(Number(searchStr))) {
        or.push({ id: Number(searchStr) });
      }
      and.push({ OR: or });
    }

    return { AND: and };
  }

  /**
   * Aggregate status counts over the full eligible set (all pages).
   * Ignores parcel-status filter; respects search/city/access/3-month/IN_PROCESS.
   */
  private async buildStatusSummary(baseWhere: Prisma.OrderWhereInput) {
    const [groups, uninitialized, totalActive] = await Promise.all([
      this.prisma.amanaParcelTracking.groupBy({
        by: ['status'],
        where: { order: baseWhere },
        _count: { _all: true },
      }),
      this.prisma.order.count({
        where: {
          AND: [
            baseWhere,
            { amanaParcelTracking: null },
          ],
        },
      }),
      this.prisma.order.count({ where: baseWhere }),
    ]);

    const countByStatus = new Map<AmanaParcelStatus, number>();
    for (const row of groups) {
      countByStatus.set(row.status, row._count._all);
    }

    const byStatus = AMANA_PARCEL_STATUSES.map((code) => ({
      code,
      label: AMANA_PARCEL_STATUS_LABELS[code],
      color: AMANA_PARCEL_STATUS_COLORS[code],
      count: countByStatus.get(code) ?? 0,
    }));

    const initialized = byStatus.reduce((sum, s) => sum + s.count, 0);

    return {
      totalActive,
      uninitialized,
      initialized,
      byStatus,
      /** True when totalActive === initialized + uninitialized */
      consistent: totalActive === initialized + uninitialized,
    };
  }

  private withParcelStatusFilter(
    baseWhere: Prisma.OrderWhereInput,
    status?: string
  ): Prisma.OrderWhereInput {
    const and: Prisma.OrderWhereInput[] = Array.isArray(baseWhere.AND)
      ? [...baseWhere.AND]
      : [baseWhere];

    if (status && status !== 'all') {
      if (status === 'UNINITIALIZED') {
        // Filter-only sentinel (not an AmanaParcelStatus) — orders with no tracking row.
        and.push({ amanaParcelTracking: null });
      } else if (isAmanaParcelStatus(status)) {
        and.push({ amanaParcelTracking: { status } });
      } else {
        throw new AmanaParcelTrackingError('Invalid Amana parcel status filter', 'INVALID_STATUS');
      }
    }

    return { AND: and };
  }

  static readonly EXPORT_MAX_ROWS = 10000;

  /**
   * Unpaginated rows for Excel export.
   * - With `orderIds`: exactly those orders, still limited to access + IN_PROCESS + 3-month
   *   eligibility (search/city/status are ignored — the user picked them explicitly).
   * - Without: same scope as `listActive` (search, city, parcel status), all pages.
   */
  async listForExport(args: {
    user: User;
    search?: string;
    status?: string;
    city?: string;
    orderIds?: number[];
  }) {
    const accessWhere = await this.buildAccessWhere(args.user);
    const max = AmanaParcelTrackingService.EXPORT_MAX_ROWS;

    let where: Prisma.OrderWhereInput;
    if (args.orderIds !== undefined) {
      const ids = [...new Set(args.orderIds)].filter((id) => Number.isInteger(id) && id > 0);
      if (ids.length === 0) {
        throw new AmanaParcelTrackingError('No valid order ids provided', 'INVALID_EXPORT_IDS');
      }
      if (ids.length > max) {
        throw new AmanaParcelTrackingError(
          `Export limited to ${max} orders`,
          'EXPORT_TOO_LARGE'
        );
      }
      const base = this.buildActiveBaseWhere(accessWhere, {});
      where = { AND: [base, { id: { in: ids } }] };
    } else {
      const base = this.buildActiveBaseWhere(accessWhere, {
        search: args.search,
        city: args.city,
      });
      where = this.withParcelStatusFilter(base, args.status);
    }

    const total = await this.prisma.order.count({ where });
    if (total > max) {
      throw new AmanaParcelTrackingError(
        `Export limited to ${max} orders (${total} matching) — narrow the filters`,
        'EXPORT_TOO_LARGE'
      );
    }

    const orders = await this.prisma.order.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        customerName: true,
        city: true,
        trackingCode: true,
        amanaParcelTracking: {
          select: {
            status: true,
            history: {
              orderBy: [{ changedAt: 'desc' }, { id: 'desc' }],
              take: 10,
              select: { newStatus: true, note: true },
            },
          },
        },
      },
    });

    return {
      total,
      data: orders.map((o) => {
        const tracking = o.amanaParcelTracking;
        // Note of the latest history entry that set the current status (null if that entry has none).
        const currentEntry = tracking?.history.find((h) => h.newStatus === tracking.status);
        return {
          id: o.id,
          customerName: o.customerName,
          city: o.city,
          trackingCode: o.trackingCode,
          amanaStatus: tracking ? amanaParcelStatusMeta(tracking.status) : null,
          currentStatusNote: currentEntry?.note?.trim() || null,
        };
      }),
    };
  }

  async listActive(args: {
    user: User;
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    city?: string;
  }) {
    const page = Math.max(1, args.page ?? 1);
    const limit = Math.min(200, Math.max(1, args.limit ?? 25));
    const skip = (page - 1) * limit;

    const accessWhere = await this.buildAccessWhere(args.user);
    const baseWhere = this.buildActiveBaseWhere(accessWhere, {
      search: args.search,
      city: args.city,
    });

    const where = this.withParcelStatusFilter(baseWhere, args.status);

    const [total, orders, summary] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          customerName: true,
          phone: true,
          city: true,
          address: true,
          trackingCode: true,
          createdAt: true,
          inProcessAt: true,
          status: true,
          deliveryService: { select: { id: true, name: true } },
          amanaParcelTracking: {
            select: {
              id: true,
              status: true,
              initialStatusAt: true,
              lastStatusAt: true,
            },
          },
        },
      }),
      this.buildStatusSummary(baseWhere),
    ]);

    return {
      data: orders.map((o) => ({
        id: o.id,
        customerName: o.customerName,
        phone: o.phone,
        city: o.city,
        address: o.address,
        trackingCode: o.trackingCode,
        createdAt: o.createdAt,
        inProcessAt: o.inProcessAt,
        orderStatus: o.status,
        deliveryService: o.deliveryService,
        amanaTracking: o.amanaParcelTracking
          ? {
              id: o.amanaParcelTracking.id,
              status: amanaParcelStatusMeta(o.amanaParcelTracking.status),
              initialStatusAt: o.amanaParcelTracking.initialStatusAt,
              lastStatusAt: o.amanaParcelTracking.lastStatusAt,
            }
          : null,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 0,
      },
      summary,
    };
  }

  /**
   * Manager alerts for initialized parcels with no tracking update for 24h+.
   * Scope: full eligible set (access + IN_PROCESS + 3-month window), not paginated and
   * independent of list filters. Read-only. Last update = latest history changedAt,
   * falling back to initialStatusAt; one entry per parcel at its highest severity.
   */
  async listAlerts(args: { user: User; referenceAt?: Date }) {
    const referenceAt = args.referenceAt ?? new Date();
    const accessWhere = await this.buildAccessWhere(args.user);
    const baseWhere = this.buildActiveBaseWhere(accessWhere, { referenceAt });

    const [orders, latestHistory] = await Promise.all([
      this.prisma.order.findMany({
        where: { AND: [baseWhere, { amanaParcelTracking: { isNot: null } }] },
        select: {
          id: true,
          customerName: true,
          city: true,
          trackingCode: true,
          amanaParcelTracking: {
            select: { id: true, status: true, initialStatusAt: true },
          },
        },
      }),
      this.prisma.amanaParcelTrackingHistory.groupBy({
        by: ['amanaParcelTrackingId'],
        where: { tracking: { order: baseWhere } },
        _max: { changedAt: true },
      }),
    ]);

    const latestByTracking = new Map<number, Date>();
    for (const row of latestHistory) {
      if (row._max.changedAt) latestByTracking.set(row.amanaParcelTrackingId, row._max.changedAt);
    }

    const counts: Record<AmanaParcelAlertSeverity, number> = { CRITICAL: 0, WARNING: 0, INFO: 0 };
    const alerts = [];
    for (const o of orders) {
      const tracking = o.amanaParcelTracking!;
      const lastUpdateAt = latestByTracking.get(tracking.id) ?? tracking.initialStatusAt;
      const severity = amanaParcelAlertSeverity(lastUpdateAt, referenceAt);
      if (!severity) continue;
      counts[severity] += 1;
      alerts.push({
        orderId: o.id,
        customerName: o.customerName,
        city: o.city,
        trackingCode: o.trackingCode,
        status: amanaParcelStatusMeta(tracking.status),
        lastUpdateAt,
        lastUpdateSource: latestByTracking.has(tracking.id)
          ? ('history' as const)
          : ('initialStatusAt' as const),
        elapsedMs: referenceAt.getTime() - lastUpdateAt.getTime(),
        severity,
        suggestedAction: amanaParcelAlertSuggestedAction(severity, tracking.status),
      });
    }

    alerts.sort((a, b) => b.elapsedMs - a.elapsedMs || a.orderId - b.orderId);

    return {
      referenceAt,
      counts: { ...counts, total: alerts.length },
      data: alerts,
    };
  }

  async getByOrderId(orderId: number, user: User) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        userId: true,
        deliveryServiceId: true,
        customerName: true,
        phone: true,
        city: true,
        address: true,
        trackingCode: true,
        createdAt: true,
        inProcessAt: true,
        status: true,
        deliveryService: { select: { id: true, name: true } },
        amanaParcelTracking: { include: trackingInclude },
      },
    });

    if (!order) {
      throw new AmanaParcelTrackingError('Order not found', 'NOT_FOUND');
    }

    const deliveryServiceIds =
      user.role === UserRole.LIVREUR || user.role === UserRole.SUIVI
        ? await getUserDeliveryServiceIds(user.id)
        : [];
    assertCanAccessOrder(user, order, deliveryServiceIds);

    return {
      id: order.id,
      customerName: order.customerName,
      phone: order.phone,
      city: order.city,
      address: order.address,
      trackingCode: order.trackingCode,
      createdAt: order.createdAt,
      inProcessAt: order.inProcessAt,
      orderStatus: order.status,
      deliveryService: order.deliveryService,
      amanaTracking: order.amanaParcelTracking
        ? mapTracking(order.amanaParcelTracking)
        : null,
    };
  }

  async updateStatus(
    orderId: number,
    user: User,
    rawStatus: unknown,
    rawNote?: unknown
  ): Promise<
    | { changed: false; reason: 'NO_CHANGE'; tracking: ReturnType<typeof mapTracking> }
    | { changed: true; tracking: ReturnType<typeof mapTracking> }
  > {
    assertCanMutateAmanaParcel(user);

    let nextStatus: AmanaParcelStatus;
    try {
      nextStatus = parseAmanaParcelStatus(rawStatus);
    } catch {
      throw new AmanaParcelTrackingError('Invalid Amana parcel status', 'INVALID_STATUS');
    }

    const note = normalizeNote(rawNote);

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        userId: true,
        deliveryServiceId: true,
        amanaParcelTracking: { select: { id: true, status: true } },
      },
    });

    if (!order) {
      throw new AmanaParcelTrackingError('Order not found', 'NOT_FOUND');
    }

    const deliveryServiceIds =
      user.role === UserRole.LIVREUR || user.role === UserRole.SUIVI
        ? await getUserDeliveryServiceIds(user.id)
        : [];
    assertCanAccessOrder(user, order, deliveryServiceIds);

    if (!order.amanaParcelTracking) {
      throw new AmanaParcelTrackingError(
        'Amana parcel tracking not initialized for this order',
        'NOT_FOUND'
      );
    }

    if (order.amanaParcelTracking.status === nextStatus) {
      const tracking = await this.prisma.amanaParcelTracking.findUnique({
        where: { id: order.amanaParcelTracking.id },
        include: trackingInclude,
      });
      return {
        changed: false,
        reason: 'NO_CHANGE',
        tracking: mapTracking(tracking!),
      };
    }

    const now = new Date();
    const trackingId = order.amanaParcelTracking.id;
    const oldStatus = order.amanaParcelTracking.status;

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.amanaParcelTrackingHistory.create({
        data: {
          amanaParcelTrackingId: trackingId,
          oldStatus,
          newStatus: nextStatus,
          changedAt: now,
          changedByUserId: user.id,
          note,
        },
      });

      return tx.amanaParcelTracking.update({
        where: { id: trackingId },
        data: {
          status: nextStatus,
          lastStatusAt: now,
        },
        include: trackingInclude,
      });
    });

    return { changed: true, tracking: mapTracking(updated) };
  }

  private async buildAccessWhere(user: User): Promise<Prisma.OrderWhereInput> {
    if (user.role === UserRole.ADMIN) return {};
    if (user.role === UserRole.SALES) return { userId: user.id };
    if (user.role === UserRole.LIVREUR || user.role === UserRole.SUIVI) {
      const ids = await getUserDeliveryServiceIds(user.id);
      if (user.role === UserRole.LIVREUR) {
        return { deliveryServiceId: { in: ids.length ? ids : [] } };
      }
      // SUIVI with no assignments sees all (matches buildOrderAccessWhere)
      if (ids.length === 0) return {};
      return { deliveryServiceId: { in: ids } };
    }
    return { userId: user.id };
  }
}
