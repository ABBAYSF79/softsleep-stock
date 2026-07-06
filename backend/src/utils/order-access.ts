import { OrderStatus, PrismaClient, User, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

export async function getUserDeliveryServiceIds(userId: number): Promise<number[]> {
  const rows = await prisma.userDeliveryService.findMany({
    where: { userId },
    select: { deliveryServiceId: true },
  });
  return rows.map((row) => row.deliveryServiceId);
}

/** @deprecated Use getUserDeliveryServiceIds */
export const getLivreurDeliveryServiceIds = getUserDeliveryServiceIds;

export async function buildOrderAccessWhere(user: User): Promise<Record<string, unknown>> {
  if (user.role === UserRole.ADMIN) {
    return {};
  }

  if (user.role === UserRole.SALES) {
    return { userId: user.id };
  }

  if (user.role === UserRole.LIVREUR) {
    const deliveryServiceIds = await getUserDeliveryServiceIds(user.id);
    if (deliveryServiceIds.length === 0) {
      return { deliveryServiceId: { in: [] } };
    }
    return { deliveryServiceId: { in: deliveryServiceIds } };
  }

  if (user.role === UserRole.SUIVI) {
    const deliveryServiceIds = await getUserDeliveryServiceIds(user.id);
    if (deliveryServiceIds.length === 0) {
      return {};
    }
    return { deliveryServiceId: { in: deliveryServiceIds } };
  }

  return { userId: user.id };
}

export function assertCanAccessOrder(
  user: User,
  order: { deliveryServiceId: number | null; userId: number },
  deliveryServiceIds: number[]
): void {
  if (user.role === UserRole.ADMIN) {
    return;
  }

  if (user.role === UserRole.SALES) {
    if (order.userId !== user.id) {
      throw new OrderAccessError('You do not have access to this order');
    }
    return;
  }

  if (user.role === UserRole.LIVREUR) {
    if (!order.deliveryServiceId || !deliveryServiceIds.includes(order.deliveryServiceId)) {
      throw new OrderAccessError('You do not have access to this order');
    }
    return;
  }

  if (user.role === UserRole.SUIVI) {
    if (deliveryServiceIds.length === 0) {
      return;
    }
    if (!order.deliveryServiceId || !deliveryServiceIds.includes(order.deliveryServiceId)) {
      throw new OrderAccessError('You do not have access to this order');
    }
    return;
  }

  throw new OrderAccessError('You do not have access to this order');
}

export function assertLivreurStatusTransition(oldStatus: OrderStatus, newStatus: OrderStatus): void {
  if (oldStatus === OrderStatus.PENDING && newStatus === OrderStatus.DELIVERED) {
    return;
  }
  throw new OrderAccessError('Livreur can only change status from PENDING to DELIVERED');
}

export function assertSuiviStatusTransition(oldStatus: OrderStatus, newStatus: OrderStatus): void {
  if (oldStatus === OrderStatus.PENDING && newStatus === OrderStatus.IN_PROCESS) {
    return;
  }
  throw new OrderAccessError('Suivi can only change status from PENDING to IN_PROCESS');
}

export function denyLivreurMutation(user: User): void {
  if (user.role === UserRole.LIVREUR) {
    throw new OrderAccessError('Livreur cannot perform this action');
  }
}

export function denySuiviRestrictedMutation(user: User): void {
  if (user.role === UserRole.SUIVI) {
    throw new OrderAccessError('Suivi cannot perform this action');
  }
}

export async function resolveOrderSellerUserId(user: User): Promise<number> {
  if (user.role !== UserRole.SUIVI) {
    return user.id;
  }

  if (!user.linkedSalesUserId) {
    throw new OrderAccessError('Suivi user has no linked admin account configured');
  }

  const linkedAdmin = await prisma.user.findFirst({
    where: {
      id: user.linkedSalesUserId,
      role: UserRole.ADMIN,
      active: true,
    },
    select: { id: true },
  });

  if (!linkedAdmin) {
    throw new OrderAccessError('Linked admin account is invalid or inactive');
  }

  return linkedAdmin.id;
}

export async function assertSuiviDeliveryServiceAccess(
  user: User,
  deliveryServiceId: number
): Promise<void> {
  if (user.role !== UserRole.SUIVI) {
    return;
  }

  const assignedIds = await getUserDeliveryServiceIds(user.id);
  if (assignedIds.length === 0) {
    return;
  }
  if (!assignedIds.includes(deliveryServiceId)) {
    throw new OrderAccessError('You do not have access to this delivery service');
  }
}

export class OrderAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrderAccessError';
  }
}
