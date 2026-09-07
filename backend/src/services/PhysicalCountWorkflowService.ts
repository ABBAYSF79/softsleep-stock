import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { OpeningInventoryService, OpeningInventoryFile } from './OpeningInventoryService';

/**
 * Operator physical-count sheets (TASK 15).
 * Does NOT invent quantities — zeros are placeholders for counting.
 */
export class PhysicalCountWorkflowService {
  private readonly opening: OpeningInventoryService;

  constructor(private readonly prisma: PrismaClient) {
    this.opening = new OpeningInventoryService(prisma);
  }

  async generateCountSheet() {
    const pillows = await this.prisma.pillow.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, name: true },
    });
    const locations = [
      { code: 'WH-MAIN', presentationAllowed: false },
      { code: 'SR-MAIN', presentationAllowed: true },
    ] as const;

    const rows = [];
    for (const p of pillows) {
      for (const loc of locations) {
        rows.push({
          pillowId: p.id,
          pillowName: p.name,
          location: loc.code,
          physicalCount: null as number | null,
          presentationCount: loc.presentationAllowed ? (null as number | null) : 0,
          notes: '',
          countedBy: '',
          countedAt: '',
          rules: loc.presentationAllowed
            ? 'presentation <= physical'
            : 'presentation must be 0',
        });
      }
    }

    return {
      version: 1,
      note: 'Fill physicalCount from real count. Do not copy Pillow.stock. available/reserved/inTransit are system-derived — do not enter them.',
      generatedAt: new Date().toISOString(),
      locations: locations.map((l) => l.code),
      rows,
    };
  }

  async writeCountSheetJson(outPath: string) {
    const sheet = await this.generateCountSheet();
    const abs = path.resolve(outPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, JSON.stringify(sheet, null, 2), 'utf8');
    return { path: abs, rowCount: sheet.rows.length };
  }

  /**
   * Build opening-inventory.json scaffold from count sheet (still zeros unless filled).
   */
  async openingTemplateFromDb(cutoverDate?: string): Promise<OpeningInventoryFile> {
    return this.opening.generateTemplateFromDb(cutoverDate);
  }

  /**
   * Compare legacy Pillow.stock vs an opening file (informational only).
   */
  async compareLegacyVsOpening(filePath: string) {
    const file = this.opening.loadFile(filePath);
    const pillows = await this.prisma.pillow.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, name: true, stock: true },
    });
    const rows = pillows.map((p) => {
      const wh = file.locations['WH-MAIN'][String(p.id)]?.physical ?? 0;
      const sr = file.locations['SR-MAIN'][String(p.id)]?.physical ?? 0;
      const companyPhysical = wh + sr;
      const difference = companyPhysical - p.stock;
      return {
        pillowId: p.id,
        pillowName: p.name,
        legacyStock: p.stock,
        warehousePhysical: wh,
        showroomPhysical: sr,
        companyPhysical,
        difference,
        status: difference === 0 ? 'MATCH' : 'RECONCILIATION_REQUIRED',
      };
    });
    return {
      note: 'Informational only. Never auto-convert legacy stock into opening physical. Administrator decides.',
      fileHash: this.opening.fileHash(file),
      rows,
    };
  }
}
