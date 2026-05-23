import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, adminOnly } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

const getAdminCode = (req: express.Request) => {
  const headerCode = req.header('x-admin-code');
  if (headerCode) return String(headerCode).trim();
  const queryCode = (req.query?.code as string | undefined) ?? (req.query?.password as string | undefined);
  if (queryCode) return String(queryCode).trim();
  const bodyCode = req.body?.password ?? req.body?.code;
  if (bodyCode) return String(bodyCode).trim();
  return '';
};

const requireAdminCode = (req: express.Request, res: express.Response) => {
  const staticPassword = 'admin123456';
  const code = getAdminCode(req);
  if (!code || code !== staticPassword) {
    res.status(401).json({ error: 'Invalid code' });
    return false;
  }
  return true;
};

router.get('/', authMiddleware, async (_req, res) => {
  try {
    const pillows = await prisma.pillow.findMany({
      include: {
        histories: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(
      pillows.map((pillow) => ({
        id: pillow.id,
        name: pillow.name,
        price: pillow.price,
        stock: pillow.stock,
        createdAt: pillow.createdAt,
        updatedAt: pillow.updatedAt,
        lastUpdate: pillow.histories[0]?.createdAt ?? null,
      }))
    );
  } catch (error) {
    console.error('Error fetching pillow stock:', error);
    res.status(500).json({ error: 'Failed to fetch pillow stock' });
  }
});

router.get('/history', authMiddleware, adminOnly, async (req, res) => {
  try {
    if (!requireAdminCode(req, res)) return;
    const pillowIdRaw = req.query.pillowId as string | undefined;
    const pillowId = pillowIdRaw ? Number(pillowIdRaw) : undefined;

    if (pillowIdRaw && Number.isNaN(pillowId)) {
      return res.status(400).json({ error: 'Invalid pillowId' });
    }

    const history = await prisma.pillowStockHistory.findMany({
      where: pillowId ? { pillowId } : undefined,
      include: {
        pillow: true,
        user: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    res.json(history);
  } catch (error) {
    console.error('Error fetching pillow stock history:', error);
    res.status(500).json({ error: 'Failed to fetch pillow stock history' });
  }
});

router.post('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    if (!requireAdminCode(req, res)) return;
    const name = String(req.body?.name ?? '').trim();
    const priceRaw = req.body?.price;
    const stockRaw = req.body?.stock;

    const price = Number(priceRaw);
    const stock = Number(stockRaw);

    if (!name) return res.status(400).json({ error: 'Name is required' });
    if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: 'Invalid price' });
    if (!Number.isInteger(stock) || stock < 0) return res.status(400).json({ error: 'Invalid stock' });

    const result = await prisma.$transaction(async (tx) => {
      const pillow = await tx.pillow.create({
        data: {
          name,
          price,
          stock,
        },
      });

      await tx.pillowStockHistory.create({
        data: {
          pillowId: pillow.id,
          quantity: stock,
          type: 'INITIAL',
          reason: 'Initial stock',
          previousStock: 0,
          newStock: stock,
          userId: req.user.id,
        },
      });

      await tx.activity.create({
        data: {
          userId: req.user.id,
          type: 'PILLOW_CREATED',
          description: `Created pillow "${name}" with initial stock ${stock}`,
        },
      });

      return pillow;
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Error creating pillow:', error);
    res.status(500).json({ error: 'Failed to create pillow' });
  }
});

router.post('/:id/supply', authMiddleware, adminOnly, async (req, res) => {
  try {
    if (!requireAdminCode(req, res)) return;
    const id = Number(req.params.id);
    const quantity = Number(req.body?.quantity);
    const reason = String(req.body?.reason ?? '').trim();

    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
    if (!Number.isInteger(quantity) || quantity <= 0) return res.status(400).json({ error: 'Invalid quantity' });
    if (!reason) return res.status(400).json({ error: 'Reason is required' });

    const result = await prisma.$transaction(async (tx) => {
      const pillow = await tx.pillow.findUnique({ where: { id } });
      if (!pillow) throw new Error('Pillow not found');

      const previousStock = pillow.stock;
      const newStock = previousStock + quantity;

      const updated = await tx.pillow.update({
        where: { id },
        data: { stock: newStock },
      });

      await tx.pillowStockHistory.create({
        data: {
          pillowId: id,
          quantity,
          type: 'SUPPLY',
          reason,
          previousStock,
          newStock,
          userId: req.user.id,
        },
      });

      await tx.activity.create({
        data: {
          userId: req.user.id,
          type: 'PILLOW_SUPPLY',
          description: `Added ${quantity} to pillow "${pillow.name}"`,
          details: reason,
        },
      });

      return updated;
    });

    res.json(result);
  } catch (error: any) {
    if (error instanceof Error && error.message === 'Pillow not found') {
      return res.status(404).json({ error: 'Pillow not found' });
    }
    console.error('Error adding pillow supply:', error);
    res.status(500).json({ error: 'Failed to add pillow supply' });
  }
});

router.post('/:id/outgoing', authMiddleware, adminOnly, async (req, res) => {
  try {
    if (!requireAdminCode(req, res)) return;
    const id = Number(req.params.id);
    const quantity = Number(req.body?.quantity);
    const reason = String(req.body?.reason ?? '').trim();

    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
    if (!Number.isInteger(quantity) || quantity <= 0) return res.status(400).json({ error: 'Invalid quantity' });
    if (!reason) return res.status(400).json({ error: 'Reason is required' });

    const result = await prisma.$transaction(async (tx) => {
      const pillow = await tx.pillow.findUnique({ where: { id } });
      if (!pillow) throw new Error('Pillow not found');

      const previousStock = pillow.stock;
      const newStock = previousStock - quantity;
      if (newStock < 0) throw new Error('Insufficient stock');

      const updated = await tx.pillow.update({
        where: { id },
        data: { stock: newStock },
      });

      await tx.pillowStockHistory.create({
        data: {
          pillowId: id,
          quantity: -quantity,
          type: 'OUTGOING',
          reason,
          previousStock,
          newStock,
          userId: req.user.id,
        },
      });

      await tx.activity.create({
        data: {
          userId: req.user.id,
          type: 'PILLOW_OUTGOING',
          description: `Removed ${quantity} from pillow "${pillow.name}"`,
          details: reason,
        },
      });

      return updated;
    });

    res.json(result);
  } catch (error: any) {
    if (error instanceof Error && error.message === 'Pillow not found') {
      return res.status(404).json({ error: 'Pillow not found' });
    }
    if (error instanceof Error && error.message === 'Insufficient stock') {
      return res.status(400).json({ error: 'Insufficient stock' });
    }
    console.error('Error creating pillow outgoing:', error);
    res.status(500).json({ error: 'Failed to create outgoing operation' });
  }
});

export default router;
