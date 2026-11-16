/**
 * Read-only report: IN_PROCESS orders missing AmanaParcelTracking,
 * split by inProcessAt vs createdAt fallback. Does NOT write.
 *
 * Usage: npx ts-node scripts/report-amana-backfill-candidates.ts
 */
import { OrderStatus, PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const missing = await prisma.order.findMany({
    where: {
      status: OrderStatus.IN_PROCESS,
      amanaParcelTracking: null,
    },
    select: { id: true, inProcessAt: true, createdAt: true },
  });

  let wouldUseInProcessAt = 0;
  let wouldUseCreatedAtFallback = 0;
  for (const o of missing) {
    if (o.inProcessAt) wouldUseInProcessAt += 1;
    else wouldUseCreatedAtFallback += 1;
  }

  const existingTrackingRecords = await prisma.amanaParcelTracking.count();

  console.log(
    JSON.stringify(
      {
        eligibleMissingTracking: missing.length,
        wouldUseInProcessAt,
        wouldUseCreatedAtFallback,
        existingTrackingRecords,
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
