import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth';
import {
  AmanaTrackingHproxyService,
  hproxyTrackingErrorToHttp,
} from '../services/AmanaTrackingHproxyService';

const router = express.Router();
const prisma = new PrismaClient();
const service = new AmanaTrackingHproxyService(prisma);

/**
 * GET /api/amana-tracking-hproxy/order/:orderId
 * Parallel test path: AMANA via HProxy premium gateway.
 * Query: refresh=1 to bypass cache
 */
router.get('/order/:orderId', authMiddleware, async (req, res) => {
  try {
    const orderId = Number(req.params.orderId);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ error: 'Invalid orderId', code: 'INVALID_ORDER_ID' });
    }

    const refresh =
      req.query.refresh === '1' ||
      req.query.refresh === 'true' ||
      req.query.refresh === 'yes';

    const data = await service.getForOrder(orderId, req.user!, { refresh });
    res.json({ success: true, data });
  } catch (error) {
    const mapped = hproxyTrackingErrorToHttp(error);
    if (mapped) return res.status(mapped.status).json(mapped.body);
    console.error('Error fetching AMANA tracking (HProxy):', error);
    res.status(500).json({
      error: 'Failed to retrieve tracking via HProxy',
      code: 'INTERNAL',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
