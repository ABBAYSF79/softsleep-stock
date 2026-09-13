import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth';
import {
  AmanaTrackingDiService,
  diTrackingErrorToHttp,
} from '../services/AmanaTrackingDiService';

const router = express.Router();
const prisma = new PrismaClient();
const service = new AmanaTrackingDiService(prisma);

/**
 * GET /api/amana-tracking-di/order/:orderId
 * Parallel test path: AMANA via DataImpulse Morocco proxy.
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
    const mapped = diTrackingErrorToHttp(error);
    if (mapped) return res.status(mapped.status).json(mapped.body);
    console.error('Error fetching AMANA tracking (DataImpulse):', error);
    res.status(500).json({
      error: 'Failed to retrieve tracking via DataImpulse',
      code: 'INTERNAL',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
