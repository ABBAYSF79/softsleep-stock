// backend/src/routes/delivery.ts
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

// Get all delivery services
router.get('/', authMiddleware, async (req, res) => {
  try {
    const services = await prisma.deliveryService.findMany({
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    // Parse cities from JSON string to array
    const servicesWithParsedCities = services.map(service => ({
      ...service,
      cities: typeof service.cities === 'string' ? JSON.parse(service.cities) : service.cities
    }));
    
    res.json(servicesWithParsedCities);
  } catch (error) {
    console.error('Error fetching delivery services:', error);
    res.status(500).json({ error: 'Failed to fetch delivery services' });
  }
});

// Create delivery service
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, active, cities } = req.body;
    
    // Validate input
    if (!name) {
      return res.status(400).json({ error: 'Service name is required' });
    }
    
    if (!cities || !Array.isArray(cities) || cities.length === 0) {
      return res.status(400).json({ error: 'At least one city is required' });
    }
    
    const service = await prisma.deliveryService.create({
      data: {
        name,
        active: active ?? true,
        cities: JSON.stringify(cities) // Store as JSON string
      }
    });
    
    // Return with parsed cities
    res.status(201).json({
      ...service,
      cities: cities
    });
  } catch (error) {
    console.error('Error creating delivery service:', error);
    res.status(400).json({ error: 'Failed to create delivery service' });
  }
});

// Update delivery service
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, active, cities } = req.body;
    
    // Validate input
    if (!name) {
      return res.status(400).json({ error: 'Service name is required' });
    }
    
    if (!cities || !Array.isArray(cities) || cities.length === 0) {
      return res.status(400).json({ error: 'At least one city is required' });
    }
    
    const service = await prisma.deliveryService.update({
      where: { id: parseInt(id) },
      data: {
        name,
        active,
        cities: JSON.stringify(cities)
      }
    });
    
    // Return with parsed cities
    res.json({
      ...service,
      cities: cities
    });
  } catch (error) {
    console.error('Error updating delivery service:', error);
    res.status(400).json({ error: 'Failed to update delivery service' });
  }
});

// Delete delivery service
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    await prisma.deliveryService.delete({
      where: { id: parseInt(id) }
    });
    
    res.json({ message: 'Delivery service deleted successfully' });
  } catch (error) {
    console.error('Error deleting delivery service:', error);
    res.status(400).json({ error: 'Failed to delete delivery service' });
  }
});

export default router;