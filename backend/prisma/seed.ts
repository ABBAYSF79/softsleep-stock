// backend/prisma/seed.ts
// Large dataset for staging / pre-production testing.
//
// Env (optional):
//   SEED_ORDER_COUNT   — default 1200
//   SEED_PRODUCT_COUNT — default 45
//   SEED_SALES_USERS   — extra sales agents besides Omar & Aisha (default 10 → 12 sales total)
//
// Run (fresh DB recommended): npx prisma migrate reset
// Or: npx prisma db seed

import { PrismaClient, Prisma, OrderStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

const ORDER_COUNT = Math.max(50, parseInt(process.env.SEED_ORDER_COUNT || '1200', 10));
const PRODUCT_COUNT = Math.max(5, parseInt(process.env.SEED_PRODUCT_COUNT || '45', 10));
const EXTRA_SALES = Math.max(0, parseInt(process.env.SEED_SALES_USERS || '10', 10));

const FIRST_NAMES = [
  'Youssef',
  'Fatima',
  'Omar',
  'Aicha',
  'Mehdi',
  'Sara',
  'Karim',
  'Salma',
  'Amine',
  'Nadia',
  'Hicham',
  'Imane',
  'Reda',
  'Khadija',
  'Anas',
  'Loubna',
  'Hamza',
  'Houda',
  'Zakaria',
  'Mounia',
];

const LAST_NAMES = [
  'Alami',
  'Benkirane',
  'Idrissi',
  'Tazi',
  'Chraibi',
  'El Fassi',
  'Berrada',
  'Mouline',
  'Filali',
  'Amrani',
  'Senhaji',
  'Zerouali',
];

const CITIES = [
  'Casablanca',
  'Rabat',
  'Fès',
  'Marrakech',
  'Tanger',
  'Agadir',
  'Meknès',
  'Oujda',
  'Kénitra',
  'Tétouan',
  'Safi',
  'El Jadida',
  'Nador',
  'Beni Mellal',
  'Khénifra',
  'Mohammedia',
  'Essaouira',
  'Taza',
  'Settat',
  'Berrechid',
];

const PRODUCT_PREFIX = ['SoftSleep', 'Premium', 'Luxury', 'Classic', 'Eco', 'Royal', 'Cloud'];
const PRODUCT_KIND = ['Sheet', 'Cover', 'Pillow', 'Set', 'Protector', 'Topper', 'Duvet'];

function randomInt(min: number, max: number) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function randomPick<T>(arr: T[]): T {
  return arr[randomInt(0, arr.length - 1)]!;
}

function randomCustomerName(i: number) {
  return `${randomPick(FIRST_NAMES)} ${randomPick(LAST_NAMES)} #${i}`;
}

function randomStatus(): OrderStatus {
  const r = Math.random();
  if (r < 0.14) return 'PENDING';
  if (r < 0.32) return 'IN_PROCESS';
  if (r < 0.86) return 'DELIVERED';
  return 'RETURNED';
}

function randomOrderDate(maxDaysBack: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - randomInt(0, maxDaysBack));
  d.setHours(randomInt(8, 21), randomInt(0, 59), randomInt(0, 59), 0);
  return d;
}

function weightedVariantPrice(base: number) {
  return new Prisma.Decimal((base + randomInt(-15, 35) + Math.random()).toFixed(2));
}

async function main() {
  console.log('Starting database seed…');
  console.log(
    `Volumes → orders: ${ORDER_COUNT}, products: ${PRODUCT_COUNT}, extra sales: ${EXTRA_SALES}`
  );

  await prisma.commissionSettings.create({
    data: {
      defaultRate: new Prisma.Decimal('10'),
      useFixedAmount: false,
    },
  });

  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.create({
    data: {
      name: 'Admin User',
      email: 'admin@matles.com',
      password: adminPassword,
      role: 'ADMIN',
    },
  });

  const salesPassword = await bcrypt.hash('sales123', 10);
  const omar = await prisma.user.create({
    data: {
      name: 'Omar Khalid',
      email: 'omar@matles.com',
      password: salesPassword,
      role: 'SALES',
    },
  });
  const aisha = await prisma.user.create({
    data: {
      name: 'Aisha Rahman',
      email: 'aisha@matles.com',
      password: salesPassword,
      role: 'SALES',
    },
  });

  const salesUsers = [omar, aisha];
  for (let i = 0; i < EXTRA_SALES; i++) {
    const u = await prisma.user.create({
      data: {
        name: `Sales Agent ${i + 1}`,
        email: `agent${String(i + 1).padStart(2, '0')}@matles.test`,
        password: salesPassword,
        role: 'SALES',
      },
    });
    salesUsers.push(u);
  }
  console.log(`Users → 1 admin, ${salesUsers.length} sales`);

  const delivery1 = await prisma.deliveryService.create({
    data: {
      name: 'Express Delivery',
      active: true,
      cities: JSON.stringify(['Casablanca', 'Rabat', 'Marrakech', 'Tanger']),
    },
  });
  const delivery2 = await prisma.deliveryService.create({
    data: {
      name: 'Standard Shipping',
      active: true,
      cities: JSON.stringify([
        'Casablanca',
        'Rabat',
        'Fès',
        'Meknès',
        'Agadir',
        'Oujda',
        'Kénitra',
      ]),
    },
  });
  const delivery3 = await prisma.deliveryService.create({
    data: {
      name: 'Economy (inactive demo)',
      active: false,
      cities: JSON.stringify(['Casablanca', 'Mohammedia']),
    },
  });

  const manyCities = [
    ...CITIES,
    ...Array.from({ length: 40 }, (_, i) => `VilleTest${String(i + 1).padStart(2, '0')}`),
  ];
  const deliveryBulk = await prisma.deliveryService.create({
    data: {
      name: 'National — many cities',
      active: true,
      cities: JSON.stringify(manyCities),
    },
  });

  const activeDeliveryIds = [delivery1.id, delivery2.id, deliveryBulk.id];

  for (let c = 0; c < 24; c++) {
    await prisma.confirmationUser.create({
      data: {
        name: `Confirm Team ${c + 1}`,
        phone: `+2126${String(randomInt(10_000_000, 99_999_999))}`,
        email: `confirm${c + 1}@matles.test`,
        salesmanId: salesUsers[c % salesUsers.length]!.id,
      },
    });
  }
  console.log('Confirmation users: 24');

  const confirmationRows = await prisma.confirmationUser.findMany({
    select: { id: true },
  });

  console.log(`Creating ${PRODUCT_COUNT} products with variants…`);
  for (let p = 0; p < PRODUCT_COUNT; p++) {
    const name = `${randomPick(PRODUCT_PREFIX)} ${randomPick(PRODUCT_KIND)} ${p + 1}`;
    const sku = `SEED-${String(p + 1).padStart(4, '0')}`;
    const base = 85 + (p % 40) * 12;
    const variantCount = randomInt(2, 4);
    const variantDefs = Array.from({ length: variantCount }, (_, k) => ({
      name: ['S / 90', 'M / 140', 'L / 160', 'XL / 180'][k % 4] ?? `Var ${k + 1}`,
      skuExt: `-V${k + 1}`,
      price: weightedVariantPrice(base + k * 18),
      weight: new Prisma.Decimal((1.2 + k * 0.35).toFixed(2)),
      stock: randomInt(80, 400),
    }));

    await prisma.product.create({
      data: {
        name,
        sku,
        description: `Seed product ${p + 1} — comfort & test data.`,
        inStock: true,
        variants: { create: variantDefs },
      },
    });
  }

  const allVariants = await prisma.productVariant.findMany({
    select: { id: true, price: true },
  });

  if (allVariants.length === 0) {
    throw new Error('No variants created');
  }

  console.log(`Stock history (INITIAL) for ${allVariants.length} variants…`);
  const withStock = await prisma.productVariant.findMany({
    select: { id: true, stock: true },
  });
  const historyData = withStock.map((v) => ({
    variantId: v.id,
    quantity: v.stock,
    type: 'INITIAL' as const,
    reason: 'Seed initial stock',
    previousStock: 0,
    newStock: v.stock,
    userId: admin.id,
  }));
  for (let i = 0; i < historyData.length; i += 500) {
    await prisma.stockHistory.createMany({ data: historyData.slice(i, i + 500) });
  }

  console.log(`Creating ${ORDER_COUNT} orders (batched)…`);
  const TX_SIZE = 40;
  let created = 0;
  for (let start = 0; start < ORDER_COUNT; start += TX_SIZE) {
    const end = Math.min(start + TX_SIZE, ORDER_COUNT);
    await prisma.$transaction(
      Array.from({ length: end - start }, (_, j) => {
        const o = start + j;
        const lineCount = randomInt(1, 4);
        const used = new Set<number>();
        const lines: { variantId: number; quantity: number; price: Prisma.Decimal }[] = [];
        let total = 0;
        let commission = 0;

        for (let L = 0; L < lineCount; L++) {
          let tries = 0;
          let v = randomPick(allVariants);
          while (used.has(v.id) && tries < 30) {
            v = randomPick(allVariants);
            tries++;
          }
          used.add(v.id);
          const qty = randomInt(1, 5);
          const price = Number(v.price);
          const lineTotal = Math.round(price * qty * 100) / 100;
          total += lineTotal;
          commission += Math.round(lineTotal * 0.1 * 100) / 100;
          lines.push({
            variantId: v.id,
            quantity: qty,
            price: new Prisma.Decimal(price.toFixed(2)),
          });
        }

        const status = randomStatus();
        const createdAt = randomOrderDate(150);
        const hasTracking =
          (status === 'IN_PROCESS' || status === 'DELIVERED') && Math.random() < 0.75;

        const deliveryServiceId =
          Math.random() < 0.92 ? randomPick(activeDeliveryIds) : null;

        return prisma.order.create({
          data: {
            userId: randomPick(salesUsers)!.id,
            customerName: randomCustomerName(o),
            status,
            totalAmount: new Prisma.Decimal(total.toFixed(2)),
            commission: new Prisma.Decimal(commission.toFixed(2)),
            createdAt,
            address: `Av. Seed ${(o % 200) + 1}, rés. Test`,
            phone: `06${randomInt(10_000_000, 99_999_999)}`,
            trackingCode: hasTracking ? `TRK-SEED-${o}-${randomInt(1000, 9999)}` : null,
            city: randomPick(CITIES),
            deliveryServiceId,
            note: o % 17 === 0 ? 'Commande seed — note test.' : null,
            confirmationUserId:
              Math.random() < 0.45 ? randomPick(confirmationRows)!.id : null,
            orderItems: { create: lines },
          },
        });
      })
    );
    created = end;
    if (created % 200 === 0 || created === ORDER_COUNT) {
      console.log(`  … ${created} / ${ORDER_COUNT} orders`);
    }
  }

  const activityTypes = ['ORDER_VIEW', 'LOGIN', 'STOCK_CHECK', 'SETTINGS_VIEW'];
  const activityCount = Math.min(500, Math.floor(ORDER_COUNT / 3));
  for (let a = 0; a < activityCount; a++) {
    await prisma.activity.create({
      data: {
        userId: randomPick(salesUsers)!.id,
        type: randomPick(activityTypes),
        description: `Seed activity ${a + 1}`,
        details: JSON.stringify({ seed: true, idx: a }),
        createdAt: randomOrderDate(60),
      },
    });
  }

  console.log('Seed summary:');
  console.log(`  • Users: admin@matles.com / admin123`);
  console.log(`  • Sales: omar@matles.com, aisha@matles.com / sales123`);
  console.log(`  • Extra sales: agent01@matles.test … (${EXTRA_SALES} accounts) / sales123`);
  console.log(`  • Products: ${PRODUCT_COUNT}, variants: ${allVariants.length}`);
  console.log(`  • Orders: ${ORDER_COUNT}`);
  console.log('Database seed completed successfully.');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
