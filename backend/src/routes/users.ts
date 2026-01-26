// backend/src/routes/users.ts
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, adminOnly } from '../middleware/auth';
import bcrypt from 'bcryptjs';

const router = express.Router();
const prisma = new PrismaClient();

// Get all users (admin only)
router.get('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: {
        active: true
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        lastActive: true,
        createdAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    res.json(users);
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
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        lastActive: true,
        createdAt: true
      }
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Create user (admin only)
router.post('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });
    
    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: role || 'SALES'
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true
      }
    });
    
    res.status(201).json(user);
  } catch (error) {
    console.error('Create user error:', error);
    res.status(400).json({ error: 'Failed to create user' });
  }
});

// Update user (admin only)
router.put('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role, password } = req.body;
    
    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: parseInt(id) }
    });
    
    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Check if email is taken by another user
    if (email !== existingUser.email) {
      const emailExists = await prisma.user.findUnique({
        where: { email }
      });
      
      if (emailExists) {
        return res.status(400).json({ error: 'Email already exists' });
      }
    }
    
    // Prepare update data
    const updateData: any = {
      name,
      email,
      role
    };
    
    // Only update password if provided
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }
    
    const user = await prisma.user.update({
      where: { id: parseInt(id) },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        lastActive: true,
        createdAt: true
      }
    });
    
    res.json(user);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(400).json({ error: 'Failed to update user' });
  }
});

// Delete user (admin only)
router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Don't allow deleting the current user
    if (parseInt(id) === req.user!.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    
    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: parseInt(id) }
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Soft delete by setting active to false
    await prisma.user.update({
      where: { id: parseInt(id) },
      data: { active: false }
    });
    
    res.json({ message: 'User deactivated successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(400).json({ error: 'Failed to deactivate user' });
  }
});

export default router;