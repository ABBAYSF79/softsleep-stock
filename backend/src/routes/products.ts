// backend/src/routes/products.ts
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, adminOnly } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

router.get('/', authMiddleware, async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      include: {
        variants: {
          include: {
            size: true
          }
        }
      }
    });
    res.json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

router.post('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { name, sku, description, variants } = req.body;
    
    console.log('Received product data:', req.body);
    
    // Check if SKU already exists
    const existingProduct = await prisma.product.findUnique({
      where: { sku }
    });
    
    if (existingProduct) {
      return res.status(400).json({ error: 'SKU already exists' });
    }
    
    // Create product with variants
    const product = await prisma.product.create({
      data: {
        name,
        sku,
        description,
        variants: {
          create: variants.map((v: any) => ({
            name: v.name,
            skuExt: v.skuExt,
            price: v.price,
            sizeId: v.sizeId || null,
            weight: v.weight || 1.0,
            stock: v.stock || 0,
            commission: v.commission || null
          }))
        }
      },
      include: {
        variants: {
          include: {
            size: true
          }
        }
      }
    });
    
    console.log('Created product:', product);
    
    // Create initial stock history for each variant
    for (const variant of product.variants) {
      await prisma.stockHistory.create({
        data: {
          variantId: variant.id,
          quantity: variant.stock,
          type: 'INITIAL',
          reason: 'Initial stock',
          previousStock: 0,
          newStock: variant.stock,
          userId: req.user!.id
        }
      });
    }
    
    res.status(201).json(product);
  } catch (error: any) {
    console.error('Error creating product:', error);
    res.status(400).json({ 
      error: 'Failed to create product', 
      details: error.message 
    });
  }
});

router.put('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, sku, description, variants } = req.body;
    
    console.log('Updating product:', id);
    console.log('Received data:', req.body);
    
    // Check if SKU already exists for another product
    const existingProduct = await prisma.product.findFirst({
      where: {
        sku,
        NOT: {
          id: parseInt(id)
        }
      }
    });
    
    if (existingProduct) {
      return res.status(400).json({ error: 'SKU already exists for another product' });
    }

    // Get current variants to compare stock changes
    const currentProduct = await prisma.product.findUnique({
      where: { id: parseInt(id) },
      include: {
        variants: true
      }
    });

    if (!currentProduct) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    // Update product and its variants
    const updatedProduct = await prisma.$transaction(async (tx) => {
      // First update the product
      const product = await tx.product.update({
        where: { id: parseInt(id) },
        data: {
          name,
          sku,
          description
        }
      });

      // Then update each variant
      for (const variant of variants) {
        // Find current variant to get previous stock
        // Note: We intentionally IGNORE the stock field from the request for updates
        // to prevent manual overwrites. Stock must be managed via stock operations.
        
        const updatedVariant = await tx.productVariant.upsert({
          where: {
            productId_skuExt: {
              productId: parseInt(id),
              skuExt: variant.skuExt
            }
          },
          update: {
            name: variant.name,
            price: variant.price,
            sizeId: variant.sizeId || null,
            weight: variant.weight || 1.0,
            commission: variant.commission || null
            // stock is NOT updated here
          },
          create: {
            productId: parseInt(id),
            name: variant.name,
            skuExt: variant.skuExt,
            price: variant.price,
            sizeId: variant.sizeId || null,
            weight: variant.weight || 1.0,
            stock: variant.stock || 0, // Initial stock is allowed for NEW variants
            commission: variant.commission || null
          }
        });
        
        // Stock history for NEW variants only
        if (updatedVariant.stock > 0 && !currentProduct.variants.find(v => v.skuExt === variant.skuExt)) {
           await tx.stockHistory.create({
            data: {
              variantId: updatedVariant.id,
              type: 'INITIAL',
              quantity: updatedVariant.stock,
              reason: 'Initial stock for new variant',
              previousStock: 0,
              newStock: updatedVariant.stock,
              userId: req.user!.id
            }
          });
        }
      }

      // Return the updated product with its variants
      return tx.product.findUnique({
        where: { id: parseInt(id) },
        include: { 
          variants: {
            include: {
              size: true
            }
          }
        }
      });
    });

    if (!updatedProduct) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Log activity for product update
    await prisma.activity.create({
      data: {
        userId: req.user!.id,
        type: 'PRODUCT_UPDATE',
        description: `Product ${updatedProduct.name} (SKU: ${updatedProduct.sku}) was updated`,
        details: JSON.stringify({
          productId: updatedProduct.id,
          name: updatedProduct.name,
          sku: updatedProduct.sku,
          variantCount: updatedProduct.variants.length
        })
      }
    });
    
    res.json(updatedProduct);
  } catch (error: any) {
    console.error('Error updating product:', error);
    res.status(400).json({ 
      error: 'Failed to update product', 
      details: error.message 
    });
  }
});

router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password is required to delete a product' });
    }

    if (password !== 'admin123456') {
      return res.status(403).json({ error: 'Invalid password' });
    }
    
    // First check if the product exists
    const product = await prisma.product.findUnique({
      where: { id: parseInt(id) },
      include: { 
        variants: {
          include: {
            orderItems: true,
            stockHistories: true
          }
        }
      }
    });
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    const variantIds = product.variants.map(v => v.id);

    await prisma.$transaction(async (tx) => {
      if (variantIds.length) {
        await tx.stockHistory.deleteMany({
          where: { variantId: { in: variantIds } }
        });

        await tx.orderItem.deleteMany({
          where: { variantId: { in: variantIds } }
        });
      }

      await tx.product.delete({
        where: { id: parseInt(id) }
      });
    });
    
    res.json({ message: 'Product deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting product:', error);
    res.status(500).json({ 
      error: 'Failed to delete product',
      details: error.message 
    });
  }
});

export default router;
