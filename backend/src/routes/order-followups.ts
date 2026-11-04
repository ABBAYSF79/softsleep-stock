import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth';
import {
  followUpErrorToHttp,
  OrderFollowUpService,
} from '../services/OrderFollowUpService';

const router = express.Router();
const prisma = new PrismaClient();
const service = new OrderFollowUpService(prisma);

function mapRow(row: {
  id: number;
  content: string;
  createdAt: Date;
  orderId: number | null;
  pillowOrderId: number | null;
  userId: number | null;
  user: { id: number; name: string; role: string } | null;
}) {
  return {
    id: row.id,
    content: row.content,
    createdAt: row.createdAt,
    orderId: row.orderId,
    pillowOrderId: row.pillowOrderId,
    userId: row.userId,
    userName: row.user?.name ?? 'Utilisateur supprimé',
    userRole: row.user?.role ?? null,
  };
}

/**
 * GET /api/order-followups/order/:orderId
 */
router.get('/order/:orderId', authMiddleware, async (req, res) => {
  try {
    const orderId = Number(req.params.orderId);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ error: 'Invalid orderId' });
    }
    const rows = await service.listForOrder(orderId, req.user!);
    res.json({ orderId, items: rows.map(mapRow) });
  } catch (error) {
    const mapped = followUpErrorToHttp(error);
    if (mapped) return res.status(mapped.status).json(mapped.body);
    console.error('Error listing order follow-ups:', error);
    res.status(500).json({ error: 'Failed to list follow-ups' });
  }
});

/**
 * POST /api/order-followups/order/:orderId
 * Body: { content: string }
 */
router.post('/order/:orderId', authMiddleware, async (req, res) => {
  try {
    const orderId = Number(req.params.orderId);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ error: 'Invalid orderId' });
    }
    const created = await service.createForOrder(orderId, req.user!, req.body?.content);
    res.status(201).json(mapRow(created));
  } catch (error) {
    const mapped = followUpErrorToHttp(error);
    if (mapped) return res.status(mapped.status).json(mapped.body);
    console.error('Error creating order follow-up:', error);
    res.status(500).json({ error: 'Failed to create follow-up' });
  }
});

export default router;
