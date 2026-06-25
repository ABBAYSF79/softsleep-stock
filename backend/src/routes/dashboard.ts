import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth';
import { startOfMonth, endOfMonth, subMonths } from 'date-fns';

const router = express.Router();
const prisma = new PrismaClient();

router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const isAdmin = req.user?.role === 'ADMIN';
    const where = isAdmin ? {} : { userId: req.user?.id };

    const now = new Date();
    const currentMonthStart = startOfMonth(now);
    const currentMonthEnd = endOfMonth(now);
    const currentMonthWhere = {
      ...where,
      createdAt: {
        gte: currentMonthStart,
        lte: currentMonthEnd,
      },
    };
    const deliveredCurrentMonthWhere = {
      ...currentMonthWhere,
      status: 'DELIVERED' as const,
    };

    const [productCount, userCount, orderCount, deliveredSummary, recentOrders] = await Promise.all([
      isAdmin ? prisma.product.count() : Promise.resolve(0),
      isAdmin ? prisma.user.count() : Promise.resolve(0),
      prisma.order.count({ where: currentMonthWhere }),
      prisma.order.aggregate({
        where: deliveredCurrentMonthWhere,
        _sum: {
          totalAmount: true,
          commission: true,
        },
      }),
      prisma.order.findMany({
        where,
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          customerName: true,
          totalAmount: true,
          commission: true,
          createdAt: true,
        },
      }),
    ]);

    const totalRevenue = isAdmin
      ? Number(deliveredSummary._sum.totalAmount ?? 0)
      : 0;
    const totalCommission = Number(deliveredSummary._sum.commission ?? 0);

    // Keep chart lightweight: last 4 months using aggregates only.
    const monthRanges = Array.from({ length: 4 }, (_, idx) => {
      const monthDate = subMonths(now, 3 - idx);
      return {
        start: startOfMonth(monthDate),
        end: endOfMonth(monthDate),
      };
    });

    const monthlySummaries = await Promise.all(
      monthRanges.map(({ start, end }) =>
        prisma.order.aggregate({
          where: {
            ...where,
            createdAt: {
              gte: start,
              lte: end,
            },
            status: 'DELIVERED',
          },
          _sum: {
            totalAmount: true,
            commission: true,
          },
        })
      )
    );

    const salesData = monthRanges.map(({ start }, idx) => {
      const summary = monthlySummaries[idx];
      return {
        name: start.toLocaleString('default', { month: 'short' }),
        sales: isAdmin ? Number(summary?._sum.totalAmount ?? 0) : 0,
        commission: Number(summary?._sum.commission ?? 0),
      };
    });

    res.json({
      stats: {
        products: productCount,
        users: userCount,
        orders: orderCount,
        revenue: totalRevenue,
        commission: totalCommission,
      },
      recentOrders,
      salesData,
      isAdmin,
      period: {
        type: 'thisMonth',
        from: currentMonthStart,
        to: currentMonthEnd,
      },
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

export default router;
