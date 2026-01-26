import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

const ACTIVITIES_PASSWORD = 'ABBA202012141784520BK';

// Get all activities
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { password } = req.query;

    if (password !== ACTIVITIES_PASSWORD) {
      return res.status(403).json({ error: 'Invalid activities password' });
    }

    const activities = await prisma.activity.findMany({
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        user: {
          select: {
            name: true,
            email: true
          }
        }
      }
    });

    // Format activities for frontend
    const formattedActivities = activities.map(activity => ({
      id: activity.id,
      type: activity.type,
      description: activity.description,
      details: activity.details,
      createdAt: activity.createdAt,
      userName: activity.user.name,
      userEmail: activity.user.email
    }));

    res.json(formattedActivities);
  } catch (error) {
    console.error('Error fetching activities:', error);
    res.status(500).json({ error: 'Failed to fetch activities' });
  }
});

// Create new activity
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { type, description, details } = req.body;
    
    const activity = await prisma.activity.create({
      data: {
        userId: req.user!.id,
        type,
        description,
        details: details || null
      }
    });

    res.status(201).json(activity);
  } catch (error) {
    console.error('Error creating activity:', error);
    res.status(400).json({ error: 'Failed to create activity' });
  }
});

export default router; 