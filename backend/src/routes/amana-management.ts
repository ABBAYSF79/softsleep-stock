import express from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import { authMiddleware } from '../middleware/auth';
import {
  AmanaParcelTrackingError,
  AmanaParcelTrackingService,
  amanaParcelErrorToHttp,
} from '../services/AmanaParcelTrackingService';
import {
  AMANA_PARCEL_STATUSES,
  AMANA_PARCEL_STATUS_LABELS,
  AMANA_PARCEL_STATUS_COLORS,
} from '../utils/amanaParcelStatus';

const router = express.Router();
const prisma = new PrismaClient();
const service = new AmanaParcelTrackingService(prisma);

function firstQueryString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const v = Array.isArray(value) ? value[0] : value;
  const s = String(v).trim();
  return s.length ? s : undefined;
}

function parsePositiveInt(value: string | undefined): number | null {
  if (!value) return null;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Catalog for clients — exact approved statuses. */
router.get('/statuses', authMiddleware, (_req, res) => {
  res.json({
    statuses: AMANA_PARCEL_STATUSES.map((code) => ({
      code,
      label: AMANA_PARCEL_STATUS_LABELS[code],
      color: AMANA_PARCEL_STATUS_COLORS[code],
    })),
  });
});

/**
 * GET /api/amana-management
 * Active Amana + IN_PROCESS orders, sorted by inProcessAt ASC.
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const page = parsePositiveInt(firstQueryString(req.query.page)) ?? 1;
    const limit = parsePositiveInt(firstQueryString(req.query.limit)) ?? 25;
    const search = firstQueryString(req.query.search);
    const status = firstQueryString(req.query.status);
    const city = firstQueryString(req.query.city);

    const result = await service.listActive({
      user: req.user!,
      page,
      limit,
      search,
      status,
      city,
    });
    res.json(result);
  } catch (error) {
    const mapped = amanaParcelErrorToHttp(error);
    if (mapped) return res.status(mapped.status).json(mapped.body);
    console.error('Error listing Amana management orders:', error);
    res.status(500).json({ error: 'Failed to list Amana management orders' });
  }
});

/**
 * POST /api/amana-management/export
 * Body: { orderIds?: number[] } | { search?, city?, status? }
 * Unpaginated export rows (same eligibility as GET /).
 */
router.post('/export', authMiddleware, async (req, res) => {
  try {
    const body = req.body ?? {};
    let orderIds: number[] | undefined;
    if (body.orderIds !== undefined) {
      if (!Array.isArray(body.orderIds)) {
        return res
          .status(400)
          .json({ error: 'orderIds must be an array', code: 'INVALID_EXPORT_IDS' });
      }
      orderIds = body.orderIds.map((v: unknown) => Number(v));
    }

    const result = await service.listForExport({
      user: req.user!,
      orderIds,
      search: firstQueryString(body.search),
      status: firstQueryString(body.status),
      city: firstQueryString(body.city),
    });
    res.json(result);
  } catch (error) {
    const mapped = amanaParcelErrorToHttp(error);
    if (mapped) return res.status(mapped.status).json(mapped.body);
    console.error('Error exporting Amana management orders:', error);
    res.status(500).json({ error: 'Failed to export Amana management orders' });
  }
});

/**
 * GET /api/amana-management/alerts
 * Parcels with no tracking update for 24h+ (INFO / WARNING / CRITICAL) over the full
 * eligible set. Read-only; severity filtering is done client-side on this list.
 */
router.get('/alerts', authMiddleware, async (req, res) => {
  try {
    const result = await service.listAlerts({ user: req.user! });
    res.json(result);
  } catch (error) {
    const mapped = amanaParcelErrorToHttp(error);
    if (mapped) return res.status(mapped.status).json(mapped.body);
    console.error('Error listing Amana parcel alerts:', error);
    res.status(500).json({ error: 'Failed to list Amana parcel alerts' });
  }
});

/**
 * POST /api/amana-management/backfill
 * Admin-only idempotent backfill for existing Amana + IN_PROCESS orders.
 */
router.post('/backfill', authMiddleware, async (req, res) => {
  try {
    if (req.user!.role !== UserRole.ADMIN) {
      return res.status(403).json({ error: 'Admin access required', code: 'FORBIDDEN' });
    }

    const result = await service.backfillMissingForActiveAmanaOrders(req.user!.id);
    console.info('[amana-management] backfill completed', result);
    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    const mapped = amanaParcelErrorToHttp(error);
    if (mapped) return res.status(mapped.status).json(mapped.body);
    console.error('Error backfilling Amana parcel tracking:', error);
    res.status(500).json({ error: 'Failed to backfill Amana parcel tracking' });
  }
});

/**
 * GET /api/amana-management/:orderId
 * Order summary + tracking + history (works even when not IN_PROCESS).
 */
router.get('/:orderId', authMiddleware, async (req, res) => {
  try {
    const orderId = Number(req.params.orderId);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ error: 'Invalid orderId', code: 'INVALID_ORDER_ID' });
    }

    const data = await service.getByOrderId(orderId, req.user!);
    res.json({ success: true, data });
  } catch (error) {
    const mapped = amanaParcelErrorToHttp(error);
    if (mapped) return res.status(mapped.status).json(mapped.body);
    console.error('Error fetching Amana parcel tracking:', error);
    res.status(500).json({ error: 'Failed to fetch Amana parcel tracking' });
  }
});

/**
 * POST /api/amana-management/:orderId/initialize
 * Body: { status, note? } — ADMIN / SUIVI. Starts tracking for an uninitialized IN_PROCESS
 * order with the chosen status. Does not touch Order.status / stock.
 */
router.post('/:orderId/initialize', authMiddleware, async (req, res) => {
  try {
    const orderId = Number(req.params.orderId);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ error: 'Invalid orderId', code: 'INVALID_ORDER_ID' });
    }

    const tracking = await service.initializeWithStatus(
      orderId,
      req.user!,
      req.body?.status,
      req.body?.note
    );
    res.status(201).json({ success: true, data: tracking });
  } catch (error) {
    const mapped = amanaParcelErrorToHttp(error);
    if (mapped) return res.status(mapped.status).json(mapped.body);
    console.error('Error initializing Amana parcel tracking:', error);
    res.status(500).json({ error: 'Failed to initialize Amana parcel tracking' });
  }
});

/**
 * PATCH /api/amana-management/:orderId/status
 * Manual status update — ADMIN / SUIVI only. Does not touch Order.status / stock.
 */
router.patch('/:orderId/status', authMiddleware, async (req, res) => {
  try {
    const orderId = Number(req.params.orderId);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ error: 'Invalid orderId', code: 'INVALID_ORDER_ID' });
    }

    const result = await service.updateStatus(
      orderId,
      req.user!,
      req.body?.status,
      req.body?.note
    );

    if (!result.changed) {
      return res.status(200).json({
        success: true,
        changed: false,
        code: 'NO_CHANGE',
        message: 'Status unchanged — no history entry created',
        data: result.tracking,
      });
    }

    res.json({
      success: true,
      changed: true,
      data: result.tracking,
    });
  } catch (error) {
    const mapped = amanaParcelErrorToHttp(error);
    if (mapped) {
      // NO_CHANGE should not come through as error class path for update
      if (
        error instanceof AmanaParcelTrackingError &&
        error.code === 'NO_CHANGE'
      ) {
        return res.status(200).json(mapped.body);
      }
      return res.status(mapped.status).json(mapped.body);
    }
    console.error('Error updating Amana parcel status:', error);
    res.status(500).json({ error: 'Failed to update Amana parcel status' });
  }
});

export default router;
