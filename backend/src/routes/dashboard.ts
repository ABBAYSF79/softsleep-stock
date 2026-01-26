import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth';
import { subDays, startOfMonth, endOfMonth } from 'date-fns';

const router = express.Router();
const prisma = new PrismaClient();

router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const isAdmin = req.user?.role === 'ADMIN';
    const where = isAdmin ? {} : { userId: req.user?.id };
    
    // Get counts
    const [productCount, userCount, orderCount] = await Promise.all([
      isAdmin ? prisma.product.count() : Promise.resolve(0),
      isAdmin ? prisma.user.count() : Promise.resolve(0),
      prisma.order.count({ where })
    ]);
    
    // Get revenue and commission data
    const orders = await prisma.order.findMany({
      where: {
        ...where,
        status: 'DELIVERED'
      }
    });
    
    const totalRevenue = isAdmin ? orders.reduce((sum, order) => sum + Number(order.totalAmount), 0) : 0;
    const totalCommission = orders.reduce((sum, order) => sum + Number(order.commission), 0);
    
    // Get recent orders
    const recentOrders = await prisma.order.findMany({
      where,
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        orderItems: {
          include: {
            variant: {
              include: {
                product: true
              }
            }
          }
        }
      }
    });
    
    // Get sales data for chart (last 7 months)
    const salesData = [];
    for (let i = 6; i >= 0; i--) {
      const start = startOfMonth(subDays(new Date(), i * 30));
      const end = endOfMonth(subDays(new Date(), i * 30));
      
      const monthOrders = await prisma.order.findMany({
        where: {
          ...where,
          createdAt: {
            gte: start,
            lte: end
          },
          status: 'DELIVERED'
        }
      });
      
      const monthRevenue = isAdmin ? monthOrders.reduce((sum, order) => sum + Number(order.totalAmount), 0) : 0;
      const monthCommission = monthOrders.reduce((sum, order) => sum + Number(order.commission), 0);
      
      salesData.push({
        name: start.toLocaleString('default', { month: 'short' }),
        sales: monthRevenue,
        commission: monthCommission
      });
    }
    
    res.json({
      stats: {
        products: productCount,
        users: userCount,
        orders: orderCount,
        revenue: totalRevenue,
        commission: totalCommission
      },
      recentOrders,
      salesData,
      isAdmin
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

export default router;