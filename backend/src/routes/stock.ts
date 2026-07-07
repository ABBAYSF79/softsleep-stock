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

// Get stock history (admin only)
router.get('/history', authMiddleware, adminOnly, async (req, res) => {
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
            product: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      ...(variantId ? {} : { take: 200 }),
    });
    
    res.json(history);
  } catch (error) {
    console.error('Error fetching stock history:', error);
    res.status(500).json({ error: 'Failed to fetch stock history' });
  }
});

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