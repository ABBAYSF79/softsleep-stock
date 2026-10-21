// backend/src/routes/delivery.ts
import express from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import { authMiddleware } from '../middleware/auth';
import {
  assertSuiviDeliveryServiceAccess,
  getUserDeliveryServiceIds,
  OrderAccessError,
} from '../utils/order-access';

const router = express.Router();
const prisma = new PrismaClient();

function parseCities(cities: string) {
  return typeof cities === 'string' ? JSON.parse(cities) : cities;
}

// Get delivery services (all for admin, assigned only for suivi)
router.get('/', authMiddleware, async (req, res) => {
  try {
    let where: { id?: { in: number[] } } = {};
    if (req.user!.role === UserRole.SUIVI) {
      const assignedIds = await getUserDeliveryServiceIds(req.user!.id);
      if (assignedIds.length > 0) {
        where = { id: { in: assignedIds } };
      }
    }

    const services = await prisma.deliveryService.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
    });

    const servicesWithParsedCities = services.map((service) => ({
      ...service,
      cities: parseCities(service.cities),
    }));

    res.json(servicesWithParsedCities);
  } catch (error) {
    console.error('Error fetching delivery services:', error);
    res.status(500).json({ error: 'Failed to fetch delivery services' });
  }
});

// Create delivery service (admin only)
router.post('/', authMiddleware, async (req, res) => {
  try {
    if (req.user!.role !== UserRole.ADMIN) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { name, active, cities } = req.body;

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
        cities: JSON.stringify(cities),
      },
    });

    res.status(201).json({
      ...service,
      cities,
    });
  } catch (error) {
    console.error('Error creating delivery service:', error);
    res.status(400).json({ error: 'Failed to create delivery service' });
  }
});

// Update delivery service
// - ADMIN: full update (name, active, cities)
// - SALES / SUIVI: cities only (name/active locked); SUIVI limited to assigned services
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const serviceId = parseInt(req.params.id);
    const role = req.user!.role;

    if (
      role !== UserRole.ADMIN &&
      role !== UserRole.SUIVI &&
      role !== UserRole.SALES
    ) {
      return res.status(403).json({ error: 'You do not have permission to update delivery services' });
    }

    if (role === UserRole.SUIVI) {
      try {
        await assertSuiviDeliveryServiceAccess(req.user!, serviceId);
      } catch (error) {
        if (error instanceof OrderAccessError) {
          return res.status(403).json({ error: error.message });
        }
        throw error;
      }
    }

    const existing = await prisma.deliveryService.findUnique({
      where: { id: serviceId },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Delivery service not found' });
    }

    const { name, active, cities } = req.body;

    if (!cities || !Array.isArray(cities) || cities.length === 0) {
      return res.status(400).json({ error: 'At least one city is required' });
    }

    const normalizedCities = cities
      .map((c: unknown) => String(c).trim())
      .filter((c: string) => c.length > 0);
    const uniqueCities = Array.from(new Set(normalizedCities));
    if (uniqueCities.length === 0) {
      return res.status(400).json({ error: 'At least one city is required' });
    }

    const isAdmin = role === UserRole.ADMIN;
    if (isAdmin && !name) {
      return res.status(400).json({ error: 'Service name is required' });
    }

    const service = await prisma.deliveryService.update({
      where: { id: serviceId },
      data: {
        name: isAdmin ? name : existing.name,
        active: isAdmin ? active : existing.active,
        cities: JSON.stringify(uniqueCities),
      },
    });

    res.json({
      ...service,
      cities: uniqueCities,
    });
  } catch (error) {
    console.error('Error updating delivery service:', error);
    res.status(400).json({ error: 'Failed to update delivery service' });
  }
});

// Delete delivery service (admin only)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    if (req.user!.role !== UserRole.ADMIN) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;

    await prisma.deliveryService.delete({
      where: { id: parseInt(id) },
    });

    res.json({ message: 'Delivery service deleted successfully' });
  } catch (error) {
    console.error('Error deleting delivery service:', error);
    res.status(400).json({ error: 'Failed to delete delivery service' });
  }
});

export default router;
