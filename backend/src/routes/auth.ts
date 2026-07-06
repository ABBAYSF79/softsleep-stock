// backend/src/routes/auth.ts
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient, UserRole } from '@prisma/client';
import { authMiddleware } from '../middleware/auth';
import { getUserDeliveryServiceIds } from '../utils/order-access';

const router = express.Router();
const prisma = new PrismaClient();

async function buildAuthUserPayload(user: {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  linkedSalesUserId?: number | null;
}) {
  const base = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  if (user.role === UserRole.LIVREUR || user.role === UserRole.SUIVI) {
    const deliveryServiceIds = await getUserDeliveryServiceIds(user.id);
    const deliveryServices = deliveryServiceIds.length
      ? await prisma.deliveryService.findMany({
          where: { id: { in: deliveryServiceIds } },
          select: { id: true, name: true },
        })
      : [];

    return {
      ...base,
      deliveryServiceIds,
      deliveryServices,
      ...(user.role === UserRole.SUIVI && user.linkedSalesUserId
        ? { linkedSalesUserId: user.linkedSalesUserId }
        : {}),
    };
  }

  return base;
}

router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: UserRole.SALES,
      },
    });

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
      },
      process.env.JWT_SECRET!,
      { algorithm: 'HS256' }
    );

    res.status(201).json({
      user: await buildAuthUserPayload(user),
      token,
    });
  } catch (error) {
    res.status(400).json({ error: 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
      },
      process.env.JWT_SECRET!,
      { algorithm: 'HS256' }
    );

    await prisma.activity.create({
      data: {
        userId: user.id,
        type: 'LOGIN',
        description: `User ${user.name} logged in`,
        details: JSON.stringify({
          email: user.email,
          role: user.role,
        }),
      },
    });

    res.json({
      token,
      user: await buildAuthUserPayload(user),
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(400).json({ error: 'Login failed' });
  }
});

router.post('/logout', authMiddleware, async (req, res) => {
  try {
    await prisma.activity.create({
      data: {
        userId: req.user!.id,
        type: 'LOGOUT',
        description: `User ${req.user!.name} logged out`,
        details: JSON.stringify({
          email: req.user!.email,
          role: req.user!.role,
        }),
      },
    });

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(400).json({ error: 'Logout failed' });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        linkedSalesUserId: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(await buildAuthUserPayload(user));
  } catch (error) {
    res.status(500).json({ error: 'Failed to get user data' });
  }
});

export default router;
