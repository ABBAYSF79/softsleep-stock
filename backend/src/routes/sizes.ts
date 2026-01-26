import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, adminOnly } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// Get all sizes
router.get('/', async (req, res) => {
  try {
    const sizes = await prisma.size.findMany({
      orderBy: {
        name: 'asc'
      }
    });
    res.json(sizes);
  } catch (error) {
    console.error('Error fetching sizes:', error);
    res.status(500).json({ error: 'Failed to fetch sizes' });
  }
});

// Create a new size
router.post('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { name, length, width, height } = req.body;
    
    if (!name || !length || !width || !height) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check for existing size with the same name (case-insensitive)
    const existingSize = await prisma.size.findFirst({
      where: {
        name: {
          equals: name.toLowerCase()
        }
      }
    });

    if (existingSize) {
      return res.status(400).json({ error: 'A size with this name already exists' });
    }

    const size = await prisma.size.create({
      data: {
        name,
        length: parseFloat(length),
        width: parseFloat(width),
        height: parseFloat(height)
      }
    });

    res.json(size);
  } catch (error) {
    console.error('Error creating size:', error);
    res.status(500).json({ error: 'Failed to create size' });
  }
});

// Delete a size
router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if size is used in any variants
    const variants = await prisma.productVariant.findMany({
      where: {
        sizeId: parseInt(id)
      }
    });

    if (variants.length > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete size. It is being used by product variants.' 
      });
    }

    await prisma.size.delete({
      where: {
        id: parseInt(id)
      }
    });

    res.json({ message: 'Size deleted successfully' });
  } catch (error) {
    console.error('Error deleting size:', error);
    res.status(500).json({ error: 'Failed to delete size' });
  }
});

export default router; 