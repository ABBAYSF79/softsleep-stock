// backend/src/routes/users.ts
import express from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import { authMiddleware, adminOnly } from '../middleware/auth';
import bcrypt from 'bcryptjs';

const router = express.Router();
const prisma = new PrismaClient();

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  linkedSalesUserId: true,
  linkedSalesUser: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  lastActive: true,
  createdAt: true,
  deliveryServices: {
    select: {
      deliveryService: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
} as const;

function formatUser(user: {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  linkedSalesUserId?: number | null;
  linkedSalesUser?: { id: number; name: string; email: string } | null;
  lastActive: Date;
  createdAt: Date;
  deliveryServices?: Array<{ deliveryService: { id: number; name: string } }>;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    linkedSalesUserId: user.linkedSalesUserId ?? null,
    linkedSalesUser: user.linkedSalesUser ?? null,
    lastActive: user.lastActive,
    createdAt: user.createdAt,
    deliveryServices: user.deliveryServices?.map((row) => row.deliveryService) ?? [],
    deliveryServiceIds: user.deliveryServices?.map((row) => row.deliveryService.id) ?? [],
  };
}

async function validateDeliveryServiceIds(
  deliveryServiceIds: number[],
  roleLabel: string
): Promise<string | null> {
  if (!deliveryServiceIds.length) {
    return `At least one delivery service is required for ${roleLabel} users`;
  }

  const services = await prisma.deliveryService.findMany({
    where: { id: { in: deliveryServiceIds } },
    select: { id: true, active: true },
  });

  if (services.length !== deliveryServiceIds.length) {
    return 'One or more delivery services were not found';
  }

  const inactive = services.find((service) => !service.active);
  if (inactive) {
    return 'All assigned delivery services must be active';
  }

  return null;
}

async function validateLinkedSalesUserId(linkedSalesUserId: number): Promise<string | null> {
  const linkedAdmin = await prisma.user.findFirst({
    where: {
      id: linkedSalesUserId,
      role: UserRole.ADMIN,
      active: true,
    },
    select: { id: true },
  });

  if (!linkedAdmin) {
    return 'Linked admin account must be an active ADMIN user';
  }

  return null;
}

function requiresDeliveryServices(role: UserRole): boolean {
  return role === UserRole.LIVREUR || role === UserRole.SUIVI;
}

function requiresDeliveryServiceSelection(role: UserRole): boolean {
  return role === UserRole.LIVREUR;
}

// Get all users (admin only)
router.get('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: {
        active: true,
      },
      select: userSelect,
      orderBy: {
        createdAt: 'desc',
      },
    });
    res.json(users.map(formatUser));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get single user (admin only)
router.get('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({
      where: { id: parseInt(id) },
      select: userSelect,
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(formatUser(user));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Create user (admin only)
router.post('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { name, email, password, role, deliveryServiceIds = [], linkedSalesUserId } = req.body;
    const userRole: UserRole = role || UserRole.SALES;
    const normalizedDeliveryServiceIds = Array.isArray(deliveryServiceIds)
      ? [...new Set(deliveryServiceIds.map((id: number) => Number(id)).filter((id: number) => Number.isFinite(id)))]
      : [];

    if (requiresDeliveryServiceSelection(userRole)) {
      const validationError = await validateDeliveryServiceIds(
        normalizedDeliveryServiceIds,
        'livreur'
      );
      if (validationError) {
        return res.status(400).json({ error: validationError });
      }
    }

    if (userRole === UserRole.SUIVI) {
      const parsedLinkedSalesUserId = Number(linkedSalesUserId);
      if (!Number.isFinite(parsedLinkedSalesUserId)) {
        return res.status(400).json({ error: 'Linked admin account is required for suivi users' });
      }
      const linkedError = await validateLinkedSalesUserId(parsedLinkedSalesUserId);
      if (linkedError) {
        return res.status(400).json({ error: linkedError });
      }
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          role: userRole,
          linkedSalesUserId:
            userRole === UserRole.SUIVI ? Number(linkedSalesUserId) : null,
        },
        select: userSelect,
      });

      if (requiresDeliveryServices(userRole)) {
        await tx.userDeliveryService.createMany({
          data: normalizedDeliveryServiceIds.map((deliveryServiceId: number) => ({
            userId: created.id,
            deliveryServiceId,
          })),
        });
      }

      return tx.user.findUnique({
        where: { id: created.id },
        select: userSelect,
      });
    });

    if (!user) {
      return res.status(500).json({ error: 'Failed to create user' });
    }

    res.status(201).json(formatUser(user));
  } catch (error) {
    console.error('Create user error:', error);
    res.status(400).json({ error: 'Failed to create user' });
  }
});

// Update user (admin only)
router.put('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role, password, deliveryServiceIds, linkedSalesUserId } = req.body;
    const userId = parseInt(id);

    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const nextRole: UserRole = role ?? existingUser.role;
    const normalizedDeliveryServiceIds = Array.isArray(deliveryServiceIds)
      ? [...new Set(deliveryServiceIds.map((value: number) => Number(value)).filter((value: number) => Number.isFinite(value)))]
      : undefined;

    if (requiresDeliveryServiceSelection(nextRole)) {
      const idsToValidate =
        normalizedDeliveryServiceIds ??
        (
          await prisma.userDeliveryService.findMany({
            where: { userId },
            select: { deliveryServiceId: true },
          })
        ).map((row) => row.deliveryServiceId);

      const validationError = await validateDeliveryServiceIds(idsToValidate, 'livreur');
      if (validationError) {
        return res.status(400).json({ error: validationError });
      }
    }

    let resolvedLinkedSalesUserId: number | null =
      nextRole === UserRole.SUIVI ? existingUser.linkedSalesUserId : null;

    if (nextRole === UserRole.SUIVI) {
      const parsedLinkedSalesUserId =
        linkedSalesUserId !== undefined
          ? Number(linkedSalesUserId)
          : existingUser.linkedSalesUserId;

      if (!Number.isFinite(parsedLinkedSalesUserId)) {
        return res.status(400).json({ error: 'Linked admin account is required for suivi users' });
      }

      const linkedError = await validateLinkedSalesUserId(parsedLinkedSalesUserId);
      if (linkedError) {
        return res.status(400).json({ error: linkedError });
      }

      resolvedLinkedSalesUserId = parsedLinkedSalesUserId;
    }

    if (email !== existingUser.email) {
      const emailExists = await prisma.user.findUnique({
        where: { email },
      });

      if (emailExists) {
        return res.status(400).json({ error: 'Email already exists' });
      }
    }

    const updateData: {
      name: string;
      email: string;
      role: UserRole;
      password?: string;
      linkedSalesUserId: number | null;
    } = {
      name,
      email,
      role: nextRole,
      linkedSalesUserId: resolvedLinkedSalesUserId,
    };

    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    const user = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: updateData,
      });

      if (requiresDeliveryServices(nextRole)) {
        if (normalizedDeliveryServiceIds !== undefined) {
          await tx.userDeliveryService.deleteMany({ where: { userId } });
          if (normalizedDeliveryServiceIds.length > 0) {
            await tx.userDeliveryService.createMany({
              data: normalizedDeliveryServiceIds.map((deliveryServiceId: number) => ({
                userId,
                deliveryServiceId,
              })),
            });
          }
        }
      } else {
        await tx.userDeliveryService.deleteMany({ where: { userId } });
      }

      return tx.user.findUnique({
        where: { id: userId },
        select: userSelect,
      });
    });

    if (!user) {
      return res.status(500).json({ error: 'Failed to update user' });
    }

    res.json(formatUser(user));
  } catch (error) {
    console.error('Update user error:', error);
    res.status(400).json({ error: 'Failed to update user' });
  }
});

// Delete user (admin only)
router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;

    if (parseInt(id) === req.user!.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const user = await prisma.user.findUnique({
      where: { id: parseInt(id) },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.userDeliveryService.deleteMany({ where: { userId: parseInt(id) } });
      await tx.user.update({
        where: { id: parseInt(id) },
        data: { active: false, linkedSalesUserId: null },
      });
    });

    res.json({ message: 'User deactivated successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(400).json({ error: 'Failed to deactivate user' });
  }
});

export default router;
