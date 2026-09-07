import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, adminOnly } from '../middleware/auth';
import {
  orderLocationErrorToHttp,
  orderLocationSelect,
  resolveOptionalSellableLocationId,
} from '../utils/order-location';
import { getInventoryMode } from '../services/InventoryMode';
import { OrderAccessoryInventory } from '../services/OrderAccessoryInventory';
import { reservationErrorToHttp, ReservationDomainError } from '../services/ReservationService';
import { cutoverErrorToHttp, CutoverFreezeService } from '../services/CutoverFreezeService';
import { LegacyOrderTransitionService } from '../services/LegacyOrderTransitionService';

const router = express.Router();
const prisma = new PrismaClient();
const orderAccessoryInventory = new OrderAccessoryInventory(prisma);
const cutoverFreeze = new CutoverFreezeService(prisma);
const legacyTransitions = new LegacyOrderTransitionService(prisma);

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
        location: { select: orderLocationSelect },
        items: {
          include: {
            pillow: true,
          },
        },
      },
      // Show the newest accessory order number first.
      orderBy: { id: 'desc' },
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
        locationId: o.locationId,
        location: o.location,
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
    const customerName = String(req.body?.customerName ?? '').trim() || 'Client';
    const phone = String(req.body?.phone ?? '').trim();
    const address = String(req.body?.address ?? '').trim();
    const city = String(req.body?.city ?? '').trim();
    const deliveryServiceIdRaw = req.body?.deliveryServiceId;
    const hasDeliveryService = (
      deliveryServiceIdRaw !== undefined &&
      deliveryServiceIdRaw !== null &&
      String(deliveryServiceIdRaw).trim() !== ''
    );
    const deliveryServiceId = hasDeliveryService ? Number(deliveryServiceIdRaw) : null;
    const itemsRaw = Array.isArray(req.body?.items) ? req.body.items : [];
    const totalAmountRaw = req.body?.totalAmount;
    const locationIdRaw = req.body?.locationId;

    if (
      deliveryServiceId !== null &&
      (!Number.isInteger(deliveryServiceId) || deliveryServiceId <= 0)
    ) {
      return res.status(400).json({ error: 'Invalid delivery service' });
    }
    if (itemsRaw.length === 0) return res.status(400).json({ error: 'At least 1 pillow item is required' });

    let resolvedLocationId: number | null = null;
    try {
      resolvedLocationId = await resolveOptionalSellableLocationId(prisma, locationIdRaw);
    } catch (error) {
      const mapped = orderLocationErrorToHttp(error);
      if (mapped) return res.status(mapped.status).json(mapped.body);
      throw error;
    }

    const inventoryMode = await getInventoryMode(prisma);
    if (inventoryMode === 'INVENTORY') {
      if (!resolvedLocationId) {
        return res.status(400).json({
          error: 'A sellable fulfillment location is required when inventory mode is active',
          code: 'INVENTORY_LOCATION_REQUIRED',
        });
      }
    }

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

      // LEGACY: validate against Pillow.stock. INVENTORY: ReservationService validates available.
      if (inventoryMode === 'LEGACY') {
        for (const [pillowId, qty] of consolidated.entries()) {
          const pillow = pillowById.get(pillowId)!;
          if (pillow.stock - qty < 0) throw new Error('Insufficient stock');
        }
      }

      const total = Array.from(consolidated.entries()).reduce((sum, [pillowId, qty]) => {
        const pillow = pillowById.get(pillowId)!;
        return sum + Number(pillow.price) * qty;
      }, 0);

      let finalTotal = total;
      const canOverrideTotal = req.user.role === 'ADMIN' || req.user.role === 'SALES';
      if (totalAmountRaw !== undefined && totalAmountRaw !== null && String(totalAmountRaw).trim() !== '') {
        if (!canOverrideTotal) throw new Error('Forbidden total override');
        const parsed = Number(totalAmountRaw);
        if (!Number.isFinite(parsed) || parsed < 0) throw new Error('Invalid totalAmount');
        finalTotal = parsed;
      }

      const created = await tx.pillowOrder.create({
        data: {
          userId: req.user.id,
          customerName,
          phone: phone || null,
          address,
          city: city || null,
          deliveryServiceId,
          locationId: resolvedLocationId,
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
          location: { select: orderLocationSelect },
          items: { include: { pillow: true } },
        },
      });

      if (inventoryMode === 'LEGACY') {
        await cutoverFreeze.assertNotFrozen(tx, 'legacy pillow-order create');
        for (const [pillowId, qty] of consolidated.entries()) {
          const locked = await tx.$queryRaw<Array<{ id: number; stock: number }>>`
            SELECT id, stock FROM Pillow WHERE id = ${pillowId} FOR UPDATE
          `;
          const pillow = locked[0];
          if (!pillow) throw new Error('Pillow not found');
          const previousStock = pillow.stock;
          const newStock = previousStock - qty;
          if (newStock < 0) throw new Error('Insufficient stock');

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
      } else {
        await orderAccessoryInventory.reservePillowOrderInTx(tx, {
          pillowOrderId: created.id,
          locationId: resolvedLocationId,
          lines: Array.from(consolidated.entries()).map(([pillowId, quantity]) => ({
            pillowId,
            quantity,
          })),
          userId: req.user.id,
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
    const locErr = orderLocationErrorToHttp(error);
    if (locErr) return res.status(locErr.status).json(locErr.body);
    if (error instanceof ReservationDomainError) {
      const mapped = reservationErrorToHttp(error);
      return res.status(mapped.status).json(mapped.body);
    }
    const cutover = cutoverErrorToHttp(error);
    if (cutover) return res.status(cutover.status).json(cutover.body);
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

      const inventoryMode = await getInventoryMode(tx);

      if (inventoryMode === 'INVENTORY') {
        await orderAccessoryInventory.onStatusChangeInTx(tx, {
          source: 'PILLOW_ORDER',
          orderId: id,
          oldStatus: existing.status,
          newStatus: status,
          userId: req.user.id,
          hasAccessoryLines: (existing.items || []).length > 0,
        });
      } else if (existing.status !== 'RETURNED' && status === 'RETURNED') {
        await cutoverFreeze.assertNotFrozen(tx, 'legacy pillow-order return');
        const gate = await legacyTransitions.gateInventoryAffectingChange(
          'PILLOW_ORDER',
          id,
          (existing.items || []).length > 0
        );
        if (gate !== 'SKIP_INVENTORY') {
          for (const item of existing.items) {
            const locked = await tx.$queryRaw<Array<{ id: number; stock: number }>>`
              SELECT id, stock FROM Pillow WHERE id = ${item.pillowId} FOR UPDATE
            `;
            const pillow = locked[0];
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
      }

      const updated = await tx.pillowOrder.update({
        where: { id },
        data: { status: status as any },
        include: {
          user: true,
          deliveryService: true,
          location: { select: orderLocationSelect },
          items: { include: { pillow: true } },
        },
      });

      return { existing, updated };
    });

    res.json(result.updated);
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
    if (error instanceof ReservationDomainError) {
      const mapped = reservationErrorToHttp(error);
      return res.status(mapped.status).json(mapped.body);
    }
    const cutover = cutoverErrorToHttp(error);
    if (cutover) return res.status(cutover.status).json(cutover.body);
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
