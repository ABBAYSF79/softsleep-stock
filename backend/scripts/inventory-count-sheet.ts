/**
 * Generate physical count sheet scaffold (TASK 15).
 * Does not invent stock quantities.
 *
 * Usage: npm run inventory:count-sheet
 */
import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PhysicalCountWorkflowService } from '../src/services/PhysicalCountWorkflowService';
import { OpeningInventoryService } from '../src/services/OpeningInventoryService';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const count = new PhysicalCountWorkflowService(prisma);
  const opening = new OpeningInventoryService(prisma);
  const sheetPath = path.resolve(__dirname, '../data/physical-count-sheet.template.json');
  const openingTemplatePath = path.resolve(__dirname, '../data/opening-inventory.template.json');

  const written = await count.writeCountSheetJson(sheetPath);
  const template = await opening.generateTemplateFromDb();
  const fs = await import('fs');
  fs.writeFileSync(openingTemplatePath, JSON.stringify(template, null, 2), 'utf8');

  console.log('Wrote physical count sheet:', written.path, 'rows=', written.rowCount);
  console.log('Refreshed opening template:', openingTemplatePath);
  console.log('Fill counts from REAL physical inventory. Do NOT copy Pillow.stock.');
  console.log('Then copy opening-inventory.template.json → opening-inventory.json and fill quantities.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
