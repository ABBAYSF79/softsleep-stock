import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth';  // Add this import

const router = express.Router();
const prisma = new PrismaClient();

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    
    const existingUser = await prisma.user.findUnique({
      where: { email }
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
        role: role || 'SALES'
      }
    });
    
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        role: user.role,
        iat: Math.floor(Date.now() / 1000), // Issued at time
        exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours from now
      },
      process.env.JWT_SECRET!,
      { algorithm: 'HS256' }
    );
    
    res.status(201).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      token
    });
  } catch (error) {
    res.status(400).json({ error: 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await prisma.user.findUnique({
      where: { email }
    });
    
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        role: user.role,
        iat: Math.floor(Date.now() / 1000), // Issued at time
        exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours from now
      },
      process.env.JWT_SECRET!,
      { algorithm: 'HS256' }
    );
    
    // Log login activity
    await prisma.activity.create({
      data: {
        userId: user.id,
        type: 'LOGIN',
        description: `User ${user.name} logged in`,
        details: JSON.stringify({
        email: user.email,
        role: user.role
        })
      }
    });

    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(400).json({ error: 'Login failed' });
  }
});

// Logout
router.post('/logout', authMiddleware, async (req, res) => {
  try {
    // Log logout activity
    await prisma.activity.create({
      data: {
        userId: req.user!.id,
        type: 'LOGOUT',
        description: `User ${req.user!.name} logged out`,
        details: JSON.stringify({
          email: req.user!.email,
          role: req.user!.role
        })
      }
    });

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(400).json({ error: 'Logout failed' });
  }
});

// Get current user
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true
      }
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get user data' });
  }
});

export default router;