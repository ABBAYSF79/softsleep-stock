import { Router } from "express";
import rateLimit from "express-rate-limit";
import { OrderStatus, Prisma, PrismaClient } from "@prisma/client";
import { normalizeAccessCode } from "../utils/access-code";

const router = Router();
const prisma = new PrismaClient();

const PAGE_SIZE = 50;
const INVALID_CODE_MESSAGE = "Code invalide ou inactif";

const accessLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Trop de tentatives, réessayez dans une minute" },
});

function parseDate(raw: unknown): Date | null {
  if (typeof raw !== "string" || !raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Public, read-only list of the orders linked to the confirmation user owning `code`.
router.post("/orders", accessLimiter, async (req, res) => {
  try {
    const code = normalizeAccessCode(req.body?.code);
    if (!code) {
      return res.status(403).json({ error: INVALID_CODE_MESSAGE });
    }

    const confirmationUser = await prisma.confirmationUser.findUnique({
      where: { accessCode: code },
      select: { id: true, name: true, active: true },
    });
    if (!confirmationUser || !confirmationUser.active) {
      return res.status(403).json({ error: INVALID_CODE_MESSAGE });
    }

    const from = parseDate(req.body?.from);
    const to = parseDate(req.body?.to);
    const statusRaw = req.body?.status;
    const status =
      typeof statusRaw === "string" &&
      (Object.values(OrderStatus) as string[]).includes(statusRaw)
        ? (statusRaw as OrderStatus)
        : null;
    const pageRaw = Number(req.body?.page);
    const page = Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1;

    const baseWhere: Prisma.OrderWhereInput = {
      confirmationUserId: confirmationUser.id,
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };
    const listWhere: Prisma.OrderWhereInput = status
      ? { ...baseWhere, status }
      : baseWhere;

    const [statusGroups, total, orders] = await Promise.all([
      prisma.order.groupBy({
        by: ["status"],
        where: baseWhere,
        _count: { id: true },
      }),
      prisma.order.count({ where: listWhere }),
      prisma.order.findMany({
        where: listWhere,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          createdAt: true,
          status: true,
          customerName: true,
          phone: true,
          city: true,
          totalAmount: true,
          reportedUntil: true,
          deliveredAt: true,
          orderItems: {
            select: {
              quantity: true,
              variant: {
                select: {
                  name: true,
                  product: { select: { name: true } },
                },
              },
            },
          },
          pillowItems: {
            select: {
              quantity: true,
              pillow: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    const countByStatus = Object.fromEntries(
      Object.values(OrderStatus).map((s) => [s, 0])
    ) as Record<OrderStatus, number>;
    for (const group of statusGroups) {
      countByStatus[group.status] = group._count.id;
    }

    res.json({
      confirmationUser: { name: confirmationUser.name },
      stats: { countByStatus },
      page,
      pageSize: PAGE_SIZE,
      total,
      orders: orders.map((order) => ({
        id: order.id,
        createdAt: order.createdAt,
        status: order.status,
        customerName: order.customerName,
        phone: order.phone,
        city: order.city,
        totalAmount: order.totalAmount,
        reportedUntil: order.reportedUntil,
        deliveredAt: order.deliveredAt,
        items: [
          ...order.orderItems.map((item) => ({
            name: `${item.variant.product.name} - ${item.variant.name}`,
            quantity: item.quantity,
          })),
          ...order.pillowItems.map((item) => ({
            name: item.pillow.name,
            quantity: item.quantity,
          })),
        ],
      })),
    });
  } catch (error) {
    console.error("Error in POST /public/confirmation/orders:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
