import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, adminOnly } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

// Get commission settings
router.get('/commission', authMiddleware, async (req, res) => {
  try {
    let settings = await prisma.commissionSettings.findFirst();
    
    if (!settings) {
      // Create default settings if none exist
      settings = await prisma.commissionSettings.create({
        data: {
          defaultRate: 10.00,
          useFixedAmount: false
        }
      });
    }
    
    res.json(settings);
  } catch (error) {
    console.error('Error fetching commission settings:', error);
    res.status(500).json({ error: 'Failed to fetch commission settings' });
  }
});

// Update commission settings (admin only)
router.put('/commission', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { defaultRate, defaultFixedAmount, useFixedAmount } = req.body;
    
    let settings = await prisma.commissionSettings.findFirst();
    
    if (!settings) {
      settings = await prisma.commissionSettings.create({
        data: {
          defaultRate: defaultRate || 10.00,
          defaultFixedAmount: defaultFixedAmount || null,
          useFixedAmount: useFixedAmount || false
        }
      });
    } else {
      settings = await prisma.commissionSettings.update({
        where: { id: settings.id },
        data: {
          defaultRate: defaultRate !== undefined ? defaultRate : settings.defaultRate,
          defaultFixedAmount: defaultFixedAmount !== undefined ? defaultFixedAmount : settings.defaultFixedAmount,
          useFixedAmount: useFixedAmount !== undefined ? useFixedAmount : settings.useFixedAmount
        }
      });
    }
    
    res.json(settings);
  } catch (error) {
    console.error('Error updating commission settings:', error);
    res.status(400).json({ error: 'Failed to update commission settings' });
  }
});

export default router; 