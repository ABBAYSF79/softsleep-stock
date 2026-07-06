import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { OrderStatus, PrismaClient, UserRole } from '@prisma/client';

dotenv.config();

const prisma = new PrismaClient();
const API_BASE = process.env.API_BASE_URL || 'http://localhost:3001/api';
const TEST_EMAIL = `suivi-test-${Date.now()}@test.local`;

type TestResult = {
  name: string;
  passed: boolean;
  detail?: string;
};

const results: TestResult[] = [];

function record(name: string, passed: boolean, detail?: string) {
  results.push({ name, passed, detail });
  const status = passed ? 'PASS' : 'FAIL';
  console.log(`${status} - ${name}${detail ? `: ${detail}` : ''}`);
}

async function apiRequest(
  path: string,
  token: string,
  options: RequestInit = {}
): Promise<{ status: number; body: any }> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  return { status: response.status, body };
}

function signToken(user: { id: number; email: string; role: UserRole }) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 60 * 60,
    },
    process.env.JWT_SECRET!,
    { algorithm: 'HS256' }
  );
}

async function main() {
  const suffix = Date.now();
  let serviceAId = 0;
  let serviceBId = 0;
  let orderAId = 0;
  let orderBId = 0;
  let suiviId = 0;
  let adminId = 0;
  let variantId = 0;
  let createdOrderId = 0;

  try {
    const adminUser = await prisma.user.findFirst({
      where: { role: UserRole.ADMIN, active: true },
    });

    if (!adminUser) {
      throw new Error('No active admin user found');
    }
    adminId = adminUser.id;

    const variant = await prisma.productVariant.findFirst({
      where: { stock: { gte: 5 } },
      select: { id: true, price: true },
    });

    if (!variant) {
      throw new Error('No product variant with enough stock found');
    }
    variantId = variant.id;

    const serviceA = await prisma.deliveryService.create({
      data: {
        name: `Suivi Test Service A ${suffix}`,
        cities: JSON.stringify(['Casablanca']),
        active: true,
      },
    });
    const serviceB = await prisma.deliveryService.create({
      data: {
        name: `Suivi Test Service B ${suffix}`,
        cities: JSON.stringify(['Rabat']),
        active: true,
      },
    });
    serviceAId = serviceA.id;
    serviceBId = serviceB.id;

    const createTestOrder = async (deliveryServiceId: number) => {
      return prisma.order.create({
        data: {
          userId: adminId,
          customerName: `Suivi Test Customer ${suffix}`,
          status: OrderStatus.PENDING,
          totalAmount: variant.price,
          commission: 10,
          deliveryServiceId,
          city: 'Casablanca',
          orderItems: {
            create: {
              variantId,
              quantity: 1,
              price: variant.price,
            },
          },
        },
      });
    };

    const orderA = await createTestOrder(serviceAId);
    const orderB = await createTestOrder(serviceBId);
    orderAId = orderA.id;
    orderBId = orderB.id;

    const suivi = await prisma.user.create({
      data: {
        name: `Suivi Test ${suffix}`,
        email: TEST_EMAIL,
        password: await bcrypt.hash('suivi-test-pass', 10),
        role: UserRole.SUIVI,
        linkedSalesUserId: adminId,
        deliveryServices: {
          create: [{ deliveryServiceId: serviceAId }],
        },
      },
    });
    suiviId = suivi.id;

    const token = signToken(suivi);

    const listResponse = await apiRequest('/orders?limit=200', token);
    const listedIds = Array.isArray(listResponse.body?.data)
      ? listResponse.body.data.map((order: { id: number }) => order.id)
      : Array.isArray(listResponse.body)
        ? listResponse.body.map((order: { id: number }) => order.id)
        : [];

    record(
      'GET /orders returns only assigned delivery service orders',
      listResponse.status === 200 &&
        listedIds.includes(orderAId) &&
        !listedIds.includes(orderBId),
      `status=${listResponse.status}, ids=${listedIds.join(',')}`
    );

    const createOrder = await apiRequest('/orders', token, {
      method: 'POST',
      body: JSON.stringify({
        customerName: `Suivi Created ${suffix}`,
        phone: '0612345678',
        address: 'Test address',
        deliveryServiceId: serviceAId,
        city: 'Casablanca',
        items: [{ variantId, quantity: 1 }],
      }),
    });

    createdOrderId = createOrder.body?.id;
    record(
      'POST /orders attributes seller to linked admin',
      createOrder.status === 201 &&
        (createOrder.body?.user?.id === adminId || createOrder.body?.salesman?.id === adminId),
      `status=${createOrder.status}, seller=${createOrder.body?.user?.id ?? createOrder.body?.salesman?.id}`
    );

    if (createdOrderId) {
      const createdInDb = await prisma.order.findUnique({
        where: { id: createdOrderId },
        select: { userId: true, enteredByUserId: true },
      });
      record(
        'POST /orders stores enteredByUserId as suivi',
        createdInDb?.userId === adminId && createdInDb?.enteredByUserId === suiviId,
        `userId=${createdInDb?.userId}, enteredByUserId=${createdInDb?.enteredByUserId}`
      );
    }

    const inProcessAllowed = await apiRequest(`/orders/${orderAId}/status`, token, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'IN_PROCESS', trackingCode: `TRK-${suffix}` }),
    });
    record(
      'PATCH status PENDING -> IN_PROCESS allowed with tracking',
      inProcessAllowed.status === 200,
      `status=${inProcessAllowed.status}`
    );

    const deliveredDenied = await apiRequest(`/orders/${orderBId}/status`, token, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'DELIVERED' }),
    });
    record(
      'PATCH status to DELIVERED denied for suivi',
      deliveredDenied.status === 403,
      `status=${deliveredDenied.status}`
    );

    const paymentDenied = await apiRequest(`/orders/${orderAId}/payment`, token, {
      method: 'PATCH',
      body: JSON.stringify({ isPaid: true }),
    });
    record(
      'PATCH payment denied for suivi',
      paymentDenied.status === 403,
      `status=${paymentDenied.status}`
    );

    const deliveryList = await apiRequest('/delivery', token);
    const deliveryIds = Array.isArray(deliveryList.body)
      ? deliveryList.body.map((service: { id: number }) => service.id)
      : [];
    record(
      'GET /delivery returns only assigned services',
      deliveryList.status === 200 &&
        deliveryIds.includes(serviceAId) &&
        !deliveryIds.includes(serviceBId),
      `status=${deliveryList.status}, ids=${deliveryIds.join(',')}`
    );

    const putAllowed = await apiRequest(`/delivery/${serviceAId}`, token, {
      method: 'PUT',
      body: JSON.stringify({
        name: `Suivi Test Service A ${suffix}`,
        active: true,
        cities: ['Casablanca', 'Mohammedia'],
      }),
    });
    record(
      'PUT /delivery/:id allowed on assigned service',
      putAllowed.status === 200,
      `status=${putAllowed.status}`
    );

    const putDenied = await apiRequest(`/delivery/${serviceBId}`, token, {
      method: 'PUT',
      body: JSON.stringify({
        name: `Suivi Test Service B ${suffix}`,
        active: true,
        cities: ['Rabat'],
      }),
    });
    record(
      'PUT /delivery/:id denied on unassigned service',
      putDenied.status === 403,
      `status=${putDenied.status}`
    );

    const meResponse = await apiRequest('/auth/me', token);
    record(
      'GET /auth/me includes deliveryServiceIds and linkedSalesUserId',
      meResponse.status === 200 &&
        Array.isArray(meResponse.body?.deliveryServiceIds) &&
        meResponse.body.deliveryServiceIds.includes(serviceAId) &&
        meResponse.body.linkedSalesUserId === adminId,
      `status=${meResponse.status}`
    );
  } catch (error) {
    console.error('Test setup/runtime error:', error);
    record('Test script execution', false, (error as Error).message);
  } finally {
    if (createdOrderId) {
      await prisma.order.delete({ where: { id: createdOrderId } }).catch(() => undefined);
    }
    if (orderAId) await prisma.order.delete({ where: { id: orderAId } }).catch(() => undefined);
    if (orderBId) await prisma.order.delete({ where: { id: orderBId } }).catch(() => undefined);
    if (suiviId) {
      await prisma.userDeliveryService.deleteMany({ where: { userId: suiviId } });
      await prisma.user.delete({ where: { id: suiviId } }).catch(() => undefined);
    }
    if (serviceAId) {
      await prisma.deliveryService.delete({ where: { id: serviceAId } }).catch(() => undefined);
    }
    if (serviceBId) {
      await prisma.deliveryService.delete({ where: { id: serviceBId } }).catch(() => undefined);
    }

    await prisma.$disconnect();

    const failed = results.filter((result) => !result.passed);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    if (failed.length > 0) {
      process.exit(1);
    }
  }
}

main();
