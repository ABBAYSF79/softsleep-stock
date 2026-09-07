import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, adminOnly } from '../middleware/auth';
import {
  AccessoryStockWriter,
  accessoryWriterErrorToHttp,
} from '../services/AccessoryStockWriter';
import { getInventoryMode } from '../services/InventoryMode';

const router = express.Router();
const prisma = new PrismaClient();
const accessoryStock = new AccessoryStockWriter(prisma);

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

router.get('/analytics', authMiddleware, adminOnly, async (req, res) => {
  try {
    const pillowIdRaw = req.query.pillowId as string | undefined;
    const pillowId = pillowIdRaw ? Number(pillowIdRaw) : undefined;
    if (pillowIdRaw && Number.isNaN(pillowId)) {
      return res.status(400).json({ error: 'Invalid pillowId' });
    }

    const fromRaw = req.query.from as string | undefined;
    const toRaw = req.query.to as string | undefined;
    const from = fromRaw ? new Date(fromRaw) : undefined;
    const to = toRaw ? new Date(toRaw) : undefined;
    if (fromRaw && Number.isNaN(from?.getTime())) return res.status(400).json({ error: 'Invalid from date' });
    if (toRaw && Number.isNaN(to?.getTime())) return res.status(400).json({ error: 'Invalid to date' });

    const rangeFrom = from ? new Date(from) : new Date(Date.now() - 1000 * 60 * 60 * 24 * 30 * 6);
    rangeFrom.setHours(0, 0, 0, 0);
    const rangeTo = to ? new Date(to) : new Date();
    rangeTo.setHours(23, 59, 59, 999);

    const pillows = await prisma.pillow.findMany({
      where: pillowId ? { id: pillowId } : undefined,
      select: { id: true, name: true, stock: true, price: true },
      orderBy: { createdAt: 'desc' },
    });

    const pillowIds = pillows.map((p) => p.id);
    if (pillowId && pillowIds.length === 0) return res.status(404).json({ error: 'Pillow not found' });

    const [initialRows, beforeRows, upToRows, rangeRows] = await prisma.$transaction([
      prisma.pillowStockHistory.findMany({
        where: pillowIds.length ? { pillowId: { in: pillowIds } } : { pillowId: -1 },
        orderBy: { createdAt: 'asc' },
        distinct: ['pillowId'],
        select: { pillowId: true, newStock: true },
      }),
      prisma.pillowStockHistory.findMany({
        where: pillowIds.length
          ? { pillowId: { in: pillowIds }, createdAt: { lt: rangeFrom } }
          : { pillowId: -1 },
        orderBy: { createdAt: 'desc' },
        distinct: ['pillowId'],
        select: { pillowId: true, newStock: true },
      }),
      prisma.pillowStockHistory.findMany({
        where: pillowIds.length
          ? { pillowId: { in: pillowIds }, createdAt: { lte: rangeTo } }
          : { pillowId: -1 },
        orderBy: { createdAt: 'desc' },
        distinct: ['pillowId'],
        select: { pillowId: true, newStock: true },
      }),
      prisma.pillowStockHistory.findMany({
        where: pillowIds.length
          ? { pillowId: { in: pillowIds }, createdAt: { gte: rangeFrom, lte: rangeTo } }
          : { pillowId: -1 },
        select: { pillowId: true, quantity: true, type: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
        take: 20000,
      }),
    ]);

    const initialByPillow = new Map<number, number>();
    for (const r of initialRows) initialByPillow.set(r.pillowId, r.newStock);
    const beforeByPillow = new Map<number, number>();
    for (const r of beforeRows) beforeByPillow.set(r.pillowId, r.newStock);
    const upToByPillow = new Map<number, number>();
    for (const r of upToRows) upToByPillow.set(r.pillowId, r.newStock);

    const perPillow = pillows.map((p) => {
      const initialStock = initialByPillow.get(p.id) ?? 0;
      const openingStock = beforeByPillow.get(p.id) ?? initialStock;
      const closingStock = upToByPillow.get(p.id) ?? openingStock;
      return {
        pillowId: p.id,
        name: p.name,
        price: p.price,
        initialStock,
        openingStock,
        closingStock,
        currentStock: p.stock,
        supplyQty: 0,
        outgoingQty: 0,
        adjustmentNet: 0,
        initialQty: 0,
        netQty: 0,
        operations: 0,
      };
    });

    const perPillowIndex = new Map<number, number>();
    perPillow.forEach((p, idx) => perPillowIndex.set(p.pillowId, idx));

    const monthMap = new Map<
      string,
      { month: string; supplyQty: number; outgoingQty: number; adjustmentNet: number; initialQty: number; netQty: number; operations: number }
    >();
    const monthKey = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      return `${y}-${m}`;
    };

    for (const r of rangeRows) {
      const key = monthKey(r.createdAt);
      const quantity = Number(r.quantity || 0);
      const row = monthMap.get(key) ?? {
        month: key,
        supplyQty: 0,
        outgoingQty: 0,
        adjustmentNet: 0,
        initialQty: 0,
        netQty: 0,
        operations: 0,
      };
      row.operations += 1;
      row.netQty += quantity;
      if (r.type === 'SUPPLY') row.supplyQty += Math.max(0, quantity);
      else if (r.type === 'OUTGOING') row.outgoingQty += Math.abs(quantity);
      else if (r.type === 'ADJUSTMENT') row.adjustmentNet += quantity;
      else if (r.type === 'INITIAL') row.initialQty += Math.max(0, quantity);
      monthMap.set(key, row);

      const idx = perPillowIndex.get(r.pillowId);
      if (idx !== undefined) {
        perPillow[idx].operations += 1;
        perPillow[idx].netQty += quantity;
        if (r.type === 'SUPPLY') perPillow[idx].supplyQty += Math.max(0, quantity);
        else if (r.type === 'OUTGOING') perPillow[idx].outgoingQty += Math.abs(quantity);
        else if (r.type === 'ADJUSTMENT') perPillow[idx].adjustmentNet += quantity;
        else if (r.type === 'INITIAL') perPillow[idx].initialQty += Math.max(0, quantity);
      }
    }

    const monthly = Array.from(monthMap.values()).sort((a, b) => a.month.localeCompare(b.month));
    const summary = perPillow.reduce(
      (acc, p) => {
        acc.openingStock += p.openingStock;
        acc.closingStock += p.closingStock;
        acc.currentStock += p.currentStock;
        acc.supplyQty += p.supplyQty;
        acc.outgoingQty += p.outgoingQty;
        acc.adjustmentNet += p.adjustmentNet;
        acc.initialQty += p.initialQty;
        acc.netQty += p.netQty;
        acc.operations += p.operations;
        return acc;
      },
      {
        openingStock: 0,
        closingStock: 0,
        currentStock: 0,
        supplyQty: 0,
        outgoingQty: 0,
        adjustmentNet: 0,
        initialQty: 0,
        netQty: 0,
        operations: 0,
      }
    );

    res.json({
      range: { from: rangeFrom.toISOString(), to: rangeTo.toISOString() },
      summary,
      monthly,
      perPillow,
    });
  } catch (error) {
    console.error('Error fetching pillow stock analytics:', error);
    res.status(500).json({ error: 'Failed to fetch pillow stock analytics' });
  }
});

router.get('/history-query', authMiddleware, adminOnly, async (req, res) => {
  try {
    const pageRaw = req.query.page as string | undefined;
    const limitRaw = req.query.limit as string | undefined;
    const page = Math.max(1, Number(pageRaw || 1));
    const limit = Math.min(200, Math.max(10, Number(limitRaw || 50)));
    const skip = (page - 1) * limit;

    const pillowIdRaw = req.query.pillowId as string | undefined;
    const pillowId = pillowIdRaw ? Number(pillowIdRaw) : undefined;
    if (pillowIdRaw && Number.isNaN(pillowId)) {
      return res.status(400).json({ error: 'Invalid pillowId' });
    }

    const fromRaw = req.query.from as string | undefined;
    const toRaw = req.query.to as string | undefined;
    const from = fromRaw ? new Date(fromRaw) : undefined;
    const to = toRaw ? new Date(toRaw) : undefined;
    if (fromRaw && Number.isNaN(from?.getTime())) return res.status(400).json({ error: 'Invalid from date' });
    if (toRaw && Number.isNaN(to?.getTime())) return res.status(400).json({ error: 'Invalid to date' });

    const search = String(req.query.search ?? '').trim();

    const createdAtFilter =
      from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {};

    const where: any = {
      ...(pillowId ? { pillowId } : {}),
      ...(search ? { reason: { contains: search } } : {}),
      ...createdAtFilter,
    };

    const [total, data] = await prisma.$transaction([
      prisma.pillowStockHistory.count({ where }),
      prisma.pillowStockHistory.findMany({
        where,
        include: { pillow: true, user: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    res.json({
      data,
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error) {
    console.error('Error fetching pillow stock history (query):', error);
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

    const mode = await getInventoryMode(prisma);

    // INVENTORY mode: never write Pillow.stock as business truth on create.
    // Create at 0; optional initial qty goes through InventoryService.supply (location required).
    if (mode === 'INVENTORY') {
      if (stock > 0) {
        const locationId = await accessoryStock.resolveLocationIdFromBody(req.body ?? {});
        if (!locationId) {
          return res.status(400).json({
            error: 'locationId (or locationCode) is required for initial stock in INVENTORY mode',
            code: 'INVENTORY_LOCATION_REQUIRED',
          });
        }
        const pillow = await prisma.pillow.create({
          data: { name, price, stock: 0 },
        });
        await prisma.activity.create({
          data: {
            userId: req.user.id,
            type: 'PILLOW_CREATED',
            description: `Created pillow "${name}" (inventory mode, stock via supply)`,
          },
        });
        const supplied = await accessoryStock.supply({
          pillowId: pillow.id,
          quantity: stock,
          reason: String(req.body?.reason ?? 'Initial stock').trim() || 'Initial stock',
          userId: req.user.id,
          locationId,
        });
        return res.status(201).json(supplied.pillow);
      }

      const pillow = await prisma.pillow.create({
        data: { name, price, stock: 0 },
      });
      await prisma.activity.create({
        data: {
          userId: req.user.id,
          type: 'PILLOW_CREATED',
          description: `Created pillow "${name}" with zero stock (inventory mode)`,
        },
      });
      return res.status(201).json(pillow);
    }

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
    const mapped = accessoryWriterErrorToHttp(error);
    if (mapped.body.code) {
      return res.status(mapped.status).json(mapped.body);
    }
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

    const locationId = await accessoryStock.resolveLocationIdFromBody(req.body ?? {});
    const { pillow } = await accessoryStock.supply({
      pillowId: id,
      quantity,
      reason,
      userId: req.user.id,
      locationId,
    });

    res.json(pillow);
  } catch (error: any) {
    const mapped = accessoryWriterErrorToHttp(error);
    if (mapped.body.code) {
      return res.status(mapped.status).json(mapped.body);
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

    const locationId = await accessoryStock.resolveLocationIdFromBody(req.body ?? {});
    const { pillow } = await accessoryStock.outgoing({
      pillowId: id,
      quantity,
      reason,
      userId: req.user.id,
      locationId,
    });

    res.json(pillow);
  } catch (error: any) {
    const mapped = accessoryWriterErrorToHttp(error);
    if (mapped.body.code) {
      return res.status(mapped.status).json(mapped.body);
    }
    console.error('Error creating pillow outgoing:', error);
    res.status(500).json({ error: 'Failed to create outgoing operation' });
  }
});

router.post('/:id/adjust', authMiddleware, adminOnly, async (req, res) => {
  try {
    if (!requireAdminCode(req, res)) return;
    const id = Number(req.params.id);
    const delta = Number(req.body?.delta ?? req.body?.quantity);
    const reason = String(req.body?.reason ?? '').trim();

    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
    if (!Number.isInteger(delta) || delta === 0) {
      return res.status(400).json({ error: 'Adjustment delta must be a non-zero integer' });
    }
    if (!reason) return res.status(400).json({ error: 'Reason is required', code: 'REASON_REQUIRED' });

    const locationId = await accessoryStock.resolveLocationIdFromBody(req.body ?? {});
    const { pillow } = await accessoryStock.adjust({
      pillowId: id,
      delta,
      reason,
      userId: req.user.id,
      locationId,
    });

    res.json(pillow);
  } catch (error: any) {
    const mapped = accessoryWriterErrorToHttp(error);
    if (mapped.body.code) {
      return res.status(mapped.status).json(mapped.body);
    }
    console.error('Error adjusting pillow stock:', error);
    res.status(500).json({ error: 'Failed to adjust pillow stock' });
  }
});

export default router;
