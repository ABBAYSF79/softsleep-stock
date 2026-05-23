import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, adminOnly } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

router.get('/', authMiddleware, async (req, res) => {
  try {
    const where = req.user?.role === 'ADMIN' ? {} : { userId: req.user.id };

    const { page, limit, status, search, deliveryServiceId } = req.query;

    if (status) {
      (where as any).status = status.toString().toUpperCase();
    }

    if (deliveryServiceId && !Number.isNaN(Number(deliveryServiceId))) {
      (where as any).deliveryServiceId = Number(deliveryServiceId);
    }

    if (search) {
      const searchStr = search.toString();
      (where as any).OR = [
        { customerName: { contains: searchStr } },
        { phone: { contains: searchStr } },
        { city: { contains: searchStr } },
        ...(Number.isNaN(Number(searchStr)) ? [] : [{ id: Number(searchStr) }]),
      ];
    }

    const pageNum = page ? parseInt(page.toString()) : 1;
    const limitNum = limit ? parseInt(limit.toString()) : 200;
    const safeLimit = Number.isFinite(limitNum) && limitNum > 0 ? Math.min(limitNum, 500) : 200;
    const skip = (pageNum - 1) * safeLimit;

    const total = await prisma.pillowOrder.count({ where });

    const orders = await prisma.pillowOrder.findMany({
      where,
      skip: page ? skip : 0,
      take: safeLimit,
      include: {
        user: true,
        deliveryService: true,
        items: {
          include: {
            pillow: true,
          },
        },
      },
      orderBy: { id: 'asc' },
    });

    const formatted = orders.map((o) => ({
        id: o.id,
        user: { id: o.user.id, name: o.user.name },
        customerName: o.customerName,
        phone: o.phone,
        address: o.address,
        city: o.city,
        deliveryServiceId: o.deliveryServiceId,
        deliveryService: o.deliveryService ? { id: o.deliveryService.id, name: o.deliveryService.name } : null,
        status: o.status,
        totalAmount: o.totalAmount,
      isPaid: o.isPaid,
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
        items: o.items.map((i) => ({
          id: i.id,
          pillowId: i.pillowId,
          pillowName: i.pillow.name,
          quantity: i.quantity,
          price: i.price,
        })),
      }));

    if (page) {
      return res.json({
        data: formatted,
        meta: {
          total,
          page: pageNum,
          limit: safeLimit,
          totalPages: Math.ceil(total / safeLimit),
        },
      });
    }

    res.json(formatted);
  } catch (error) {
    console.error('Error fetching pillow orders:', error);
    res.status(500).json({ error: 'Failed to fetch pillow orders' });
  }
});

router.get('/pillow-stock-link', authMiddleware, adminOnly, async (req, res) => {
  const code = String(req.query?.code ?? '').trim();
  const staticPassword = 'admin123456';
  if (!code || code !== staticPassword) {
    return res.status(401).json({ error: 'Invalid code' });
  }
  res.json({ url: '/pillow-stock' });
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const customerName = String(req.body?.customerName ?? '').trim();
    const phone = String(req.body?.phone ?? '').trim();
    const address = String(req.body?.address ?? '').trim();
    const city = String(req.body?.city ?? '').trim();
    const deliveryServiceIdRaw = req.body?.deliveryServiceId;
    const deliveryServiceId = deliveryServiceIdRaw ? Number(deliveryServiceIdRaw) : undefined;
    const itemsRaw = Array.isArray(req.body?.items) ? req.body.items : [];
    const totalAmountRaw = req.body?.totalAmount;

    if (!customerName) return res.status(400).json({ error: 'Customer name is required' });
    if (!phone) return res.status(400).json({ error: 'Phone is required' });
    if (!address) return res.status(400).json({ error: 'Address is required' });
    if (!city) return res.status(400).json({ error: 'City is required' });
    if (!deliveryServiceId || Number.isNaN(deliveryServiceId)) {
      return res.status(400).json({ error: 'Delivery service is required' });
    }
    if (itemsRaw.length === 0) return res.status(400).json({ error: 'At least 1 pillow item is required' });

    const consolidated = new Map<number, number>();
    for (const row of itemsRaw) {
      const pillowId = Number(row?.pillowId);
      const quantity = Number(row?.quantity);
      if (!Number.isInteger(pillowId) || pillowId <= 0) return res.status(400).json({ error: 'Invalid pillowId' });
      if (!Number.isInteger(quantity) || quantity <= 0) return res.status(400).json({ error: 'Invalid quantity' });
      consolidated.set(pillowId, (consolidated.get(pillowId) || 0) + quantity);
    }

    const result = await prisma.$transaction(async (tx) => {
      const pillowIds = Array.from(consolidated.keys());
      const pillows = await tx.pillow.findMany({ where: { id: { in: pillowIds } } });
      if (pillows.length !== pillowIds.length) throw new Error('Pillow not found');

      const pillowById = new Map(pillows.map((p) => [p.id, p]));

      for (const [pillowId, qty] of consolidated.entries()) {
        const pillow = pillowById.get(pillowId)!;
        if (pillow.stock - qty < 0) throw new Error('Insufficient stock');
      }

      const total = Array.from(consolidated.entries()).reduce((sum, [pillowId, qty]) => {
        const pillow = pillowById.get(pillowId)!;
        return sum + Number(pillow.price) * qty;
      }, 0);

      let finalTotal = total;
      if (totalAmountRaw !== undefined && totalAmountRaw !== null && String(totalAmountRaw).trim() !== '') {
        if (req.user.role !== 'ADMIN') throw new Error('Forbidden total override');
        const parsed = Number(totalAmountRaw);
        if (!Number.isFinite(parsed) || parsed < 0) throw new Error('Invalid totalAmount');
        finalTotal = parsed;
      }

      const created = await tx.pillowOrder.create({
        data: {
          userId: req.user.id,
          customerName,
          phone,
          address,
          city,
          deliveryServiceId,
          totalAmount: finalTotal,
          items: {
            create: Array.from(consolidated.entries()).map(([pillowId, qty]) => {
              const pillow = pillowById.get(pillowId)!;
              return { pillowId, quantity: qty, price: pillow.price };
            }),
          },
        },
        include: {
          user: true,
          deliveryService: true,
          items: { include: { pillow: true } },
        },
      });

      for (const [pillowId, qty] of consolidated.entries()) {
        const pillow = pillowById.get(pillowId)!;
        const previousStock = pillow.stock;
        const newStock = previousStock - qty;

        await tx.pillow.update({
          where: { id: pillowId },
          data: { stock: newStock },
        });

        await tx.pillowStockHistory.create({
          data: {
            pillowId,
            quantity: -qty,
            type: 'OUTGOING',
            reason: `Pillow order #${created.id}`,
            previousStock,
            newStock,
            userId: req.user.id,
          },
        });
      }

      await tx.activity.create({
        data: {
          userId: req.user.id,
          type: 'PILLOW_ORDER_CREATED',
          description: `Created pillow order #${created.id}`,
        },
      });

      return created;
    });

    res.status(201).json(result);
  } catch (error: any) {
    if (error instanceof Error && error.message === 'Pillow not found') {
      return res.status(404).json({ error: 'Pillow not found' });
    }
    if (error instanceof Error && error.message === 'Insufficient stock') {
      return res.status(400).json({ error: 'Insufficient stock' });
    }
    if (error instanceof Error && error.message === 'Invalid totalAmount') {
      return res.status(400).json({ error: 'Invalid total amount' });
    }
    if (error instanceof Error && error.message === 'Forbidden total override') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    console.error('Error creating pillow order:', error);
    res.status(500).json({ error: 'Failed to create pillow order' });
  }
});

router.patch('/:id/status', authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const status = String(req.body?.status ?? '').trim();
    const allowed = new Set(['PENDING', 'IN_PROCESS', 'DELIVERED', 'RETURNED']);

    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
    if (!allowed.has(status)) return res.status(400).json({ error: 'Invalid status' });

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.pillowOrder.findUnique({
        where: { id },
        include: { items: true },
      });
      if (!existing) throw new Error('Not found');

      if (req.user.role !== 'ADMIN' && existing.userId !== req.user.id) {
        throw new Error('Forbidden');
      }

      if (existing.status === 'RETURNED' && status !== 'RETURNED') {
        throw new Error('Locked');
      }

      const updated = await tx.pillowOrder.update({
        where: { id },
        data: { status: status as any },
        include: {
          user: true,
          deliveryService: true,
          items: { include: { pillow: true } },
        },
      });

      if (existing.status !== 'RETURNED' && status === 'RETURNED') {
        for (const item of existing.items) {
          const pillow = await tx.pillow.findUnique({ where: { id: item.pillowId } });
          if (!pillow) continue;

          const previousStock = pillow.stock;
          const newStock = previousStock + item.quantity;

          await tx.pillow.update({
            where: { id: item.pillowId },
            data: { stock: newStock },
          });

          await tx.pillowStockHistory.create({
            data: {
              pillowId: item.pillowId,
              quantity: item.quantity,
              type: 'ADJUSTMENT',
              reason: `Return pillow order #${id}`,
              previousStock,
              newStock,
              userId: req.user.id,
            },
          });
        }

        await tx.activity.create({
          data: {
            userId: req.user.id,
            type: 'PILLOW_ORDER_RETURNED',
            description: `Returned pillow order #${id}`,
          },
        });
      }

      return updated;
    });

    res.json(result);
  } catch (error: any) {
    if (error instanceof Error && error.message === 'Not found') {
      return res.status(404).json({ error: 'Order not found' });
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (error instanceof Error && error.message === 'Locked') {
      return res.status(400).json({ error: 'Returned orders cannot be reopened' });
    }
    console.error('Error updating pillow order status:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

router.patch('/:id/payment', authMiddleware, adminOnly, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const isPaid = Boolean(req.body?.isPaid);

    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

    const order = await prisma.pillowOrder.update({
      where: { id },
      data: { isPaid },
    });

    await prisma.activity.create({
      data: {
        userId: req.user.id,
        type: 'PILLOW_ORDER_PAYMENT_UPDATE',
        description: `Payment status updated for pillow order #${order.id} to ${isPaid ? 'Paid' : 'Not Paid'}`,
        details: JSON.stringify({ orderId: order.id, isPaid }),
      },
    });

    res.json(order);
  } catch (error) {
    console.error('Error updating pillow order payment status:', error);
    res.status(400).json({ error: 'Failed to update payment status' });
  }
});

export default router;
