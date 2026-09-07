import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Prisma, PrismaClient } from '@prisma/client';
import { computeAvailable } from '../utils/inventory-balance';
import { CUTOVER_SETTINGS_ID } from './InventoryMode';

export const OPENING_REF = 'OPENING_INVENTORY_V1';
export const OPENING_VERSION = 1;

export type OpeningQty = { physical: number; presentation: number };

export type OpeningInventoryFile = {
  version: number;
  cutoverDate: string;
  cutoverAt?: string;
  notes?: string;
  locations: {
    'WH-MAIN': Record<string, OpeningQty>;
    'SR-MAIN': Record<string, OpeningQty>;
  };
};

export type OpeningPlanRow = {
  pillowId: number;
  name: string;
  oldStock: number;
  warehousePhysical: number;
  showroomPhysical: number;
  showroomPresentation: number;
  newCompanyPhysical: number;
  differenceVsOld: number;
  availableWh: number;
  availableSr: number;
  totalAvailable: number;
  status: 'OK' | 'INVALID' | 'ALREADY_CUTOVER' | 'CONFLICT';
  errors: string[];
};

export type PlannedBalance = {
  pillowId: number;
  locationCode: 'WH-MAIN' | 'SR-MAIN';
  physical: number;
  presentation: number;
  reserved: number;
  available: number;
};

export type PlannedMovement = {
  pillowId: number;
  locationCode: 'WH-MAIN' | 'SR-MAIN';
  quantity: number;
  type: 'INITIAL';
  referenceNumber: string;
};

export class OpeningInventoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpeningInventoryError';
  }
}

export function openingReferenceNumber(pillowId: number, label: 'WH' | 'SR'): string {
  return `${OPENING_REF}:pillow:${pillowId}:${label}`;
}

export function validateOpeningQty(
  locationCode: 'WH-MAIN' | 'SR-MAIN',
  qty: OpeningQty
): string[] {
  const errors: string[] = [];
  if (!Number.isInteger(qty.physical) || qty.physical < 0) {
    errors.push('physical must be a non-negative integer');
  }
  if (!Number.isInteger(qty.presentation) || qty.presentation < 0) {
    errors.push('presentation must be a non-negative integer');
  }
  if (locationCode === 'WH-MAIN' && qty.presentation !== 0) {
    errors.push('Warehouse presentation must be 0');
  }
  if (locationCode === 'SR-MAIN' && qty.presentation > qty.physical) {
    errors.push('presentation must be <= showroom physical');
  }
  return errors;
}

/**
 * Clean cutover opening inventory (TASK 9).
 * Does NOT require warehouse+showroom == Pillow.stock.
 * Physical count at cutover is authoritative.
 */
export class OpeningInventoryService {
  constructor(private readonly prisma: PrismaClient) {}

  generateTemplate(cutoverDate: string): OpeningInventoryFile {
    return {
      version: OPENING_VERSION,
      cutoverDate,
      notes:
        'OPERATOR PHYSICAL COUNT. Fill real Warehouse/Showroom quantities. Do NOT copy from Pillow.stock automatically. Warehouse presentation must stay 0. Showroom presentation <= physical.',
      locations: {
        'WH-MAIN': {},
        'SR-MAIN': {},
      },
    };
  }

  async generateTemplateFromDb(cutoverDate?: string): Promise<OpeningInventoryFile> {
    const pillows = await this.prisma.pillow.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, name: true, stock: true },
    });
    const date = cutoverDate || new Date().toISOString().slice(0, 10);
    const file = this.generateTemplate(date);
    for (const p of pillows) {
      file.locations['WH-MAIN'][String(p.id)] = { physical: 0, presentation: 0 };
      file.locations['SR-MAIN'][String(p.id)] = { physical: 0, presentation: 0 };
    }
    file.notes = `${file.notes} Pillows: ${pillows
      .map((p) => `${p.id}=${p.name} (old stock ${p.stock})`)
      .join('; ')}`;
    return file;
  }

  loadFile(filePath: string): OpeningInventoryFile {
    const abs = path.resolve(filePath);
    if (!fs.existsSync(abs)) {
      throw new OpeningInventoryError(`Opening inventory file not found: ${abs}`);
    }
    const raw = JSON.parse(fs.readFileSync(abs, 'utf8')) as OpeningInventoryFile;
    if (!raw || typeof raw !== 'object' || !raw.locations) {
      throw new OpeningInventoryError('Invalid opening inventory file shape');
    }
    if (!raw.cutoverDate || !/^\d{4}-\d{2}-\d{2}$/.test(raw.cutoverDate)) {
      throw new OpeningInventoryError('cutoverDate must be YYYY-MM-DD');
    }
    if (!raw.locations['WH-MAIN'] || !raw.locations['SR-MAIN']) {
      throw new OpeningInventoryError('locations.WH-MAIN and locations.SR-MAIN are required');
    }
    return raw;
  }

  fileHash(file: OpeningInventoryFile): string {
    return crypto.createHash('sha256').update(JSON.stringify(file)).digest('hex');
  }

  /** @deprecated alias — prefer fileHash (full SHA-256 hex) */
  fileHashShort(file: OpeningInventoryFile): string {
    return this.fileHash(file).slice(0, 32);
  }

  async buildPlan(
    file: OpeningInventoryFile,
    options?: { onlyPillowIds?: number[] }
  ): Promise<{
    rows: OpeningPlanRow[];
    plannedBalances: PlannedBalance[];
    plannedMovements: PlannedMovement[];
    canExecute: boolean;
    alreadyCutover: boolean;
    errors: string[];
    cutoverAt: Date;
  }> {
    const errors: string[] = [];
    const settings = await this.prisma.inventoryCutoverSettings.findUnique({
      where: { id: CUTOVER_SETTINGS_ID },
    });

    const openingMoves = await this.prisma.stockMovement.count({
      where: {
        referenceType: OPENING_REF,
        type: 'INITIAL',
        ...(options?.onlyPillowIds?.length ? { pillowId: { in: options.onlyPillowIds } } : {}),
      },
    });
    const alreadyCutoverGlobal =
      !options?.onlyPillowIds?.length &&
      (settings?.mode === 'INVENTORY' ||
        (await this.prisma.stockMovement.count({
          where: { referenceType: OPENING_REF, type: 'INITIAL' },
        })) > 0 ||
        settings?.referenceType === OPENING_REF);

    const wh = await this.prisma.location.findFirst({ where: { code: 'WH-MAIN', active: true } });
    const sr = await this.prisma.location.findFirst({ where: { code: 'SR-MAIN', active: true } });
    if (!wh || !sr) {
      throw new OpeningInventoryError('Active WH-MAIN and SR-MAIN locations are required');
    }

    const allPillows = await this.prisma.pillow.findMany({ orderBy: { id: 'asc' } });
    const pillows = options?.onlyPillowIds?.length
      ? allPillows.filter((p) => options.onlyPillowIds!.includes(p.id))
      : allPillows;

    if (options?.onlyPillowIds?.length && pillows.length !== options.onlyPillowIds.length) {
      throw new OpeningInventoryError('onlyPillowIds contains unknown pillow ids');
    }

    const pillowIds = new Set(pillows.map((p) => String(p.id)));

    // Unknown pillow keys in file (scoped)
    for (const code of ['WH-MAIN', 'SR-MAIN'] as const) {
      for (const key of Object.keys(file.locations[code] || {})) {
        if (!pillowIds.has(key)) {
          if (!options?.onlyPillowIds?.length) {
            errors.push(`Unknown pillow id in ${code}: ${key}`);
          }
        }
      }
    }

    const cutoverAt = file.cutoverAt
      ? new Date(file.cutoverAt)
      : new Date(`${file.cutoverDate}T12:00:00.000Z`);
    if (Number.isNaN(cutoverAt.getTime())) {
      throw new OpeningInventoryError('Invalid cutoverAt / cutoverDate');
    }

    const rows: OpeningPlanRow[] = [];
    const plannedBalances: PlannedBalance[] = [];
    const plannedMovements: PlannedMovement[] = [];

    for (const pillow of pillows) {
      const whQty = file.locations['WH-MAIN'][String(pillow.id)];
      const srQty = file.locations['SR-MAIN'][String(pillow.id)];
      const rowErrors: string[] = [];

      if (!whQty || !srQty) {
        rowErrors.push('Missing WH-MAIN and/or SR-MAIN opening quantities');
      }

      if (whQty) rowErrors.push(...validateOpeningQty('WH-MAIN', whQty).map((e) => `WH: ${e}`));
      if (srQty) rowErrors.push(...validateOpeningQty('SR-MAIN', srQty).map((e) => `SR: ${e}`));

      const bals = await this.prisma.inventoryBalance.findMany({ where: { pillowId: pillow.id } });
      const hasOpeningMarker =
        (await this.prisma.stockMovement.count({
          where: { pillowId: pillow.id, referenceType: OPENING_REF, type: 'INITIAL' },
        })) > 0;

      // Zero-physical openings create balances without INITIAL; detect via cutover marker tag on activity/ref
      // For scoped tests we also treat both location balances existing after a prior open as cutover.
      const openedZeroOnly =
        bals.length >= 2 &&
        bals.every((b) => b.physical === 0 && b.presentation === 0 && b.reserved === 0) &&
        (await this.prisma.inventoryBalance.count({ where: { pillowId: pillow.id } })) >= 2 &&
        Boolean(
          await this.prisma.stockMovement.findFirst({
            where: {
              pillowId: pillow.id,
              referenceType: OPENING_REF,
            },
          })
        ) === false &&
        // only consider zero-open already-cutover when settings say INVENTORY and not scoped
        !options?.onlyPillowIds?.length &&
        settings?.mode === 'INVENTORY';

      const alreadyThisPillow = hasOpeningMarker || openedZeroOnly;

      const conflict =
        !alreadyThisPillow &&
        bals.some((b) => b.physical !== 0 || b.presentation !== 0 || b.reserved !== 0);

      if (alreadyCutoverGlobal || alreadyThisPillow) {
        rows.push({
          pillowId: pillow.id,
          name: pillow.name,
          oldStock: pillow.stock,
          warehousePhysical: 0,
          showroomPhysical: 0,
          showroomPresentation: 0,
          newCompanyPhysical: pillow.stock,
          differenceVsOld: 0,
          availableWh: 0,
          availableSr: 0,
          totalAvailable: 0,
          status: 'ALREADY_CUTOVER',
          errors: [],
        });
        continue;
      }

      if (conflict) {
        const msg =
          'CONFLICT: InventoryBalance has non-zero values without OPENING_INVENTORY_V1 markers';
        errors.push(`Pillow ${pillow.id}: ${msg}`);
        rows.push({
          pillowId: pillow.id,
          name: pillow.name,
          oldStock: pillow.stock,
          warehousePhysical: 0,
          showroomPhysical: 0,
          showroomPresentation: 0,
          newCompanyPhysical: 0,
          differenceVsOld: 0,
          availableWh: 0,
          availableSr: 0,
          totalAvailable: 0,
          status: 'CONFLICT',
          errors: [msg],
        });
        continue;
      }

      if (rowErrors.length || !whQty || !srQty) {
        errors.push(`Pillow ${pillow.id}: ${rowErrors.join('; ') || 'incomplete'}`);
        rows.push({
          pillowId: pillow.id,
          name: pillow.name,
          oldStock: pillow.stock,
          warehousePhysical: whQty?.physical ?? 0,
          showroomPhysical: srQty?.physical ?? 0,
          showroomPresentation: srQty?.presentation ?? 0,
          newCompanyPhysical: (whQty?.physical ?? 0) + (srQty?.physical ?? 0),
          differenceVsOld: (whQty?.physical ?? 0) + (srQty?.physical ?? 0) - pillow.stock,
          availableWh: 0,
          availableSr: 0,
          totalAvailable: 0,
          status: 'INVALID',
          errors: rowErrors,
        });
        continue;
      }

      const warehousePhysical = whQty.physical;
      const showroomPhysical = srQty.physical;
      const showroomPresentation = srQty.presentation;
      const newCompanyPhysical = warehousePhysical + showroomPhysical;
      const availableWh = computeAvailable(warehousePhysical, 0, 0);
      const availableSr = computeAvailable(showroomPhysical, showroomPresentation, 0);

      rows.push({
        pillowId: pillow.id,
        name: pillow.name,
        oldStock: pillow.stock,
        warehousePhysical,
        showroomPhysical,
        showroomPresentation,
        newCompanyPhysical,
        differenceVsOld: newCompanyPhysical - pillow.stock,
        availableWh,
        availableSr,
        totalAvailable: availableWh + availableSr,
        status: 'OK',
        errors: [],
      });

      plannedBalances.push(
        {
          pillowId: pillow.id,
          locationCode: 'WH-MAIN',
          physical: warehousePhysical,
          presentation: 0,
          reserved: 0,
          available: availableWh,
        },
        {
          pillowId: pillow.id,
          locationCode: 'SR-MAIN',
          physical: showroomPhysical,
          presentation: showroomPresentation,
          reserved: 0,
          available: availableSr,
        }
      );

      if (warehousePhysical > 0) {
        plannedMovements.push({
          pillowId: pillow.id,
          locationCode: 'WH-MAIN',
          quantity: warehousePhysical,
          type: 'INITIAL',
          referenceNumber: openingReferenceNumber(pillow.id, 'WH'),
        });
      }
      if (showroomPhysical > 0) {
        plannedMovements.push({
          pillowId: pillow.id,
          locationCode: 'SR-MAIN',
          quantity: showroomPhysical,
          type: 'INITIAL',
          referenceNumber: openingReferenceNumber(pillow.id, 'SR'),
        });
      }
    }

    const alreadyOnly = rows.length > 0 && rows.every((r) => r.status === 'ALREADY_CUTOVER');
    const canExecute =
      !alreadyOnly &&
      errors.length === 0 &&
      rows.every((r) => r.status === 'OK') &&
      rows.length > 0;

    return {
      rows,
      plannedBalances,
      plannedMovements,
      canExecute,
      alreadyCutover: alreadyOnly || alreadyCutoverGlobal,
      errors,
      cutoverAt,
    };
  }

  async dryRun(filePath: string, options?: { onlyPillowIds?: number[] }) {
    const file = this.loadFile(filePath);
    return this.dryRunPayload(file, options);
  }

  async dryRunPayload(file: OpeningInventoryFile, options?: { onlyPillowIds?: number[] }) {
    const plan = await this.buildPlan(file, options);
    return { file, plan, fileHash: this.fileHash(file) };
  }

  /**
   * Build opening payload from UI/API rows (no JSON file on disk).
   */
  buildFileFromEntries(
    entries: Array<{
      pillowId: number;
      warehousePhysical: number;
      showroomPhysical: number;
      showroomPresentation?: number;
    }>,
    options?: { cutoverDate?: string; notes?: string }
  ): OpeningInventoryFile {
    const cutoverDate = options?.cutoverDate || new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoverDate)) {
      throw new OpeningInventoryError('cutoverDate must be YYYY-MM-DD');
    }
    const file: OpeningInventoryFile = {
      version: OPENING_VERSION,
      cutoverDate,
      notes: options?.notes ?? 'Manual opening inventory entry (UI)',
      locations: {
        'WH-MAIN': {},
        'SR-MAIN': {},
      },
    };
    for (const e of entries) {
      const id = String(e.pillowId);
      file.locations['WH-MAIN'][id] = {
        physical: e.warehousePhysical,
        presentation: 0,
      };
      file.locations['SR-MAIN'][id] = {
        physical: e.showroomPhysical,
        presentation: e.showroomPresentation ?? 0,
      };
    }
    return file;
  }

  async execute(
    filePath: string,
    options?: { userId?: number | null; onlyPillowIds?: number[]; skipModeFlip?: boolean }
  ) {
    const file = this.loadFile(filePath);
    return this.executePayload(file, options);
  }

  async executePayload(
    file: OpeningInventoryFile,
    options?: { userId?: number | null; onlyPillowIds?: number[]; skipModeFlip?: boolean }
  ) {
    const plan = await this.buildPlan(file, { onlyPillowIds: options?.onlyPillowIds });

    if (plan.alreadyCutover && plan.rows.every((r) => r.status === 'ALREADY_CUTOVER')) {
      return {
        status: 'ALREADY_CUTOVER' as const,
        cutoverAt: plan.cutoverAt,
        migrated: [] as number[],
        movementsCreated: 0,
        balancesCreated: 0,
      };
    }

    if (!plan.canExecute) {
      throw new OpeningInventoryError(
        `Cannot execute opening cutover: ${plan.errors.join(' | ') || 'canExecute=false'}`
      );
    }

    const wh = await this.prisma.location.findFirst({ where: { code: 'WH-MAIN', active: true } });
    const sr = await this.prisma.location.findFirst({ where: { code: 'SR-MAIN', active: true } });
    if (!wh || !sr) throw new OpeningInventoryError('Locations missing');

    const beforeHistory = await this.prisma.pillowStockHistory.count();
    const beforeOrders = await this.prisma.order.count();
    const beforePillowOrders = await this.prisma.pillowOrder.count();
    const beforeTransfers = await this.prisma.transfer.count();
    const hash = this.fileHash(file);
    const userId = options?.userId ?? null;
    const okRows = plan.rows.filter((r) => r.status === 'OK');
    const scoped = Boolean(options?.onlyPillowIds?.length);
    const skipModeFlip = Boolean(options?.skipModeFlip || scoped);

    const result = await this.prisma.$transaction(async (tx) => {
      if (!scoped) {
        const settings = await tx.inventoryCutoverSettings.findUnique({
          where: { id: CUTOVER_SETTINGS_ID },
        });
        if (settings?.mode === 'INVENTORY') {
          return {
            status: 'ALREADY_CUTOVER' as const,
            done: [] as number[],
            movementsCreated: 0,
            balancesCreated: 0,
          };
        }
      }

      for (const row of okRows) {
        await tx.$queryRaw`SELECT id, stock FROM Pillow WHERE id = ${row.pillowId} FOR UPDATE`;
      }

      let movementsCreated = 0;
      let balancesCreated = 0;
      const done: number[] = [];

      for (const row of okRows) {
        const existing = await tx.stockMovement.count({
          where: { pillowId: row.pillowId, referenceType: OPENING_REF, type: 'INITIAL' },
        });
        const bals = await tx.inventoryBalance.findMany({ where: { pillowId: row.pillowId } });
        if (existing > 0) continue;
        if (bals.length > 0) {
          if (bals.some((b) => b.physical !== 0 || b.presentation !== 0 || b.reserved !== 0)) {
            throw new OpeningInventoryError(
              `CONFLICT pillow ${row.pillowId}: non-zero balance without opening marker`
            );
          }
          // Zero opening already created balance rows — treat as already open
          continue;
        }

        await this.upsertOpeningBalance(tx, {
          pillowId: row.pillowId,
          locationId: wh.id,
          physical: row.warehousePhysical,
          presentation: 0,
          label: 'WH',
          userId,
          createdAt: plan.cutoverAt,
        });
        balancesCreated += 1;
        if (row.warehousePhysical > 0) movementsCreated += 1;

        await this.upsertOpeningBalance(tx, {
          pillowId: row.pillowId,
          locationId: sr.id,
          physical: row.showroomPhysical,
          presentation: row.showroomPresentation,
          label: 'SR',
          userId,
          createdAt: plan.cutoverAt,
        });
        balancesCreated += 1;
        if (row.showroomPhysical > 0) movementsCreated += 1;

        const physicalSum =
          (await tx.inventoryBalance.aggregate({
            where: { pillowId: row.pillowId },
            _sum: { physical: true },
          }))._sum.physical ?? 0;
        if (physicalSum !== row.newCompanyPhysical) {
          throw new OpeningInventoryError(
            `RECONCILIATION FAILED pillow ${row.pillowId}: balanceSum=${physicalSum} expected=${row.newCompanyPhysical}`
          );
        }
        await tx.pillow.update({
          where: { id: row.pillowId },
          data: { stock: physicalSum },
        });

        done.push(row.pillowId);
      }

      if (done.length === 0) {
        return {
          status: 'ALREADY_CUTOVER' as const,
          done,
          movementsCreated: 0,
          balancesCreated: 0,
        };
      }

      for (const row of okRows.filter((r) => done.includes(r.pillowId))) {
        const pillow = await tx.pillow.findUnique({ where: { id: row.pillowId } });
        const sum =
          (await tx.inventoryBalance.aggregate({
            where: { pillowId: row.pillowId },
            _sum: { physical: true },
          }))._sum.physical ?? 0;
        if (!pillow || pillow.stock !== sum) {
          throw new OpeningInventoryError(
            `Pillow.stock mirror mismatch for pillow ${row.pillowId}: stock=${pillow?.stock} sum=${sum}`
          );
        }
      }

      const historyCount = await tx.pillowStockHistory.count();
      const orderCount = await tx.order.count();
      const pillowOrderCount = await tx.pillowOrder.count();
      const transferCount = await tx.transfer.count();
      if (historyCount !== beforeHistory) {
        throw new OpeningInventoryError('PillowStockHistory changed during cutover');
      }
      if (orderCount !== beforeOrders || pillowOrderCount !== beforePillowOrders) {
        throw new OpeningInventoryError('Orders changed during cutover');
      }
      if (transferCount !== beforeTransfers) {
        throw new OpeningInventoryError('Transfers changed during cutover');
      }

      if (!skipModeFlip) {
        await tx.inventoryCutoverSettings.upsert({
          where: { id: CUTOVER_SETTINGS_ID },
          create: {
            id: CUTOVER_SETTINGS_ID,
            mode: 'INVENTORY',
            cutoverAt: plan.cutoverAt,
            cutoverDate: file.cutoverDate,
            referenceType: OPENING_REF,
            openingFileHash: hash,
            notes: file.notes ?? null,
          },
          update: {
            mode: 'INVENTORY',
            cutoverAt: plan.cutoverAt,
            cutoverDate: file.cutoverDate,
            referenceType: OPENING_REF,
            openingFileHash: hash,
            notes: file.notes ?? null,
          },
        });
      }

      if (userId) {
        await tx.activity.create({
          data: {
            userId,
            type: OPENING_REF,
            description: `Clean cutover opening inventory executed (v${OPENING_VERSION})`,
            details: JSON.stringify({
              version: OPENING_VERSION,
              cutoverAt: plan.cutoverAt.toISOString(),
              cutoverDate: file.cutoverDate,
              pillowCount: done.length,
              totalPhysical: okRows
                .filter((r) => done.includes(r.pillowId))
                .reduce((s, r) => s + r.newCompanyPhysical, 0),
              differences: okRows
                .filter((r) => done.includes(r.pillowId))
                .map((r) => ({
                  pillowId: r.pillowId,
                  oldStock: r.oldStock,
                  newCompanyPhysical: r.newCompanyPhysical,
                  differenceVsOld: r.differenceVsOld,
                })),
              movementsCreated,
              balancesCreated,
              openingFileHash: hash,
              scoped,
            }),
          },
        });
      }

      return {
        status: 'EXECUTED' as const,
        done,
        movementsCreated,
        balancesCreated,
      };
    });

    return {
      status: result.status,
      cutoverAt: plan.cutoverAt,
      migrated: result.done,
      movementsCreated: result.movementsCreated,
      balancesCreated: result.balancesCreated,
    };
  }

  private async upsertOpeningBalance(
    tx: Prisma.TransactionClient,
    args: {
      pillowId: number;
      locationId: number;
      physical: number;
      presentation: number;
      label: 'WH' | 'SR';
      userId?: number | null;
      createdAt: Date;
    }
  ) {
    const ref = openingReferenceNumber(args.pillowId, args.label);
    const existingMove = await tx.stockMovement.findFirst({
      where: { referenceType: OPENING_REF, referenceNumber: ref, type: 'INITIAL' },
    });
    if (existingMove) {
      throw new OpeningInventoryError(`Duplicate INITIAL for ${ref}`);
    }

    let balance = await tx.inventoryBalance.findUnique({
      where: {
        pillowId_locationId: { pillowId: args.pillowId, locationId: args.locationId },
      },
    });

    if (!balance) {
      balance = await tx.inventoryBalance.create({
        data: {
          pillowId: args.pillowId,
          locationId: args.locationId,
          physical: 0,
          presentation: 0,
          reserved: 0,
        },
      });
    }

    if (balance.physical !== 0 || balance.presentation !== 0 || balance.reserved !== 0) {
      throw new OpeningInventoryError(
        `Cannot open pillow ${args.pillowId} location ${args.locationId}: balance already non-zero`
      );
    }

    await tx.inventoryBalance.update({
      where: { id: balance.id },
      data: {
        physical: args.physical,
        presentation: args.presentation,
        reserved: 0,
      },
    });

    // Zero physical → balance only, no INITIAL movement
    if (args.physical > 0) {
      await tx.stockMovement.create({
        data: {
          pillowId: args.pillowId,
          locationId: args.locationId,
          type: 'INITIAL',
          quantity: args.physical,
          previousPhysical: 0,
          newPhysical: args.physical,
          previousPresentation: 0,
          newPresentation: args.presentation,
          previousReserved: 0,
          newReserved: 0,
          reason: `Clean cutover opening inventory (${args.label})`,
          referenceType: OPENING_REF,
          referenceNumber: ref,
          userId: args.userId ?? null,
          createdAt: args.createdAt,
        },
      });
    }
  }
}
