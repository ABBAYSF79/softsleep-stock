import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { OrderStatus, PrismaClient, UserRole } from '@prisma/client';

dotenv.config();

const prisma = new PrismaClient();
const API_BASE = process.env.API_BASE_URL || 'http://localhost:3001/api';
const TEST_EMAIL = `livreur-test-${Date.now()}@test.local`;

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
  let orderUnassignedId = 0;
  let livreurId = 0;
  let salesUserId = 0;
  let variantId = 0;

  try {
    const salesUser =
      (await prisma.user.findFirst({ where: { role: UserRole.SALES, active: true } })) ||
      (await prisma.user.findFirst({ where: { role: UserRole.ADMIN, active: true } }));

    if (!salesUser) {
      throw new Error('No active sales/admin user found for test order creation');
    }
    salesUserId = salesUser.id;

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
        name: `Livreur Test Service A ${suffix}`,
        cities: JSON.stringify(['Casablanca']),
        active: true,
      },
    });
    const serviceB = await prisma.deliveryService.create({
      data: {
        name: `Livreur Test Service B ${suffix}`,
        cities: JSON.stringify(['Rabat']),
        active: true,
      },
    });
    serviceAId = serviceA.id;
    serviceBId = serviceB.id;

    const createTestOrder = async (deliveryServiceId: number | null) => {
      return prisma.order.create({
        data: {
          userId: salesUserId,
          customerName: `Livreur Test Customer ${suffix}`,
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
    const orderUnassigned = await createTestOrder(null);
    orderAId = orderA.id;
    orderBId = orderB.id;
    orderUnassignedId = orderUnassigned.id;

    const livreur = await prisma.user.create({
      data: {
        name: `Livreur Test ${suffix}`,
        email: TEST_EMAIL,
        password: await bcrypt.hash('livreur-test-pass', 10),
        role: UserRole.LIVREUR,
        deliveryServices: {
          create: [{ deliveryServiceId: serviceAId }],
        },
      },
    });
    livreurId = livreur.id;

    const token = signToken(livreur);

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
        !listedIds.includes(orderBId) &&
        !listedIds.includes(orderUnassignedId),
      `status=${listResponse.status}, ids=${listedIds.join(',')}`
    );

    const getAllowed = await apiRequest(`/orders/${orderAId}`, token);
    record(
      'GET /orders/:id allowed for assigned service order',
      getAllowed.status === 200,
      `status=${getAllowed.status}`
    );

    const getDenied = await apiRequest(`/orders/${orderBId}`, token);
    record(
      'GET /orders/:id denied for unassigned service order',
      getDenied.status === 403,
      `status=${getDenied.status}`
    );

    const deliverAllowed = await apiRequest(`/orders/${orderAId}/status`, token, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'DELIVERED' }),
    });
    record(
      'PATCH status PENDING -> DELIVERED allowed for assigned order',
      deliverAllowed.status === 200,
      `status=${deliverAllowed.status}`
    );

    const deliverDenied = await apiRequest(`/orders/${orderBId}/status`, token, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'DELIVERED' }),
    });
    record(
      'PATCH status denied for unassigned service order',
      deliverDenied.status === 403,
      `status=${deliverDenied.status}`
    );

    const orderA2 = await createTestOrder(serviceAId);
    const inProcessDenied = await apiRequest(`/orders/${orderA2.id}/status`, token, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'IN_PROCESS' }),
    });
    record(
      'PATCH status to IN_PROCESS denied for livreur',
      inProcessDenied.status === 403,
      `status=${inProcessDenied.status}`
    );

    await prisma.order.delete({ where: { id: orderA2.id } }).catch(() => undefined);

    const orderA3 = await createTestOrder(serviceAId);
    const noteAllowed = await apiRequest(`/orders/${orderA3.id}/status`, token, {
      method: 'PATCH',
      body: JSON.stringify({ note: 'Client absent - livreur test' }),
    });
    record(
      'PATCH note allowed for livreur on assigned order',
      noteAllowed.status === 200,
      `status=${noteAllowed.status}`
    );

    const noteDenied = await apiRequest(`/orders/${orderBId}/status`, token, {
      method: 'PATCH',
      body: JSON.stringify({ note: 'Should fail' }),
    });
    record(
      'PATCH note denied for unassigned service order',
      noteDenied.status === 403,
      `status=${noteDenied.status}`
    );

    await prisma.order.delete({ where: { id: orderA3.id } }).catch(() => undefined);

    const meResponse = await apiRequest('/auth/me', token);
    record(
      'GET /auth/me includes deliveryServiceIds for livreur',
      meResponse.status === 200 &&
        Array.isArray(meResponse.body?.deliveryServiceIds) &&
        meResponse.body.deliveryServiceIds.includes(serviceAId),
      `status=${meResponse.status}`
    );
  } catch (error) {
    console.error('Test setup/runtime error:', error);
    record('Test script execution', false, (error as Error).message);
  } finally {
    if (orderAId) await prisma.order.delete({ where: { id: orderAId } }).catch(() => undefined);
    if (orderBId) await prisma.order.delete({ where: { id: orderBId } }).catch(() => undefined);
    if (orderUnassignedId) {
      await prisma.order.delete({ where: { id: orderUnassignedId } }).catch(() => undefined);
    }
    if (livreurId) {
      await prisma.userDeliveryService.deleteMany({ where: { userId: livreurId } });
      await prisma.user.delete({ where: { id: livreurId } }).catch(() => undefined);
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
