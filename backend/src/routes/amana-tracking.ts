import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth';
import {
  AmanaTrackingService,
  amanaTrackingErrorToHttp,
} from '../services/AmanaTrackingService';

const router = express.Router();
const prisma = new PrismaClient();
const service = new AmanaTrackingService(prisma);

/**
 * GET /api/amana-tracking/order/:orderId
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
    const mapped = amanaTrackingErrorToHttp(error);
    if (mapped) return res.status(mapped.status).json(mapped.body);
    console.error('Error fetching AMANA tracking:', error);
    res.status(500).json({
      error: 'Failed to retrieve tracking',
      code: 'INTERNAL',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
