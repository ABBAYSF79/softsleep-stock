// backend/src/routes/stock.ts
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, adminOnly } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

function firstQueryString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const v = Array.isArray(value) ? value[0] : value;
  const s = String(v).trim();
  return s.length ? s : undefined;
}

function parsePositiveInt(value: string | undefined): number | null {
  if (!value || value === 'all') return null;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const EMPTY_STOCK_SUMMARY = {
  openingStock: 0,
  closingStock: 0,
  currentStock: 0,
  supplyQty: 0,
  orderQty: 0,
  returnQty: 0,
  adjustmentNet: 0,
  initialQty: 0,
  netQty: 0,
  operations: 0,
};

function accumulateStockMovement(
  row: { supplyQty: number; orderQty: number; returnQty: number; adjustmentNet: number; initialQty: number; netQty: number; operations: number },
  type: string,
  quantity: number
) {
  row.operations += 1;
  row.netQty += quantity;
  if (type === 'SUPPLY') row.supplyQty += Math.max(0, quantity);
  else if (type === 'ORDER') row.orderQty += Math.abs(quantity);
  else if (type === 'RETURN') row.returnQty += Math.max(0, quantity);
  else if (type === 'ADJUSTMENT') row.adjustmentNet += quantity;
  else if (type === 'INITIAL') row.initialQty += Math.max(0, quantity);
}

// Get stock overview (admin only)
router.get('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    console.log('Fetching variants...');
    const variants = await prisma.productVariant.findMany({
      include: {
        product: true,
        orderItems: {
          include: {
            order: true
          }
        },
        stockHistories: {
          orderBy: {
            createdAt: 'desc'
          }
        }
      }
    });
    
    console.log(`Found ${variants.length} variants`);
    
    // Calculate stock data for each variant
    const stockData = await Promise.all(variants.map(async variant => {
      try {
        // Get initial stock from history
        const initialStockHistory = await prisma.stockHistory.findFirst({
          where: { 
            variantId: variant.id,
            type: 'INITIAL'
          }
        });

        // Calculate ordered quantity (from both IN_PROCESS and DELIVERED orders)
        const orderedQty = variant.orderItems
          .filter(item => item.order && ['IN_PROCESS', 'DELIVERED'].includes(item.order.status))
          .reduce((sum, item) => sum + item.quantity, 0);
        
        // Calculate returned quantity
        const returnedQty = variant.orderItems
          .filter(item => item.order && item.order.status === 'RETURNED')
          .reduce((sum, item) => sum + item.quantity, 0);
        
        // Get last update time
        const lastUpdateHistory = await prisma.stockHistory.findFirst({
          where: { variantId: variant.id },
          orderBy: { createdAt: 'desc' }
        });
        
        return {
          id: variant.id,
          product: variant.product.name,
          variant: variant.name,
          sku: `${variant.product.sku}${variant.skuExt}`,
          initialStock: initialStockHistory?.newStock || 0,
          orderedQty: orderedQty || 0,
          returnedQty: returnedQty || 0,
          currentStock: variant.stock, // Trust the database source of truth
          lastUpdate: lastUpdateHistory?.createdAt || null
        };
      } catch (err) {
        console.error('Error processing variant:', variant.id, err);
        return {
          id: variant.id,
          product: variant.product.name,
          variant: variant.name,
          sku: `${variant.product.sku}${variant.skuExt}`,
          initialStock: 0,
          orderedQty: 0,
          returnedQty: 0,
          currentStock: variant.stock || 0,
          lastUpdate: null,
          error: 'Failed to process variant data'
        };
      }
    }));
    
    console.log('Successfully processed stock data');
    res.json(stockData);
  } catch (error) {
    console.error('Error fetching stock data:', error);
    res.status(500).json({ 
      error: 'Failed to fetch stock data',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get stock history (admin only) — supports:
//   ?variantId=…                     → full list for one variant (sheet)
//   ?page=1&limit=50&…               → paginated ledger (Stock History page)
//   ?analytics=1&productId=…&…       → finance summary + monthly breakdown
router.get('/history', authMiddleware, adminOnly, async (req, res) => {
  const analyticsFlag = firstQueryString(req.query.analytics);
  const pageFlag = firstQueryString(req.query.page);

  if (analyticsFlag === '1' || analyticsFlag === 'true') {
    return handleStockAnalytics(req, res);
  }
  if (pageFlag) {
    return handleStockHistoryQuery(req, res);
  }
  return handleStockHistorySimple(req, res);
});

async function handleStockHistorySimple(
  req: express.Request,
  res: express.Response
) {
  try {
    const variantIdRaw = firstQueryString(req.query.variantId);
    const variantId = variantIdRaw ? Number(variantIdRaw) : undefined;

    if (variantIdRaw && Number.isNaN(variantId)) {
      return res.status(400).json({ error: 'Invalid variantId' });
    }

    const history = await prisma.stockHistory.findMany({
      where: variantId ? { variantId } : undefined,
      include: {
        variant: {
          include: {
            product: true,
          },
        },
        user: { select: { id: true, name: true } },
      },
      orderBy: {
        createdAt: 'desc',
      },
      ...(variantId ? {} : { take: 200 }),
    });

    res.json(history);
  } catch (error) {
    console.error('Error fetching stock history:', error);
    res.status(500).json({ error: 'Failed to fetch stock history' });
  }
}

async function handleStockAnalytics(
  req: express.Request,
  res: express.Response
) {
  try {
    const productIdParam = parsePositiveInt(firstQueryString(req.query.productId));
    const variantIdParam = parsePositiveInt(firstQueryString(req.query.variantId));

    if (variantIdParam && productIdParam) {
      const variantCheck = await prisma.productVariant.findUnique({
        where: { id: variantIdParam },
        select: { productId: true },
      });
      if (!variantCheck || variantCheck.productId !== productIdParam) {
        return res.status(400).json({ error: 'Variant does not belong to selected product' });
      }
    }

    const fromRaw = firstQueryString(req.query.from);
    const toRaw = firstQueryString(req.query.to);
    const from = fromRaw ? new Date(fromRaw) : undefined;
    const to = toRaw ? new Date(toRaw) : undefined;
    if (fromRaw && Number.isNaN(from?.getTime())) {
      return res.status(400).json({ error: 'Invalid from date' });
    }
    if (toRaw && Number.isNaN(to?.getTime())) {
      return res.status(400).json({ error: 'Invalid to date' });
    }

    const variantWhere: Record<string, unknown> = {};
    if (variantIdParam) variantWhere.id = variantIdParam;
    else if (productIdParam) variantWhere.productId = productIdParam;

    const variants = await prisma.productVariant.findMany({
      where: variantWhere,
      include: { product: true, size: true },
      orderBy: [{ product: { name: 'asc' } }, { name: 'asc' }],
    });

    if (variantIdParam && variants.length === 0) {
      return res.status(404).json({ error: 'Variant not found' });
    }

    const variantIds = variants.map((v) => v.id);
    if (variantIds.length === 0) {
      return res.json({
        range: null,
        summary: { ...EMPTY_STOCK_SUMMARY },
        monthly: [],
        perVariant: [],
      });
    }

    let rangeFrom = from ? new Date(from) : null;
    let rangeTo = to ? new Date(to) : new Date();
    rangeTo.setHours(23, 59, 59, 999);
    if (rangeFrom) rangeFrom.setHours(0, 0, 0, 0);

    if (!rangeFrom) {
      const earliest = await prisma.stockHistory.findFirst({
        where: { variantId: { in: variantIds } },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      });
      rangeFrom = earliest ? new Date(earliest.createdAt) : new Date();
      rangeFrom.setHours(0, 0, 0, 0);
    }

    const [initialRows, beforeRows, upToRows, rangeRows] = await prisma.$transaction([
      prisma.stockHistory.findMany({
        where: { variantId: { in: variantIds }, type: 'INITIAL' },
        orderBy: { createdAt: 'asc' },
        distinct: ['variantId'],
        select: { variantId: true, newStock: true },
      }),
      prisma.stockHistory.findMany({
        where: { variantId: { in: variantIds }, createdAt: { lt: rangeFrom } },
        orderBy: { createdAt: 'desc' },
        distinct: ['variantId'],
        select: { variantId: true, newStock: true },
      }),
      prisma.stockHistory.findMany({
        where: { variantId: { in: variantIds }, createdAt: { lte: rangeTo } },
        orderBy: { createdAt: 'desc' },
        distinct: ['variantId'],
        select: { variantId: true, newStock: true },
      }),
      prisma.stockHistory.findMany({
        where: {
          variantId: { in: variantIds },
          createdAt: { gte: rangeFrom, lte: rangeTo },
        },
        select: { variantId: true, quantity: true, type: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const initialByVariant = new Map<number, number>();
    for (const r of initialRows) initialByVariant.set(r.variantId, r.newStock);
    const beforeByVariant = new Map<number, number>();
    for (const r of beforeRows) beforeByVariant.set(r.variantId, r.newStock);
    const upToByVariant = new Map<number, number>();
    for (const r of upToRows) upToByVariant.set(r.variantId, r.newStock);

    const perVariant = variants.map((v) => {
      const initialStock = initialByVariant.get(v.id) ?? 0;
      const openingStock = beforeByVariant.get(v.id) ?? initialStock;
      const closingStock = upToByVariant.get(v.id) ?? openingStock;
      return {
        variantId: v.id,
        productId: v.productId,
        productName: v.product.name,
        variantName: v.name,
        sku: `${v.product.sku}${v.skuExt}`,
        price: v.price,
        initialStock,
        openingStock,
        closingStock,
        currentStock: v.stock,
        supplyQty: 0,
        orderQty: 0,
        returnQty: 0,
        adjustmentNet: 0,
        initialQty: 0,
        netQty: 0,
        operations: 0,
        stockMismatch: closingStock !== v.stock,
      };
    });

    const perVariantIndex = new Map<number, number>();
    perVariant.forEach((row, idx) => perVariantIndex.set(row.variantId, idx));

    const monthMap = new Map<
      string,
      {
        month: string;
        supplyQty: number;
        orderQty: number;
        returnQty: number;
        adjustmentNet: number;
        initialQty: number;
        netQty: number;
        operations: number;
      }
    >();
    const monthKey = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      return `${y}-${m}`;
    };

    for (const r of rangeRows) {
      const quantity = Number(r.quantity || 0);
      const key = monthKey(r.createdAt);
      const monthRow = monthMap.get(key) ?? {
        month: key,
        supplyQty: 0,
        orderQty: 0,
        returnQty: 0,
        adjustmentNet: 0,
        initialQty: 0,
        netQty: 0,
        operations: 0,
      };
      accumulateStockMovement(monthRow, r.type, quantity);
      monthMap.set(key, monthRow);

      const idx = perVariantIndex.get(r.variantId);
      if (idx !== undefined) {
        accumulateStockMovement(perVariant[idx], r.type, quantity);
      }
    }

    const monthly = Array.from(monthMap.values()).sort((a, b) => a.month.localeCompare(b.month));
    const summary = perVariant.reduce(
      (acc, p) => {
        acc.openingStock += p.openingStock;
        acc.closingStock += p.closingStock;
        acc.currentStock += p.currentStock;
        acc.supplyQty += p.supplyQty;
        acc.orderQty += p.orderQty;
        acc.returnQty += p.returnQty;
        acc.adjustmentNet += p.adjustmentNet;
        acc.initialQty += p.initialQty;
        acc.netQty += p.netQty;
        acc.operations += p.operations;
        return acc;
      },
      { ...EMPTY_STOCK_SUMMARY }
    );

    res.json({
      range: { from: rangeFrom.toISOString(), to: rangeTo.toISOString() },
      summary,
      monthly,
      perVariant,
    });
  } catch (error) {
    console.error('Error fetching stock analytics:', error);
    res.status(500).json({ error: 'Failed to fetch stock analytics' });
  }
}

async function handleStockHistoryQuery(
  req: express.Request,
  res: express.Response
) {
  try {
    const pageRaw = firstQueryString(req.query.page);
    const limitRaw = firstQueryString(req.query.limit);
    const page = Math.max(1, Number(pageRaw || 1));
    const limit = Math.min(500, Math.max(10, Number(limitRaw || 50)));
    const skip = (page - 1) * limit;

    const productIdParam = parsePositiveInt(firstQueryString(req.query.productId));
    const variantIdParam = parsePositiveInt(firstQueryString(req.query.variantId));
    const typeParam = firstQueryString(req.query.type);

    if (variantIdParam && productIdParam) {
      const variantCheck = await prisma.productVariant.findUnique({
        where: { id: variantIdParam },
        select: { productId: true },
      });
      if (!variantCheck || variantCheck.productId !== productIdParam) {
        return res.status(400).json({ error: 'Variant does not belong to selected product' });
      }
    }

    const fromRaw = firstQueryString(req.query.from);
    const toRaw = firstQueryString(req.query.to);
    const from = fromRaw ? new Date(fromRaw) : undefined;
    const to = toRaw ? new Date(toRaw) : undefined;
    if (fromRaw && Number.isNaN(from?.getTime())) {
      return res.status(400).json({ error: 'Invalid from date' });
    }
    if (toRaw && Number.isNaN(to?.getTime())) {
      return res.status(400).json({ error: 'Invalid to date' });
    }

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

    const where: Record<string, unknown> = {
      ...(variantIdParam ? { variantId: variantIdParam } : {}),
      ...(productIdParam && !variantIdParam
        ? { variant: { productId: productIdParam } }
        : {}),
      ...(typeParam && typeParam !== 'all' ? { type: typeParam } : {}),
      ...(search ? { reason: { contains: search } } : {}),
      ...createdAtFilter,
    };

    const [total, data] = await prisma.$transaction([
      prisma.stockHistory.count({ where }),
      prisma.stockHistory.findMany({
        where,
        include: {
          variant: {
            include: {
              product: true,
              size: true,
            },
          },
          user: { select: { id: true, name: true } },
        },
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
    console.error('Error fetching stock history (query):', error);
    res.status(500).json({ error: 'Failed to fetch stock history' });
  }
}

// Legacy aliases — keep for older frontends / cached bundles
router.get('/analytics', authMiddleware, adminOnly, handleStockAnalytics);
router.get('/history-query', authMiddleware, adminOnly, handleStockHistoryQuery);

// Update stock (admin only)
router.patch('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { stock } = req.body;
    const variantId = parseInt(req.params.id);

    // Get current variant data
    const currentVariant = await prisma.productVariant.findUnique({
      where: { id: variantId },
      include: {
        product: true
      }
    });

    if (!currentVariant) {
      return res.status(404).json({ error: 'Variant not found' });
    }

    // Update variant stock
    const updatedVariant = await prisma.productVariant.update({
      where: { id: variantId },
      data: { 
        stock: stock
      },
      include: {
        product: true
      }
    });

    // Create stock history record
    await prisma.stockHistory.create({
      data: {
        variantId: variantId,
        type: 'ADJUSTMENT',
        quantity: stock - currentVariant.stock,
        reason: 'Manual stock update',
        previousStock: currentVariant.stock,
        newStock: stock,
        userId: req.user!.id
      }
    });

    // Log activity
    await prisma.activity.create({
      data: {
        userId: req.user!.id,
        type: 'STOCK_UPDATE',
        description: `Stock updated for ${updatedVariant.product.name} - ${updatedVariant.name} from ${currentVariant.stock} to ${stock}`,
        details: JSON.stringify({
          productId: updatedVariant.productId,
          variantId: updatedVariant.id,
          previousStock: currentVariant.stock,
          newStock: stock,
          change: stock - currentVariant.stock
        })
      }
    });

    res.json(updatedVariant);
  } catch (error) {
    console.error('Error updating stock:', error);
    res.status(400).json({ error: 'Failed to update stock' });
  }
});

// Add supply stock (admin only)
router.post('/:id/supply', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { quantity, reason } = req.body;
    const variantId = parseInt(req.params.id);

    if (!quantity || isNaN(quantity)) {
      return res.status(400).json({ error: 'Invalid quantity' });
    }

    // Get current variant data
    const currentVariant = await prisma.productVariant.findUnique({
      where: { id: variantId },
      include: {
        product: true
      }
    });

    if (!currentVariant) {
      return res.status(404).json({ error: 'Variant not found' });
    }

    // Use transaction for atomic update
    const updatedVariant = await prisma.$transaction(async (tx) => {
      const newStock = currentVariant.stock + parseInt(quantity);

      // Update variant stock
      const variant = await tx.productVariant.update({
        where: { id: variantId },
        data: { 
          stock: newStock
        },
        include: {
          product: true
        }
      });

      // Create stock history record
      await tx.stockHistory.create({
        data: {
          variantId: variantId,
          type: 'SUPPLY',
          quantity: parseInt(quantity),
          reason: reason || 'Supply restock',
          previousStock: currentVariant.stock,
          newStock: newStock,
          userId: req.user!.id
        }
      });

      // Log activity
      await tx.activity.create({
        data: {
          userId: req.user!.id,
          type: 'STOCK_UPDATE',
          description: `Supply added for ${variant.product.name} - ${variant.name}: +${quantity}`,
          details: JSON.stringify({
            productId: variant.productId,
            variantId: variant.id,
            previousStock: currentVariant.stock,
            newStock: newStock,
            change: parseInt(quantity),
            type: 'SUPPLY',
            reason
          })
        }
      });
      
      return variant;
    });

    res.json(updatedVariant);
  } catch (error) {
    console.error('Error adding supply:', error);
    res.status(400).json({ error: 'Failed to add supply' });
  }
});

// Add stock correction (admin only)
router.post('/:id/correction', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { quantity, reason, type } = req.body;
    const variantId = parseInt(req.params.id);

    if (!quantity || isNaN(quantity)) {
      return res.status(400).json({ error: 'Invalid quantity' });
    }
    
    // Type should be 'ADJUSTMENT' (Found/Lost)
    const stockType = type || 'ADJUSTMENT';

    // Get current variant data
    const currentVariant = await prisma.productVariant.findUnique({
      where: { id: variantId },
      include: {
        product: true
      }
    });

    if (!currentVariant) {
      return res.status(404).json({ error: 'Variant not found' });
    }

    // Use transaction for atomic update
    const updatedVariant = await prisma.$transaction(async (tx) => {
      const newStock = currentVariant.stock + parseInt(quantity);
      
      // Prevent negative stock
      if (newStock < 0) {
        throw new Error('Correction would result in negative stock');
      }

      // Update variant stock
      const variant = await tx.productVariant.update({
        where: { id: variantId },
        data: { 
          stock: newStock
        },
        include: {
          product: true
        }
      });

      // Create stock history record
      await tx.stockHistory.create({
        data: {
          variantId: variantId,
          type: stockType,
          quantity: parseInt(quantity),
          reason: reason || 'Stock correction',
          previousStock: currentVariant.stock,
          newStock: newStock,
          userId: req.user!.id
        }
      });

      // Log activity
      await tx.activity.create({
        data: {
          userId: req.user!.id,
          type: 'STOCK_UPDATE',
          description: `Correction for ${variant.product.name} - ${variant.name}: ${quantity > 0 ? '+' : ''}${quantity}`,
          details: JSON.stringify({
            productId: variant.productId,
            variantId: variant.id,
            previousStock: currentVariant.stock,
            newStock: newStock,
            change: parseInt(quantity),
            type: stockType,
            reason
          })
        }
      });
      
      return variant;
    });

    res.json(updatedVariant);
  } catch (error) {
    console.error('Error adding correction:', error);
    res.status(400).json({ error: 'Failed to add correction' });
  }
});

export default router;