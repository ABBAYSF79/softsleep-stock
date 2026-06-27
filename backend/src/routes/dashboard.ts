import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth';
import { startOfMonth, endOfMonth, subMonths, startOfDay, endOfDay, format, startOfYear } from 'date-fns';

const router = express.Router();
const prisma = new PrismaClient();

router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const isAdmin = req.user?.role === 'ADMIN';
    const where = isAdmin ? {} : { userId: req.user?.id };

    const now = new Date();
    const currentMonthStart = startOfMonth(now);
    const currentMonthEnd = endOfDay(endOfMonth(now));
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    const currentMonthWhere = {
      ...where,
      createdAt: {
        gte: currentMonthStart,
        lte: currentMonthEnd,
      },
    };
    const todayWhere = {
      ...where,
      createdAt: {
        gte: todayStart,
        lte: todayEnd,
      },
    };
    const deliveredCurrentMonthWhere = {
      ...currentMonthWhere,
      status: 'DELIVERED' as const,
    };

    const [
      productCount,
      userCount,
      orderCount,
      ordersToday,
      deliveredThisMonth,
      deliveredSummary,
      statusGroups,
      paidDeliveredCount,
      unpaidDeliveredCount,
      paidRevenueAgg,
      unpaidRevenueAgg,
      sellerGroups,
      confirmationGroups,
      recentOrders,
    ] = await Promise.all([
      isAdmin ? prisma.product.count() : Promise.resolve(0),
      isAdmin ? prisma.user.count() : Promise.resolve(0),
      prisma.order.count({ where: currentMonthWhere }),
      prisma.order.count({ where: todayWhere }),
      prisma.order.count({ where: deliveredCurrentMonthWhere }),
      prisma.order.aggregate({
        where: deliveredCurrentMonthWhere,
        _sum: {
          totalAmount: true,
          commission: true,
        },
      }),
      prisma.order.groupBy({
        by: ['status'],
        where: currentMonthWhere,
        _count: { id: true },
      }),
      prisma.order.count({
        where: { ...deliveredCurrentMonthWhere, isPaid: true },
      }),
      prisma.order.count({
        where: { ...deliveredCurrentMonthWhere, isPaid: false },
      }),
      prisma.order.aggregate({
        where: { ...deliveredCurrentMonthWhere, isPaid: true },
        _sum: { totalAmount: true },
      }),
      prisma.order.aggregate({
        where: { ...deliveredCurrentMonthWhere, isPaid: false },
        _sum: { totalAmount: true },
      }),
      isAdmin
        ? prisma.order.groupBy({
            by: ['userId'],
            where: deliveredCurrentMonthWhere,
            _count: { id: true },
            _sum: { totalAmount: true, commission: true },
            orderBy: { _count: { id: 'desc' } },
          })
        : Promise.resolve([]),
      isAdmin
        ? prisma.order.groupBy({
            by: ['confirmationUserId'],
            where: {
              ...deliveredCurrentMonthWhere,
              confirmationUserId: { not: null },
            },
            _count: { id: true },
            _sum: { totalAmount: true, commission: true },
            orderBy: { _count: { id: 'desc' } },
          })
        : Promise.resolve([]),
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
          status: true,
        },
      }),
    ]);

    const statusCounts = {
      PENDING: 0,
      IN_PROCESS: 0,
      DELIVERED: 0,
      RETURNED: 0,
    };
    for (const group of statusGroups) {
      const key = group.status as keyof typeof statusCounts;
      if (key in statusCounts) {
        statusCounts[key] = group._count.id;
      }
    }

    const totalRevenue = isAdmin
      ? Number(deliveredSummary._sum.totalAmount ?? 0)
      : 0;
    const totalCommission = Number(deliveredSummary._sum.commission ?? 0);
    const paidRevenueThisMonth = isAdmin
      ? Number(paidRevenueAgg._sum.totalAmount ?? 0)
      : 0;
    const unpaidRevenueThisMonth = isAdmin
      ? Number(unpaidRevenueAgg._sum.totalAmount ?? 0)
      : 0;

    const topSellerIds = sellerGroups.slice(0, 5).map((g) => g.userId);
    const topConfirmationIds = confirmationGroups
      .slice(0, 5)
      .map((g) => g.confirmationUserId!)
      .filter(Boolean);

    const [sellerUsers, confirmationUsers] = await Promise.all([
      topSellerIds.length
        ? prisma.user.findMany({
            where: { id: { in: topSellerIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      topConfirmationIds.length
        ? prisma.confirmationUser.findMany({
            where: { id: { in: topConfirmationIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]);

    const sellerNameMap = new Map(sellerUsers.map((u) => [u.id, u.name]));
    const confirmationNameMap = new Map(
      confirmationUsers.map((u) => [u.id, u.name])
    );

    const topSellers = sellerGroups.slice(0, 5).map((g) => ({
      userId: g.userId,
      name: sellerNameMap.get(g.userId) ?? 'Unknown',
      deliveredCount: g._count.id,
      revenue: isAdmin ? Number(g._sum.totalAmount ?? 0) : 0,
      commission: Number(g._sum.commission ?? 0),
    }));

    const topConfirmationUsers = confirmationGroups.slice(0, 5).map((g) => ({
      id: g.confirmationUserId!,
      name: confirmationNameMap.get(g.confirmationUserId!) ?? 'Unknown',
      deliveredCount: g._count.id,
      revenue: isAdmin ? Number(g._sum.totalAmount ?? 0) : 0,
      commission: Number(g._sum.commission ?? 0),
    }));

    const statusBreakdown = statusGroups.map((g) => ({
      status: g.status,
      count: g._count.id,
    }));

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

    const yearStart = startOfYear(now);
    const yearEnd = endOfDay(now);
    const yearReturnWhere = {
      ...where,
      status: 'RETURNED' as const,
      createdAt: {
        gte: yearStart,
        lte: yearEnd,
      },
    };

    const yearMonthRanges = Array.from({ length: 12 }, (_, idx) => {
      const monthDate = new Date(now.getFullYear(), idx, 1);
      const start = startOfMonth(monthDate);
      const end = endOfDay(endOfMonth(monthDate));
      return {
        start,
        end: end > now ? yearEnd : end,
        label: format(monthDate, 'MMM'),
        monthIndex: idx,
      };
    });

    const [monthlyReturnCounts, cityReturnGroups, returnedThisYear] =
      await Promise.all([
        Promise.all(
          yearMonthRanges.map(({ start, end }) =>
            prisma.order.count({
              where: {
                ...yearReturnWhere,
                createdAt: { gte: start, lte: end },
              },
            })
          )
        ),
        prisma.order.groupBy({
          by: ['city'],
          where: {
            ...yearReturnWhere,
            city: { not: null },
          },
          _count: { id: true },
          orderBy: { _count: { id: 'desc' } },
        }),
        prisma.order.count({ where: yearReturnWhere }),
      ]);

    const returnsByMonth = yearMonthRanges.map(({ label }, idx) => ({
      name: label,
      returns: monthlyReturnCounts[idx] ?? 0,
    }));

    const topReturnCities = cityReturnGroups
      .filter((g) => g.city && g.city.trim().length > 0)
      .slice(0, 10)
      .map((g) => ({
        city: g.city!.trim(),
        count: g._count.id,
      }));

    res.json({
      stats: {
        products: productCount,
        users: userCount,
        orders: orderCount,
        revenue: totalRevenue,
        commission: totalCommission,
        ordersToday,
        deliveredThisMonth,
        pendingThisMonth: statusCounts.PENDING,
        inProcessThisMonth: statusCounts.IN_PROCESS,
        returnedThisMonth: statusCounts.RETURNED,
        returnedThisYear,
        paidDeliveredThisMonth: paidDeliveredCount,
        unpaidDeliveredThisMonth: unpaidDeliveredCount,
        paidRevenueThisMonth,
        unpaidRevenueThisMonth,
      },
      topSellers,
      topConfirmationUsers,
      statusBreakdown,
      returnsByMonth,
      topReturnCities,
      recentOrders,
      salesData,
      isAdmin,
      period: {
        type: 'thisMonth',
        from: currentMonthStart,
        to: currentMonthEnd,
        label: format(now, 'MMMM yyyy'),
        year: now.getFullYear(),
      },
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

export default router;
