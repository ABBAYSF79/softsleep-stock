import { OrderStatus, Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();
const OBJECTIVE = 50;
const SEED_PREFIX = "OBJECTIVE-SEED-";

const objectiveUsers = [
  { key: "leader", name: "Objective Leader", email: "objective.leader@matles.test", delivered: 67 },
  { key: "complete", name: "Objective Complete", email: "objective.complete@matles.test", delivered: 50 },
  { key: "progress", name: "Objective Progress", email: "objective.progress@matles.test", delivered: 32 },
  { key: "starter", name: "Objective Starter", email: "objective.starter@matles.test", delivered: 8 },
  { key: "new", name: "Objective New", email: "objective.new@matles.test", delivered: 0 },
];

function currentMonthDate(index: number) {
  const now = new Date();
  const maxDay = Math.max(1, now.getDate());
  const day = 1 + (index % maxDay);
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    day,
    9 + (index % 9),
    (index * 7) % 60,
    0,
    0
  );
}

async function getOrCreateUser(
  email: string,
  name: string,
  role: "ADMIN" | "SALES"
) {
  const password = await bcrypt.hash("sales123", 10);
  return prisma.user.upsert({
    where: { email },
    update: {
      name,
      active: true,
      role,
    },
    create: {
      name,
      email,
      password,
      role,
    },
  });
}

async function getOrCreateConfirmationUser(
  user: (typeof objectiveUsers)[number],
  salesmanId: number
) {
  const existing = await prisma.confirmationUser.findFirst({
    where: { email: user.email },
  });

  if (existing) {
    return prisma.confirmationUser.update({
      where: { id: existing.id },
      data: {
        name: user.name,
        active: true,
        salesmanId,
      },
    });
  }

  return prisma.confirmationUser.create({
    data: {
      name: user.name,
      email: user.email,
      phone: `+212600000${String(objectiveUsers.indexOf(user) + 1).padStart(2, "0")}`,
      active: true,
      salesmanId,
    },
  });
}

async function getOrCreateProductVariant() {
  const product = await prisma.product.upsert({
    where: { sku: "OBJECTIVE-SEED-PRODUCT" },
    update: {
      name: "Objective Test Mattress",
      inStock: true,
      archived: false,
    },
    create: {
      name: "Objective Test Mattress",
      sku: "OBJECTIVE-SEED-PRODUCT",
      description: "Product used by the confirmation objective test seed.",
      inStock: true,
      variants: {
        create: {
          name: "Standard",
          skuExt: "-OBJECTIVE",
          price: new Prisma.Decimal("399.00"),
          weight: new Prisma.Decimal("1.00"),
          stock: 1000,
        },
      },
    },
  });

  const existingVariant = await prisma.productVariant.findFirst({
    where: {
      productId: product.id,
      skuExt: "-OBJECTIVE",
    },
  });

  if (existingVariant) return existingVariant;

  return prisma.productVariant.create({
    data: {
      productId: product.id,
      name: "Standard",
      skuExt: "-OBJECTIVE",
      price: new Prisma.Decimal("399.00"),
      weight: new Prisma.Decimal("1.00"),
      stock: 1000,
    },
  });
}

async function createObjectiveOrder(
  index: number,
  confirmationUserId: number,
  salesUserId: number,
  variantId: number,
  createdAt: Date
) {
  return prisma.order.create({
    data: {
      userId: salesUserId,
      customerName: `Objective Customer ${index + 1}`,
      status: OrderStatus.DELIVERED,
      totalAmount: new Prisma.Decimal("399.00"),
      commission: new Prisma.Decimal("39.90"),
      createdAt,
      address: `Objective Test Address ${index + 1}`,
      phone: `06${String(10000000 + index).slice(-8)}`,
      city: "Casablanca",
      trackingCode: `${SEED_PREFIX}${index + 1}`,
      confirmationUserId,
      orderItems: {
        create: {
          variantId,
          quantity: 1,
          price: new Prisma.Decimal("399.00"),
        },
      },
    },
  });
}

async function main() {
  console.log("Creating confirmation objective test data...");

  const adminUser = await getOrCreateUser(
    "objective.admin@matles.test",
    "Objective Test Admin",
    "ADMIN"
  );
  const salesUser = await getOrCreateUser(
    "objective.sales@matles.test",
    "Objective Test Sales",
    "SALES"
  );
  const variant = await getOrCreateProductVariant();
  const confirmationRows = [];

  for (const user of objectiveUsers) {
    const confirmationUser = await getOrCreateConfirmationUser(user, salesUser.id);
    confirmationRows.push({ ...user, id: confirmationUser.id });
  }

  await prisma.order.deleteMany({
    where: {
      trackingCode: {
        startsWith: SEED_PREFIX,
      },
    },
  });

  let orderIndex = 0;
  for (const user of confirmationRows) {
    for (let count = 0; count < user.delivered; count += 1) {
      await createObjectiveOrder(
        orderIndex,
        user.id,
        salesUser.id,
        variant.id,
        currentMonthDate(orderIndex)
      );
      orderIndex += 1;
    }
  }

  console.log("Objective seed completed.");
  console.log(`Admin login: ${adminUser.email} / sales123`);
  console.log(`Sales login: ${salesUser.email} / sales123`);
  console.log(`Monthly objective: ${OBJECTIVE} delivered orders`);
  console.log("Expected results:");
  for (const user of confirmationRows) {
    const bonus = Math.max(user.delivered - OBJECTIVE, 0);
    const remaining = Math.max(OBJECTIVE - user.delivered, 0);
    console.log(
      `  ${user.name}: ${user.delivered}/${OBJECTIVE}` +
        (bonus ? ` (+${bonus} bonus)` : ` (${remaining} remaining)`)
    );
  }
}

main()
  .catch((error) => {
    console.error("Error creating objective seed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
