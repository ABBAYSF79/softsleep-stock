import express from 'express';
import { PrismaClient, ReservationStatus, StockDocumentType, StockMovementType, TransferStatus } from '@prisma/client';
import { authMiddleware, adminOnly } from '../middleware/auth';
import { computeAvailable } from '../utils/inventory-balance';
import { TransferService } from '../services/TransferService';
import { StockDocumentService } from '../services/StockDocumentService';
import { transferErrorToHttp } from '../services/transfer-errors';
import { getInventoryMode, getCutoverSettings } from '../services/InventoryMode';
import { ReservationService, reservationErrorToHttp } from '../services/ReservationService';
import { InventoryService, inventoryErrorToHttp } from '../services/InventoryService';
import { ReconciliationService } from '../services/ReconciliationService';
import { CutoverReadinessService } from '../services/CutoverReadinessService';
import { LegacyOrderTransitionService } from '../services/LegacyOrderTransitionService';
import {
  CutoverFreezeService,
  cutoverErrorToHttp,
} from '../services/CutoverFreezeService';
import { PhysicalCountWorkflowService } from '../services/PhysicalCountWorkflowService';
import {
  OpeningInventoryError,
  OpeningInventoryService,
} from '../services/OpeningInventoryService';
import { CUTOVER_SETTINGS_ID } from '../services/InventoryMode';
import path from 'path';

const router = express.Router();
const prisma = new PrismaClient();
const transferService = new TransferService(prisma);
const documentService = new StockDocumentService(prisma);
const reservationService = new ReservationService(prisma);
const inventoryService = new InventoryService(prisma);
const reconciliationService = new ReconciliationService(prisma);
const cutoverReadiness = new CutoverReadinessService(prisma);
const legacyTransitions = new LegacyOrderTransitionService(prisma);
const cutoverFreeze = new CutoverFreezeService(prisma);
const physicalCount = new PhysicalCountWorkflowService(prisma);
const openingInventory = new OpeningInventoryService(prisma);

type ManualOpeningEntry = {
  pillowId: number;
  warehousePhysical: number;
  showroomPhysical: number;
  showroomPresentation?: number;
};

function parseManualOpeningBody(body: unknown): {
  entries: ManualOpeningEntry[];
  cutoverDate?: string;
  notes?: string;
} {
  const raw = (body || {}) as {
    entries?: unknown;
    cutoverDate?: string;
    notes?: string;
  };
  if (!Array.isArray(raw.entries) || raw.entries.length === 0) {
    throw new OpeningInventoryError('entries array is required');
  }
  const entries: ManualOpeningEntry[] = raw.entries.map((row, idx) => {
    const r = row as ManualOpeningEntry;
    const pillowId = Number(r.pillowId);
    const warehousePhysical = Number(r.warehousePhysical);
    const showroomPhysical = Number(r.showroomPhysical);
    const showroomPresentation =
      r.showroomPresentation === undefined || r.showroomPresentation === null
        ? 0
        : Number(r.showroomPresentation);
    if (!Number.isInteger(pillowId) || pillowId <= 0) {
      throw new OpeningInventoryError(`entries[${idx}].pillowId invalid`);
    }
    if (!Number.isInteger(warehousePhysical) || warehousePhysical < 0) {
      throw new OpeningInventoryError(`entries[${idx}].warehousePhysical invalid`);
    }
    if (!Number.isInteger(showroomPhysical) || showroomPhysical < 0) {
      throw new OpeningInventoryError(`entries[${idx}].showroomPhysical invalid`);
    }
    if (!Number.isInteger(showroomPresentation) || showroomPresentation < 0) {
      throw new OpeningInventoryError(`entries[${idx}].showroomPresentation invalid`);
    }
    return { pillowId, warehousePhysical, showroomPhysical, showroomPresentation };
  });
  return { entries, cutoverDate: raw.cutoverDate, notes: raw.notes };
}

/**
 * GET /api/inventory/mode
 * Read-only cutover mode for UI banners (LEGACY | INVENTORY).
 */
router.get('/mode', authMiddleware, async (_req, res) => {
  try {
    const mode = await getInventoryMode(prisma);
    const settings = await getCutoverSettings(prisma);
    const balanceCount = await prisma.inventoryBalance.count();
    res.json({
      mode,
      initialized: balanceCount > 0,
      balanceCount,
      cutoverAt: settings?.cutoverAt ?? null,
      cutoverDate: settings?.cutoverDate ?? null,
      cutoverStatus: settings?.cutoverStatus ?? 'OPEN',
      countStartedAt: settings?.countStartedAt ?? null,
      countFinalizedAt: settings?.countFinalizedAt ?? null,
      freezeActivatedAt: settings?.freezeActivatedAt ?? null,
      backupConfirmedAt: settings?.backupConfirmedAt ?? null,
      openingFileHash: settings?.openingFileHash ?? null,
    });
  } catch (error) {
    console.error('Error fetching inventory mode:', error);
    res.status(500).json({ error: 'Failed to fetch inventory mode' });
  }
});

/**
 * GET /api/inventory/locations
 * Active locations by default. Admin may pass ?includeInactive=1 for management UI.
 */
router.get('/locations', authMiddleware, async (req, res) => {
  try {
    const includeInactive =
      req.query.includeInactive === '1' ||
      req.query.includeInactive === 'true';
    // Only ADMIN may list inactive locations (gestion)
    const allowInactive = includeInactive && req.user?.role === 'ADMIN';

    const locations = await prisma.location.findMany({
      where: allowInactive ? {} : { active: true },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        active: true,
        isSellable: true,
        allowsPresentation: true,
        sortOrder: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json(locations);
  } catch (error) {
    console.error('Error fetching inventory locations:', error);
    res.status(500).json({ error: 'Failed to fetch locations' });
  }
});

function normalizeLocationCode(raw: unknown): string | null {
  const code = String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '-');
  if (!code || code.length > 32) return null;
  if (!/^[A-Z0-9][A-Z0-9_-]*$/.test(code)) return null;
  return code;
}

const LOCATION_TYPES = new Set(['WAREHOUSE', 'SHOWROOM', 'OTHER']);

function locationCodePrefix(type: string): 'WH' | 'SR' | 'OT' {
  if (type === 'WAREHOUSE') return 'WH';
  if (type === 'SHOWROOM') return 'SR';
  return 'OT';
}

/** Auto code: WH-MAIN / WH-02 / SR-02 / OT-01 … */
async function allocateLocationCode(type: string): Promise<string> {
  const prefix = locationCodePrefix(type);
  const rows = await prisma.location.findMany({
    where: { code: { startsWith: `${prefix}-` } },
    select: { code: true },
  });
  let max = 0;
  for (const r of rows) {
    const rest = r.code.slice(prefix.length + 1);
    if (rest === 'MAIN') {
      max = Math.max(max, 1);
      continue;
    }
    const n = Number(rest);
    if (Number.isInteger(n) && n > 0) max = Math.max(max, n);
  }
  const next = max + 1;
  if (next === 1) {
    const mainCode = `${prefix}-MAIN`;
    if (!rows.some((r) => r.code === mainCode)) return mainCode;
  }
  return `${prefix}-${String(next).padStart(2, '0')}`;
}

/**
 * POST /api/inventory/locations
 * Create a location (ADMIN). Does not touch stock.
 * Code is optional — server generates WH-xx / SR-xx / OT-xx when omitted.
 */
router.post('/locations', authMiddleware, adminOnly, async (req, res) => {
  try {
    const name = String(req.body?.name ?? '').trim();
    const type = String(req.body?.type ?? '').trim().toUpperCase();
    const sortOrder = Number(req.body?.sortOrder ?? 100);
    const isSellable = req.body?.isSellable !== false && req.body?.isSellable !== 'false';
    let allowsPresentation =
      req.body?.allowsPresentation === true || req.body?.allowsPresentation === 'true';

    if (!name) return res.status(400).json({ error: 'Name is required' });
    if (!LOCATION_TYPES.has(type)) {
      return res.status(400).json({ error: 'type must be WAREHOUSE, SHOWROOM, or OTHER' });
    }
    if (!Number.isInteger(sortOrder)) {
      return res.status(400).json({ error: 'Invalid sortOrder' });
    }
    // Warehouse never holds presentation allocation
    if (type === 'WAREHOUSE') allowsPresentation = false;
    if (type === 'SHOWROOM' && req.body?.allowsPresentation === undefined) {
      allowsPresentation = true;
    }

    let code =
      req.body?.code !== undefined && String(req.body.code).trim() !== ''
        ? normalizeLocationCode(req.body.code)
        : null;
    if (req.body?.code !== undefined && String(req.body.code).trim() !== '' && !code) {
      return res.status(400).json({
        error: 'Invalid code (use e.g. WH-CASA, SR-ADS)',
        code: 'INVALID_LOCATION_CODE',
      });
    }
    if (!code) {
      code = await allocateLocationCode(type);
    }

    const existing = await prisma.location.findUnique({ where: { code } });
    if (existing) {
      // Rare race / manual collision — retry auto once
      if (!req.body?.code || String(req.body.code).trim() === '') {
        code = await allocateLocationCode(type);
        const again = await prisma.location.findUnique({ where: { code } });
        if (again) {
          return res.status(409).json({
            error: `Location code already exists: ${code}`,
            code: 'LOCATION_CODE_EXISTS',
          });
        }
      } else {
        return res.status(409).json({
          error: `Location code already exists: ${code}`,
          code: 'LOCATION_CODE_EXISTS',
        });
      }
    }

    const location = await prisma.location.create({
      data: {
        code,
        name,
        type: type as 'WAREHOUSE' | 'SHOWROOM' | 'OTHER',
        active: true,
        isSellable,
        allowsPresentation,
        sortOrder,
      },
    });

    await prisma.activity.create({
      data: {
        userId: req.user!.id,
        type: 'LOCATION_CREATED',
        description: `Created location ${code} (${name})`,
      },
    });

    res.status(201).json(location);
  } catch (error) {
    console.error('Error creating location:', error);
    res.status(500).json({ error: 'Failed to create location' });
  }
});

/**
 * PATCH /api/inventory/locations/:id
 * Update location metadata / flags (ADMIN). Soft-deactivate via active=false.
 * Code is immutable after create. Never hard-deletes.
 */
router.patch('/locations/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid id' });
    }

    const current = await prisma.location.findUnique({ where: { id } });
    if (!current) return res.status(404).json({ error: 'Location not found' });

    if (req.body?.code !== undefined && String(req.body.code).trim().toUpperCase() !== current.code) {
      return res.status(400).json({
        error: 'Location code cannot be changed after creation',
        code: 'LOCATION_CODE_IMMUTABLE',
      });
    }

    const data: {
      name?: string;
      type?: 'WAREHOUSE' | 'SHOWROOM' | 'OTHER';
      active?: boolean;
      isSellable?: boolean;
      allowsPresentation?: boolean;
      sortOrder?: number;
    } = {};

    if (req.body?.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ error: 'Name cannot be empty' });
      data.name = name;
    }
    if (req.body?.type !== undefined) {
      const type = String(req.body.type).trim().toUpperCase();
      if (!LOCATION_TYPES.has(type)) {
        return res.status(400).json({ error: 'type must be WAREHOUSE, SHOWROOM, or OTHER' });
      }
      data.type = type as 'WAREHOUSE' | 'SHOWROOM' | 'OTHER';
    }
    if (req.body?.active !== undefined) {
      data.active = Boolean(req.body.active);
    }
    if (req.body?.isSellable !== undefined) {
      data.isSellable = Boolean(req.body.isSellable);
    }
    if (req.body?.allowsPresentation !== undefined) {
      data.allowsPresentation = Boolean(req.body.allowsPresentation);
    }
    if (req.body?.sortOrder !== undefined) {
      const sortOrder = Number(req.body.sortOrder);
      if (!Number.isInteger(sortOrder)) {
        return res.status(400).json({ error: 'Invalid sortOrder' });
      }
      data.sortOrder = sortOrder;
    }

    const nextType = data.type ?? current.type;
    if (nextType === 'WAREHOUSE') {
      data.allowsPresentation = false;
    }

    // Soft-deactivate: block if presentation > 0 remains on balances
    if (data.active === false) {
      const pres = await prisma.inventoryBalance.aggregate({
        where: { locationId: id },
        _sum: { presentation: true, physical: true, reserved: true },
      });
      if ((pres._sum.presentation ?? 0) > 0 || (pres._sum.reserved ?? 0) > 0) {
        return res.status(400).json({
          error: 'Cannot deactivate location with presentation or reserved stock. Clear them first.',
          code: 'LOCATION_HAS_ALLOCATIONS',
        });
      }
    }

    const location = await prisma.location.update({
      where: { id },
      data,
    });

    await prisma.activity.create({
      data: {
        userId: req.user!.id,
        type: 'LOCATION_UPDATED',
        description: `Updated location ${location.code}`,
        details: JSON.stringify(data),
      },
    });

    res.json(location);
  } catch (error) {
    console.error('Error updating location:', error);
    res.status(500).json({ error: 'Failed to update location' });
  }
});

/**
 * GET /api/inventory/balances
 * Read-only inventory balances per pillow + location (TASK 3).
 * Query: optional pillowId, locationId
 * available is computed — not stored.
 */
router.get('/balances', authMiddleware, async (req, res) => {
  try {
    const pillowIdRaw = req.query.pillowId as string | undefined;
    const locationIdRaw = req.query.locationId as string | undefined;

    const pillowId = pillowIdRaw !== undefined ? Number(pillowIdRaw) : undefined;
    const locationId = locationIdRaw !== undefined ? Number(locationIdRaw) : undefined;

    if (pillowIdRaw !== undefined && (!Number.isInteger(pillowId) || pillowId! <= 0)) {
      return res.status(400).json({ error: 'Invalid pillowId' });
    }
    if (locationIdRaw !== undefined && (!Number.isInteger(locationId) || locationId! <= 0)) {
      return res.status(400).json({ error: 'Invalid locationId' });
    }

    const balances = await prisma.inventoryBalance.findMany({
      where: {
        ...(pillowId ? { pillowId } : {}),
        ...(locationId ? { locationId } : {}),
      },
      include: {
        pillow: { select: { id: true, name: true } },
        location: { select: { id: true, code: true, name: true, type: true } },
      },
      orderBy: [{ pillowId: 'asc' }, { locationId: 'asc' }],
    });

    res.json(
      balances.map((b) => ({
        id: b.id,
        pillow: b.pillow,
        location: b.location,
        physical: b.physical,
        presentation: b.presentation,
        reserved: b.reserved,
        available: computeAvailable(b.physical, b.presentation, b.reserved),
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
      }))
    );
  } catch (error) {
    console.error('Error fetching inventory balances:', error);
    res.status(500).json({ error: 'Failed to fetch inventory balances' });
  }
});

/**
 * GET /api/inventory/movements
 * Read-only immutable ledger (TASK 4). No POST/PATCH/DELETE.
 */
router.get('/movements', authMiddleware, async (req, res) => {
  try {
    const pillowIdRaw = req.query.pillowId as string | undefined;
    const locationIdRaw = req.query.locationId as string | undefined;
    const typeRaw = req.query.type as string | undefined;
    const referenceType = req.query.referenceType as string | undefined;
    const referenceIdRaw = req.query.referenceId as string | undefined;
    const limitRaw = req.query.limit as string | undefined;

    const pillowId = pillowIdRaw !== undefined ? Number(pillowIdRaw) : undefined;
    const locationId = locationIdRaw !== undefined ? Number(locationIdRaw) : undefined;
    const referenceId = referenceIdRaw !== undefined ? Number(referenceIdRaw) : undefined;
    const limit = Math.min(200, Math.max(1, Number(limitRaw || 50)));

    if (pillowIdRaw !== undefined && (!Number.isInteger(pillowId) || pillowId! <= 0)) {
      return res.status(400).json({ error: 'Invalid pillowId' });
    }
    if (locationIdRaw !== undefined && (!Number.isInteger(locationId) || locationId! <= 0)) {
      return res.status(400).json({ error: 'Invalid locationId' });
    }
    if (referenceIdRaw !== undefined && (!Number.isInteger(referenceId) || referenceId! <= 0)) {
      return res.status(400).json({ error: 'Invalid referenceId' });
    }

    const allowedTypes = new Set<string>(Object.values(StockMovementType));
    if (typeRaw && !allowedTypes.has(typeRaw)) {
      return res.status(400).json({ error: 'Invalid type' });
    }

    const movements = await prisma.stockMovement.findMany({
      where: {
        ...(pillowId ? { pillowId } : {}),
        ...(locationId ? { locationId } : {}),
        ...(typeRaw ? { type: typeRaw as StockMovementType } : {}),
        ...(referenceType ? { referenceType } : {}),
        ...(referenceId ? { referenceId } : {}),
      },
      include: {
        pillow: { select: { id: true, name: true } },
        location: { select: { id: true, code: true, name: true, type: true } },
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    res.json(movements);
  } catch (error) {
    console.error('Error fetching stock movements:', error);
    res.status(500).json({ error: 'Failed to fetch stock movements' });
  }
});

// ─── Transfers (TASK 5 — document foundation; no stock mutation) ───

router.get('/transfers', authMiddleware, async (req, res) => {
  try {
    const statusRaw = req.query.status as string | undefined;
    if (statusRaw && !Object.values(TransferStatus).includes(statusRaw as TransferStatus)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const data = await transferService.listTransfers(
      statusRaw ? { status: statusRaw as TransferStatus } : undefined
    );
    res.json(data);
  } catch (error) {
    console.error('Error listing transfers:', error);
    const mapped = transferErrorToHttp(error);
    res.status(mapped.status).json(mapped.body);
  }
});

router.get('/transfers/:id', authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
    const data = await transferService.getTransfer(id);
    res.json(data);
  } catch (error) {
    console.error('Error getting transfer:', error);
    const mapped = transferErrorToHttp(error);
    res.status(mapped.status).json(mapped.body);
  }
});

router.post('/transfers', authMiddleware, adminOnly, async (req, res) => {
  try {
    const data = await transferService.createTransfer({
      sourceLocationId: Number(req.body?.sourceLocationId),
      destinationLocationId: Number(req.body?.destinationLocationId),
      reason: req.body?.reason ?? null,
      lines: Array.isArray(req.body?.lines) ? req.body.lines : [],
      createdById: req.user?.id ?? null,
    });
    res.status(201).json(data);
  } catch (error) {
    console.error('Error creating transfer:', error);
    const mapped = transferErrorToHttp(error);
    res.status(mapped.status).json(mapped.body);
  }
});

router.patch('/transfers/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
    const data = await transferService.updateDraftTransfer(id, {
      sourceLocationId:
        req.body?.sourceLocationId !== undefined ? Number(req.body.sourceLocationId) : undefined,
      destinationLocationId:
        req.body?.destinationLocationId !== undefined
          ? Number(req.body.destinationLocationId)
          : undefined,
      reason: req.body?.reason,
      lines: req.body?.lines,
    });
    res.json(data);
  } catch (error) {
    console.error('Error updating transfer:', error);
    const mapped = transferErrorToHttp(error);
    res.status(mapped.status).json(mapped.body);
  }
});

router.post('/transfers/:id/cancel', authMiddleware, adminOnly, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
    const data = await transferService.cancelDraftTransfer(id);
    res.json(data);
  } catch (error) {
    console.error('Error cancelling transfer:', error);
    const mapped = transferErrorToHttp(error);
    res.status(mapped.status).json(mapped.body);
  }
});

/**
 * POST /api/inventory/transfers/:id/dispatch
 * Create BS from transfer lines (if needed) and validate → DISPATCHED.
 * Stock effects apply only when inventoryMode = INVENTORY.
 */
router.post('/transfers/:id/dispatch', authMiddleware, adminOnly, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
    const data = await documentService.dispatchTransfer(id, req.user?.id ?? null);
    res.json(data);
  } catch (error) {
    console.error('Error dispatching transfer:', error);
    const mapped = transferErrorToHttp(error);
    res.status(mapped.status).json(mapped.body);
  }
});

/**
 * POST /api/inventory/transfers/:id/receive
 * Body: { lines: [{ pillowId, quantity }] }
 * Create BE and validate. Supports partial receipts.
 */
router.post('/transfers/:id/receive', authMiddleware, adminOnly, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
    const data = await documentService.receiveTransfer(
      id,
      Array.isArray(req.body?.lines) ? req.body.lines : [],
      req.user?.id ?? null
    );
    res.json(data);
  } catch (error) {
    console.error('Error receiving transfer:', error);
    const mapped = transferErrorToHttp(error);
    res.status(mapped.status).json(mapped.body);
  }
});

// ─── Stock documents BS / BE (TASK 5/10 — stock effects when inventoryMode=INVENTORY) ───

router.get('/documents', authMiddleware, async (req, res) => {
  try {
    const typeRaw = req.query.type as string | undefined;
    const transferIdRaw = req.query.transferId as string | undefined;
    const statusRaw = req.query.status as string | undefined;
    if (typeRaw && !Object.values(StockDocumentType).includes(typeRaw as StockDocumentType)) {
      return res.status(400).json({ error: 'Invalid type' });
    }
    const transferId = transferIdRaw !== undefined ? Number(transferIdRaw) : undefined;
    if (transferIdRaw !== undefined && (!Number.isInteger(transferId) || transferId! <= 0)) {
      return res.status(400).json({ error: 'Invalid transferId' });
    }
    const data = await documentService.listDocuments({
      type: typeRaw as StockDocumentType | undefined,
      transferId,
      status: statusRaw,
    });
    res.json(data);
  } catch (error) {
    console.error('Error listing documents:', error);
    const mapped = transferErrorToHttp(error);
    res.status(mapped.status).json(mapped.body);
  }
});

router.get('/documents/:id', authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
    const data = await documentService.getDocument(id);
    res.json(data);
  } catch (error) {
    console.error('Error getting document:', error);
    const mapped = transferErrorToHttp(error);
    res.status(mapped.status).json(mapped.body);
  }
});

router.post('/documents', authMiddleware, adminOnly, async (req, res) => {
  try {
    const type = req.body?.type as StockDocumentType;
    const data = await documentService.createDraftDocument({
      type,
      transferId: Number(req.body?.transferId),
      reason: req.body?.reason ?? null,
      lines: Array.isArray(req.body?.lines) ? req.body.lines : [],
      createdById: req.user?.id ?? null,
    });
    res.status(201).json(data);
  } catch (error) {
    console.error('Error creating document:', error);
    const mapped = transferErrorToHttp(error);
    res.status(mapped.status).json(mapped.body);
  }
});

router.patch('/documents/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
    const data = await documentService.updateDraftDocument(id, {
      reason: req.body?.reason,
      lines: req.body?.lines,
    });
    res.json(data);
  } catch (error) {
    console.error('Error updating document:', error);
    const mapped = transferErrorToHttp(error);
    res.status(mapped.status).json(mapped.body);
  }
});

router.post('/documents/:id/validate', authMiddleware, adminOnly, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
    const data = await documentService.validateDocument(id, req.user?.id ?? null);
    res.json(data);
  } catch (error) {
    console.error('Error validating document:', error);
    const mapped = transferErrorToHttp(error);
    res.status(mapped.status).json(mapped.body);
  }
});

router.post('/documents/:id/cancel', authMiddleware, adminOnly, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
    const data = await documentService.cancelDraftDocument(id);
    res.json(data);
  } catch (error) {
    console.error('Error cancelling document:', error);
    const mapped = transferErrorToHttp(error);
    res.status(mapped.status).json(mapped.body);
  }
});

// ─── Reservations (TASK 12) ───

router.get('/reservations', authMiddleware, async (req, res) => {
  try {
    const statusRaw = req.query.status as string | undefined;
    const orderIdRaw = req.query.orderId as string | undefined;
    const pillowOrderIdRaw = req.query.pillowOrderId as string | undefined;
    if (statusRaw && !Object.values(ReservationStatus).includes(statusRaw as ReservationStatus)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const orderId = orderIdRaw !== undefined ? Number(orderIdRaw) : undefined;
    const pillowOrderId = pillowOrderIdRaw !== undefined ? Number(pillowOrderIdRaw) : undefined;
    const data = await reservationService.listReservations({
      status: statusRaw as ReservationStatus | undefined,
      orderId,
      pillowOrderId,
    });
    res.json(data);
  } catch (error) {
    console.error('Error listing reservations:', error);
    const mapped = reservationErrorToHttp(error);
    res.status(mapped.status).json(mapped.body);
  }
});

router.get('/reservations/:id', authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
    const data = await reservationService.getReservation(id);
    res.json(data);
  } catch (error) {
    console.error('Error getting reservation:', error);
    const mapped = reservationErrorToHttp(error);
    res.status(mapped.status).json(mapped.body);
  }
});

router.post('/reservations/:id/release', authMiddleware, adminOnly, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
    const data = await reservationService.releaseReservation(id, {
      userId: req.user?.id ?? null,
      reason: req.body?.reason,
    });
    res.json(data);
  } catch (error) {
    console.error('Error releasing reservation:', error);
    const mapped = reservationErrorToHttp(error);
    res.status(mapped.status).json(mapped.body);
  }
});

router.post('/reservations/:id/fulfill', authMiddleware, adminOnly, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
    const data = await reservationService.fulfillReservation(id, {
      userId: req.user?.id ?? null,
      lines: Array.isArray(req.body?.lines) ? req.body.lines : undefined,
      reason: req.body?.reason,
    });
    res.json(data);
  } catch (error) {
    console.error('Error fulfilling reservation:', error);
    const mapped = reservationErrorToHttp(error);
    res.status(mapped.status).json(mapped.body);
  }
});

router.post('/reservations/:id/return', authMiddleware, adminOnly, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
    const data = await reservationService.returnFulfilled(id, {
      lines: Array.isArray(req.body?.lines) ? req.body.lines : [],
      userId: req.user?.id ?? null,
      locationId: req.body?.locationId !== undefined ? Number(req.body.locationId) : undefined,
      reason: req.body?.reason,
    });
    res.json(data);
  } catch (error) {
    console.error('Error returning reservation stock:', error);
    const mapped = reservationErrorToHttp(error);
    res.status(mapped.status).json(mapped.body);
  }
});

/**
 * Read-only diagnostic: open orders with accessories that have no Reservation
 * (legacy pre-cutover orders). Does NOT mutate anything.
 */
router.get('/diagnostics/legacy-accessory-orders', authMiddleware, adminOnly, async (_req, res) => {
  try {
    const openStatuses = ['PENDING', 'IN_PROCESS'] as const;
    const mattress = await prisma.order.findMany({
      where: {
        status: { in: [...openStatuses] },
        pillowItems: { some: {} },
      },
      select: {
        id: true,
        status: true,
        locationId: true,
        location: { select: { code: true, name: true } },
        pillowItems: {
          select: {
            pillowId: true,
            quantity: true,
            pillow: { select: { name: true } },
          },
        },
      },
      take: 500,
    });
    const pillowOrders = await prisma.pillowOrder.findMany({
      where: { status: { in: [...openStatuses] } },
      select: {
        id: true,
        status: true,
        locationId: true,
        location: { select: { code: true, name: true } },
        items: {
          select: {
            pillowId: true,
            quantity: true,
            pillow: { select: { name: true } },
          },
        },
      },
      take: 500,
    });

    const reservationOrderIds = new Set(
      (
        await prisma.reservation.findMany({
          where: { orderId: { not: null } },
          select: { orderId: true },
        })
      ).map((r) => r.orderId)
    );
    const reservationPillowOrderIds = new Set(
      (
        await prisma.reservation.findMany({
          where: { pillowOrderId: { not: null } },
          select: { pillowOrderId: true },
        })
      ).map((r) => r.pillowOrderId)
    );

    res.json({
      note: 'Read-only. These open accessory orders have no Reservation row (typical pre-cutover). Do not auto-convert.',
      mattressOrdersWithoutReservation: mattress
        .filter((o) => !reservationOrderIds.has(o.id))
        .map((o) => ({
          orderId: o.id,
          status: o.status,
          location: o.location,
          accessories: o.pillowItems.map((i) => ({
            pillowId: i.pillowId,
            name: i.pillow.name,
            quantity: i.quantity,
          })),
        })),
      pillowOrdersWithoutReservation: pillowOrders
        .filter((o) => !reservationPillowOrderIds.has(o.id))
        .map((o) => ({
          pillowOrderId: o.id,
          status: o.status,
          location: o.location,
          accessories: o.items.map((i) => ({
            pillowId: i.pillowId,
            name: i.pillow.name,
            quantity: i.quantity,
          })),
        })),
    });
  } catch (error) {
    console.error('Error running legacy accessory diagnostic:', error);
    res.status(500).json({ error: 'Failed to run diagnostic' });
  }
});

/**
 * POST /api/inventory/supply
 * Location-aware supply (ADMIN). Requires inventoryMode=INVENTORY.
 */
router.post('/supply', authMiddleware, adminOnly, async (req, res) => {
  try {
    const mode = await getInventoryMode(prisma);
    if (mode !== 'INVENTORY') {
      return res.status(400).json({
        error: 'Supply via inventory API requires inventoryMode=INVENTORY',
        code: 'INVENTORY_MODE_REQUIRED',
      });
    }
    const pillowId = Number(req.body?.pillowId);
    const locationId = Number(req.body?.locationId);
    const quantity = Number(req.body?.quantity);
    const reason = String(req.body?.reason ?? '').trim();
    if (!Number.isInteger(pillowId) || pillowId <= 0) {
      return res.status(400).json({ error: 'Invalid pillowId' });
    }
    if (!Number.isInteger(locationId) || locationId <= 0) {
      return res.status(400).json({ error: 'locationId is required', code: 'INVENTORY_LOCATION_REQUIRED' });
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return res.status(400).json({ error: 'Invalid quantity' });
    }
    if (!reason) return res.status(400).json({ error: 'Reason is required', code: 'REASON_REQUIRED' });

    const result = await inventoryService.supply({
      pillowId,
      locationId,
      quantity,
      reason,
      userId: req.user!.id,
      referenceType: 'INVENTORY_SUPPLY',
    });
    await prisma.activity.create({
      data: {
        userId: req.user!.id,
        type: 'INVENTORY_SUPPLY',
        description: `Supply +${quantity} pillow ${pillowId} @ location ${locationId}`,
        details: reason,
      },
    });
    res.json(result);
  } catch (error) {
    const mapped = inventoryErrorToHttp(error);
    if (mapped.body.code) return res.status(mapped.status).json(mapped.body);
    console.error('Error inventory supply:', error);
    res.status(500).json({ error: 'Failed to supply stock' });
  }
});

/**
 * POST /api/inventory/adjust
 * Location-aware physical adjustment (ADMIN). Signed delta. Reason required.
 */
router.post('/adjust', authMiddleware, adminOnly, async (req, res) => {
  try {
    const mode = await getInventoryMode(prisma);
    if (mode !== 'INVENTORY') {
      return res.status(400).json({
        error: 'Adjustment via inventory API requires inventoryMode=INVENTORY',
        code: 'INVENTORY_MODE_REQUIRED',
      });
    }
    const pillowId = Number(req.body?.pillowId);
    const locationId = Number(req.body?.locationId);
    const delta = Number(req.body?.delta ?? req.body?.quantity);
    const reason = String(req.body?.reason ?? '').trim();
    if (!Number.isInteger(pillowId) || pillowId <= 0) {
      return res.status(400).json({ error: 'Invalid pillowId' });
    }
    if (!Number.isInteger(locationId) || locationId <= 0) {
      return res.status(400).json({ error: 'locationId is required', code: 'INVENTORY_LOCATION_REQUIRED' });
    }
    if (!Number.isInteger(delta) || delta === 0) {
      return res.status(400).json({ error: 'Adjustment delta must be a non-zero integer' });
    }
    if (!reason) return res.status(400).json({ error: 'Reason is required', code: 'REASON_REQUIRED' });

    const result = await inventoryService.adjustPhysical({
      pillowId,
      locationId,
      delta,
      reason,
      userId: req.user!.id,
      referenceType: 'INVENTORY_ADJUSTMENT',
    });
    await prisma.activity.create({
      data: {
        userId: req.user!.id,
        type: 'INVENTORY_ADJUSTMENT',
        description: `Adjust ${delta > 0 ? '+' : ''}${delta} pillow ${pillowId} @ location ${locationId}`,
        details: reason,
      },
    });
    res.json(result);
  } catch (error) {
    const mapped = inventoryErrorToHttp(error);
    if (mapped.body.code) return res.status(mapped.status).json(mapped.body);
    console.error('Error inventory adjust:', error);
    res.status(500).json({ error: 'Failed to adjust stock' });
  }
});

/**
 * POST /api/inventory/presentation
 * Set showroom presentation allocation (ADMIN). Does not change physical.
 */
router.post('/presentation', authMiddleware, adminOnly, async (req, res) => {
  try {
    const mode = await getInventoryMode(prisma);
    if (mode !== 'INVENTORY') {
      return res.status(400).json({
        error: 'Presentation via inventory API requires inventoryMode=INVENTORY',
        code: 'INVENTORY_MODE_REQUIRED',
      });
    }
    const pillowId = Number(req.body?.pillowId);
    const locationId = Number(req.body?.locationId);
    const presentation = Number(req.body?.presentation);
    const reason = req.body?.reason != null ? String(req.body.reason).trim() : undefined;
    if (!Number.isInteger(pillowId) || pillowId <= 0) {
      return res.status(400).json({ error: 'Invalid pillowId' });
    }
    if (!Number.isInteger(locationId) || locationId <= 0) {
      return res.status(400).json({ error: 'locationId is required', code: 'INVENTORY_LOCATION_REQUIRED' });
    }
    if (!Number.isInteger(presentation) || presentation < 0) {
      return res.status(400).json({ error: 'Invalid presentation quantity' });
    }

    const result = await inventoryService.setPresentation({
      pillowId,
      locationId,
      presentation,
      reason,
      userId: req.user!.id,
      referenceType: 'PRESENTATION',
    });
    await prisma.activity.create({
      data: {
        userId: req.user!.id,
        type: 'INVENTORY_PRESENTATION',
        description: `Set presentation=${presentation} pillow ${pillowId} @ location ${locationId}`,
        details: reason ?? null,
      },
    });
    res.json(result);
  } catch (error) {
    const mapped = inventoryErrorToHttp(error);
    if (mapped.body.code) return res.status(mapped.status).json(mapped.body);
    console.error('Error inventory presentation:', error);
    res.status(500).json({ error: 'Failed to set presentation' });
  }
});

/**
 * GET /api/inventory/reconciliation
 * Read-only consistency report (ADMIN). Never mutates.
 */
router.get('/reconciliation', authMiddleware, adminOnly, async (_req, res) => {
  try {
    const report = await reconciliationService.reconcileInventory();
    res.json(report);
  } catch (error) {
    console.error('Error inventory reconciliation:', error);
    res.status(500).json({ error: 'Failed to run reconciliation' });
  }
});

/**
 * GET /api/inventory/cutover/readiness
 * Read-only cutover readiness (TASK 15). Never executes cutover.
 */
router.get('/cutover/readiness', authMiddleware, adminOnly, async (_req, res) => {
  try {
    const report = await cutoverReadiness.getReadinessReport();
    res.json(report);
  } catch (error) {
    console.error('Error cutover readiness:', error);
    res.status(500).json({ error: 'Failed to build readiness report' });
  }
});

/**
 * GET /api/inventory/cutover/legacy-orders
 * Read-only legacy accessory order diagnostic with classifications.
 */
router.get('/cutover/legacy-orders', authMiddleware, adminOnly, async (_req, res) => {
  try {
    const report = await legacyTransitions.listDiagnostic();
    res.json(report);
  } catch (error) {
    console.error('Error legacy-orders diagnostic:', error);
    res.status(500).json({ error: 'Failed to list legacy orders' });
  }
});

/**
 * POST /api/inventory/cutover/legacy-orders/:source/:id/transition
 * Explicit admin CLOSE_UNDER_LEGACY | FREEZE | MIGRATE_TO_INVENTORY.
 * Requires { action, confirm: true }.
 */
router.post(
  '/cutover/legacy-orders/:source/:id/transition',
  authMiddleware,
  adminOnly,
  async (req, res) => {
    try {
      const sourceRaw = String(req.params.source || '').toUpperCase();
      const source = sourceRaw === 'PILLOW_ORDER' ? 'PILLOW_ORDER' : sourceRaw === 'ORDER' ? 'ORDER' : null;
      if (!source) {
        return res.status(400).json({ error: 'source must be ORDER or PILLOW_ORDER' });
      }
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'Invalid id' });
      }
      const action = String(req.body?.action || '').trim() as
        | 'CLOSE_UNDER_LEGACY'
        | 'FREEZE'
        | 'MIGRATE_TO_INVENTORY';
      if (!['CLOSE_UNDER_LEGACY', 'FREEZE', 'MIGRATE_TO_INVENTORY'].includes(action)) {
        return res.status(400).json({ error: 'Invalid action' });
      }
      const result = await legacyTransitions.applyTransition({
        source,
        id,
        action,
        userId: req.user!.id,
        notes: req.body?.notes ? String(req.body.notes) : undefined,
        confirm: Boolean(req.body?.confirm),
      });
      res.json(result);
    } catch (error) {
      const mapped = cutoverErrorToHttp(error);
      if (mapped) return res.status(mapped.status).json(mapped.body);
      console.error('Error legacy transition:', error);
      res.status(500).json({ error: 'Failed to apply transition' });
    }
  }
);

/**
 * GET /api/inventory/cutover/status
 */
router.get('/cutover/status', authMiddleware, adminOnly, async (_req, res) => {
  try {
    res.json(await cutoverFreeze.getStatus());
  } catch (error) {
    console.error('Error cutover status:', error);
    res.status(500).json({ error: 'Failed to read cutover status' });
  }
});

/**
 * POST /api/inventory/cutover/status
 * Set cutoverStatus (OPEN | FREEZE_PENDING | FROZEN | ABORTED). Never COMPLETED here.
 * Does NOT flip inventoryMode.
 */
router.post('/cutover/status', authMiddleware, adminOnly, async (req, res) => {
  try {
    const status = String(req.body?.status || '').trim();
    if (!['OPEN', 'FREEZE_PENDING', 'FROZEN', 'ABORTED'].includes(status)) {
      return res.status(400).json({
        error: 'status must be OPEN | FREEZE_PENDING | FROZEN | ABORTED (COMPLETED only via opening execute)',
      });
    }
    if (!req.body?.confirm) {
      return res.status(400).json({ error: 'confirm=true required', code: 'CONFIRMATION_REQUIRED' });
    }
    const result = await cutoverFreeze.setStatus({
      status: status as any,
      userId: req.user!.id,
      notes: req.body?.notes ? String(req.body.notes) : undefined,
    });
    res.json(result);
  } catch (error) {
    const mapped = cutoverErrorToHttp(error);
    if (mapped) return res.status(mapped.status).json(mapped.body);
    console.error('Error set cutover status:', error);
    res.status(500).json({ error: 'Failed to set cutover status' });
  }
});

router.post('/cutover/count-started', authMiddleware, adminOnly, async (req, res) => {
  try {
    if (!req.body?.confirm) {
      return res.status(400).json({ error: 'confirm=true required', code: 'CONFIRMATION_REQUIRED' });
    }
    res.json(
      await cutoverFreeze.markCountStarted(
        req.user!.id,
        req.body?.notes ? String(req.body.notes) : undefined
      )
    );
  } catch (error) {
    const mapped = cutoverErrorToHttp(error);
    if (mapped) return res.status(mapped.status).json(mapped.body);
    res.status(500).json({ error: 'Failed to mark count started' });
  }
});

router.post('/cutover/count-finalized', authMiddleware, adminOnly, async (req, res) => {
  try {
    if (!req.body?.confirm) {
      return res.status(400).json({ error: 'confirm=true required', code: 'CONFIRMATION_REQUIRED' });
    }
    res.json(
      await cutoverFreeze.markCountFinalized(
        req.user!.id,
        req.body?.notes ? String(req.body.notes) : undefined
      )
    );
  } catch (error) {
    const mapped = cutoverErrorToHttp(error);
    if (mapped) return res.status(mapped.status).json(mapped.body);
    res.status(500).json({ error: 'Failed to mark count finalized' });
  }
});

/**
 * GET /api/inventory/cutover/physical-count-sheet
 * Operator count sheet scaffold (zeros / nulls — no invented stock).
 */
router.get('/cutover/physical-count-sheet', authMiddleware, adminOnly, async (_req, res) => {
  try {
    res.json(await physicalCount.generateCountSheet());
  } catch (error) {
    console.error('Error physical count sheet:', error);
    res.status(500).json({ error: 'Failed to generate count sheet' });
  }
});

/**
 * GET /api/inventory/cutover/reconciliation-preview
 * Compare legacy Pillow.stock vs opening file if present (informational).
 */
router.get('/cutover/reconciliation-preview', authMiddleware, adminOnly, async (_req, res) => {
  try {
    const filePath = path.resolve(__dirname, '../../data/opening-inventory.json');
    const fs = await import('fs');
    if (!fs.existsSync(filePath)) {
      return res.json({
        note: 'opening-inventory.json not present yet — physical count required',
        filePath,
        rows: [],
      });
    }
    res.json(await physicalCount.compareLegacyVsOpening(filePath));
  } catch (error) {
    console.error('Error reconciliation preview:', error);
    res.status(500).json({ error: 'Failed to build reconciliation preview' });
  }
});

/**
 * GET /api/inventory/cutover/execution
 * Legacy gate view — prefer POST /cutover/opening-manual for small catalogs.
 */
router.get('/cutover/execution', authMiddleware, adminOnly, async (_req, res) => {
  try {
    const readiness = await cutoverReadiness.getReadinessReport();
    const status = await cutoverFreeze.getStatus();
    res.json({
      executionEnabled: false,
      reason:
        'Use Inventory → Cutover → Saisie stock for manual opening, or CLI: npm run inventory:opening -- --execute --file <path> --confirm-backup.',
      readinessReady: readiness.ready,
      blockers: readiness.blockers,
      inventoryMode: status.mode,
      cutoverStatus: status.cutoverStatus,
      backupConfirmed: !!status.backupConfirmedAt,
      openingFileHash: status.openingFileHash,
    });
  } catch (error) {
    console.error('Error cutover execution gate:', error);
    res.status(500).json({ error: 'Failed to load execution gate' });
  }
});

/**
 * GET /api/inventory/cutover/opening-manual
 * Form scaffold: all accessories with empty qty fields (no file, no CLI).
 */
router.get('/cutover/opening-manual', authMiddleware, adminOnly, async (_req, res) => {
  try {
    const status = await cutoverFreeze.getStatus();
    const wh = await prisma.location.findFirst({ where: { code: 'WH-MAIN', active: true } });
    const sr = await prisma.location.findFirst({ where: { code: 'SR-MAIN', active: true } });
    const pillows = await prisma.pillow.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, name: true, stock: true },
    });
    const alreadyCutover = status.mode === 'INVENTORY';
    res.json({
      alreadyCutover,
      inventoryMode: status.mode,
      cutoverDate: new Date().toISOString().slice(0, 10),
      locationsReady: Boolean(wh && sr),
      locations: {
        warehouse: wh ? { id: wh.id, code: wh.code, name: wh.name } : null,
        showroom: sr ? { id: sr.id, code: sr.code, name: sr.name } : null,
      },
      note: 'Enter physical counts by location. Old Pillow.stock is informational only — do not copy blindly.',
      pillows: pillows.map((p) => ({
        pillowId: p.id,
        name: p.name,
        legacyStock: p.stock,
        warehousePhysical: 0,
        showroomPhysical: 0,
        showroomPresentation: 0,
      })),
    });
  } catch (error) {
    console.error('Error opening-manual form:', error);
    res.status(500).json({ error: 'Failed to load opening form' });
  }
});

/**
 * POST /api/inventory/cutover/opening-manual/preview
 * Dry-run opening plan from UI quantities (no disk file).
 */
router.post('/cutover/opening-manual/preview', authMiddleware, adminOnly, async (req, res) => {
  try {
    const parsed = parseManualOpeningBody(req.body);
    const file = openingInventory.buildFileFromEntries(parsed.entries, {
      cutoverDate: parsed.cutoverDate,
      notes: parsed.notes,
    });
    const { plan, fileHash } = await openingInventory.dryRunPayload(file);
    res.json({
      canExecute: plan.canExecute,
      alreadyCutover: plan.alreadyCutover,
      errors: plan.errors,
      fileHash,
      cutoverAt: plan.cutoverAt,
      rows: plan.rows,
    });
  } catch (error) {
    if (error instanceof OpeningInventoryError) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error opening-manual preview:', error);
    res.status(500).json({ error: 'Failed to preview opening inventory' });
  }
});

/**
 * POST /api/inventory/cutover/opening-manual/execute
 * Apply manual opening stock + switch to INVENTORY mode.
 * Requires confirmBackup + confirmExecute (admin only). No JSON file / no CLI.
 */
router.post('/cutover/opening-manual/execute', authMiddleware, adminOnly, async (req, res) => {
  try {
    const confirmBackup = req.body?.confirmBackup === true;
    const confirmExecute = req.body?.confirmExecute === true;
    if (!confirmBackup || !confirmExecute) {
      return res.status(400).json({
        error: 'confirmBackup and confirmExecute must both be true',
      });
    }

    const parsed = parseManualOpeningBody(req.body);
    const file = openingInventory.buildFileFromEntries(parsed.entries, {
      cutoverDate: parsed.cutoverDate,
      notes: parsed.notes ?? 'Manual opening inventory entry (UI)',
    });

    const result = await openingInventory.executePayload(file, {
      userId: req.user?.id ?? null,
    });

    if (result.status === 'EXECUTED') {
      await prisma.inventoryCutoverSettings.update({
        where: { id: CUTOVER_SETTINGS_ID },
        data: {
          backupConfirmedAt: new Date(),
          cutoverStatus: 'COMPLETED',
        },
      });
    }

    res.json(result);
  } catch (error) {
    if (error instanceof OpeningInventoryError) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error opening-manual execute:', error);
    res.status(500).json({ error: 'Failed to execute opening inventory' });
  }
});

export default router;
