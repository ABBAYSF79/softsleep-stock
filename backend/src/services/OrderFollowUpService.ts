import { PrismaClient, User, UserRole } from '@prisma/client';
import {
  assertCanAccessOrder,
  getUserDeliveryServiceIds,
  OrderAccessError,
} from '../utils/order-access';

export const FOLLOWUP_CONTENT_MAX = 8000;

export class OrderFollowUpError extends Error {
  constructor(
    message: string,
    public readonly code: string = 'FOLLOWUP_ERROR'
  ) {
    super(message);
    this.name = 'OrderFollowUpError';
  }
}

export function normalizeFollowUpContent(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new OrderFollowUpError('content must be a string', 'INVALID_CONTENT');
  }
  const content = raw.trim();
  if (!content) {
    throw new OrderFollowUpError('content is required', 'EMPTY_CONTENT');
  }
  if (content.length > FOLLOWUP_CONTENT_MAX) {
    throw new OrderFollowUpError(
      `content must be at most ${FOLLOWUP_CONTENT_MAX} characters`,
      'CONTENT_TOO_LONG'
    );
  }
  return content;
}

const followUpInclude = {
  user: { select: { id: true, name: true } },
} as const;

export class OrderFollowUpService {
  constructor(private readonly prisma: PrismaClient) {}

  async listForOrder(orderId: number, user: User) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, userId: true, deliveryServiceId: true },
    });
    if (!order) {
      throw new OrderFollowUpError('Order not found', 'NOT_FOUND');
    }
    await this.assertOrderAccess(user, order);

    return this.prisma.orderFollowUp.findMany({
      where: { orderId },
      include: followUpInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async listForPillowOrder(pillowOrderId: number, user: User) {
    const pillowOrder = await this.prisma.pillowOrder.findUnique({
      where: { id: pillowOrderId },
      select: { id: true, userId: true, deliveryServiceId: true },
    });
    if (!pillowOrder) {
      throw new OrderFollowUpError('Pillow order not found', 'NOT_FOUND');
    }
    await this.assertPillowOrderAccess(user, pillowOrder);

    return this.prisma.orderFollowUp.findMany({
      where: { pillowOrderId },
      include: followUpInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async createForOrder(orderId: number, user: User, rawContent: unknown) {
    const content = normalizeFollowUpContent(rawContent);
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, userId: true, deliveryServiceId: true },
    });
    if (!order) {
      throw new OrderFollowUpError('Order not found', 'NOT_FOUND');
    }
    await this.assertOrderAccess(user, order);

    return this.prisma.orderFollowUp.create({
      data: {
        orderId,
        pillowOrderId: null,
        content,
        userId: user.id,
      },
      include: followUpInclude,
    });
  }

  async createForPillowOrder(pillowOrderId: number, user: User, rawContent: unknown) {
    const content = normalizeFollowUpContent(rawContent);
    const pillowOrder = await this.prisma.pillowOrder.findUnique({
      where: { id: pillowOrderId },
      select: { id: true, userId: true, deliveryServiceId: true },
    });
    if (!pillowOrder) {
      throw new OrderFollowUpError('Pillow order not found', 'NOT_FOUND');
    }
    await this.assertPillowOrderAccess(user, pillowOrder);

    return this.prisma.orderFollowUp.create({
      data: {
        pillowOrderId,
        orderId: null,
        content,
        userId: user.id,
      },
      include: followUpInclude,
    });
  }

  private async assertOrderAccess(
    user: User,
    order: { userId: number; deliveryServiceId: number | null }
  ) {
    const deliveryServiceIds = await getUserDeliveryServiceIds(user.id);
    try {
      assertCanAccessOrder(user, order, deliveryServiceIds);
    } catch (error) {
      if (error instanceof OrderAccessError) {
        throw new OrderFollowUpError(error.message, 'FORBIDDEN');
      }
      throw error;
    }
  }

  private async assertPillowOrderAccess(
    user: User,
    pillowOrder: { userId: number; deliveryServiceId: number | null }
  ) {
    if (user.role === UserRole.ADMIN) return;
    if (user.role === UserRole.SALES) {
      if (pillowOrder.userId !== user.id) {
        throw new OrderFollowUpError('You do not have access to this order', 'FORBIDDEN');
      }
      return;
    }
    if (user.role === UserRole.LIVREUR || user.role === UserRole.SUIVI) {
      const deliveryServiceIds = await getUserDeliveryServiceIds(user.id);
      if (user.role === UserRole.SUIVI && deliveryServiceIds.length === 0) return;
      if (
        !pillowOrder.deliveryServiceId ||
        !deliveryServiceIds.includes(pillowOrder.deliveryServiceId)
      ) {
        throw new OrderFollowUpError('You do not have access to this order', 'FORBIDDEN');
      }
      return;
    }
    throw new OrderFollowUpError('You do not have access to this order', 'FORBIDDEN');
  }
}

export function followUpErrorToHttp(error: unknown): {
  status: number;
  body: { error: string; code?: string };
} | null {
  if (error instanceof OrderFollowUpError) {
    const status =
      error.code === 'NOT_FOUND' ? 404 : error.code === 'FORBIDDEN' ? 403 : 400;
    return { status, body: { error: error.message, code: error.code } };
  }
  return null;
}
