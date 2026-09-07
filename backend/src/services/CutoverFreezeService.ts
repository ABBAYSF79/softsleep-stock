import { Prisma, PrismaClient } from '@prisma/client';
import { CUTOVER_SETTINGS_ID } from './InventoryMode';

export type CutoverStatus =
  | 'OPEN'
  | 'FREEZE_PENDING'
  | 'FROZEN'
  | 'COMPLETED'
  | 'ABORTED';

export const CUTOVER_AUDIT_TYPE = 'CUTOVER_AUDIT';

export type CutoverAuditAction =
  | 'PREPARE'
  | 'FREEZE'
  | 'UNFREEZE'
  | 'COUNT_STARTED'
  | 'COUNT_FINALIZED'
  | 'EXECUTE'
  | 'ABORT'
  | 'LEGACY_TRANSITION';

type TxClient = Prisma.TransactionClient;

/**
 * Auditable cutover freeze / status controls (TASK 15).
 * Does NOT activate freeze in production unless an admin explicitly calls setStatus.
 */
export class CutoverFreezeService {
  constructor(private readonly prisma: PrismaClient) {}

  async getStatus(client: PrismaClient | TxClient = this.prisma): Promise<{
    cutoverStatus: CutoverStatus;
    mode: string;
    countStartedAt: Date | null;
    countFinalizedAt: Date | null;
    freezeActivatedAt: Date | null;
    backupConfirmedAt: Date | null;
    openingFileHash: string | null;
  }> {
    const row = await client.inventoryCutoverSettings.findUnique({
      where: { id: CUTOVER_SETTINGS_ID },
    });
    return {
      cutoverStatus: (row?.cutoverStatus as CutoverStatus) || 'OPEN',
      mode: row?.mode === 'INVENTORY' ? 'INVENTORY' : 'LEGACY',
      countStartedAt: row?.countStartedAt ?? null,
      countFinalizedAt: row?.countFinalizedAt ?? null,
      freezeActivatedAt: row?.freezeActivatedAt ?? null,
      backupConfirmedAt: row?.backupConfirmedAt ?? null,
      openingFileHash: row?.openingFileHash ?? null,
    };
  }

  async isFrozen(client: PrismaClient | TxClient = this.prisma): Promise<boolean> {
    const s = await this.getStatus(client);
    return s.cutoverStatus === 'FROZEN';
  }

  /**
   * Assert cutover freeze is not blocking legacy inventory mutations.
   * Throws CutoverDomainError when FROZEN.
   */
  async assertNotFrozen(
    client: PrismaClient | TxClient = this.prisma,
    context = 'inventory mutation'
  ): Promise<void> {
    if (await this.isFrozen(client)) {
      throw new CutoverDomainError(
        'CUTOVER_FROZEN',
        `Cutover freeze is active; ${context} is blocked until freeze is lifted or cutover completes`
      );
    }
  }

  async setStatus(args: {
    status: CutoverStatus;
    userId: number;
    notes?: string;
  }) {
    const before = await this.getStatus();
    if (before.mode === 'INVENTORY' && args.status === 'FROZEN') {
      throw new CutoverDomainError(
        'INVALID_CUTOVER_STATUS',
        'Cannot freeze after inventoryMode=INVENTORY (cutover already completed)'
      );
    }
    if (before.cutoverStatus === 'COMPLETED' && args.status !== 'COMPLETED') {
      throw new CutoverDomainError(
        'ALREADY_CUTOVER',
        'Cutover is COMPLETED; status cannot be changed casually'
      );
    }

    const data: Prisma.InventoryCutoverSettingsUpdateInput = {
      cutoverStatus: args.status,
    };
    if (args.status === 'FROZEN') {
      data.freezeActivatedAt = new Date();
      data.freezeActivatedById = args.userId;
    }
    if (args.status === 'OPEN' || args.status === 'ABORTED') {
      data.freezeActivatedAt = null;
      data.freezeActivatedById = null;
    }
    if (args.status === 'FREEZE_PENDING' && !before.countStartedAt) {
      // optional: leave count timestamps alone
    }

    await this.prisma.inventoryCutoverSettings.upsert({
      where: { id: CUTOVER_SETTINGS_ID },
      create: {
        id: CUTOVER_SETTINGS_ID,
        mode: 'LEGACY',
        cutoverStatus: args.status,
        freezeActivatedAt: args.status === 'FROZEN' ? new Date() : null,
        freezeActivatedById: args.status === 'FROZEN' ? args.userId : null,
        notes: args.notes ?? null,
      },
      update: data,
    });

    await this.writeAudit({
      action: args.status === 'FROZEN' ? 'FREEZE' : args.status === 'ABORTED' ? 'ABORT' : 'PREPARE',
      userId: args.userId,
      inventoryModeBefore: before.mode,
      inventoryModeAfter: before.mode,
      notes: args.notes ?? `cutoverStatus ${before.cutoverStatus} → ${args.status}`,
      details: { from: before.cutoverStatus, to: args.status },
    });

    return this.getStatus();
  }

  async markCountStarted(userId: number, notes?: string) {
    const before = await this.getStatus();
    await this.prisma.inventoryCutoverSettings.upsert({
      where: { id: CUTOVER_SETTINGS_ID },
      create: {
        id: CUTOVER_SETTINGS_ID,
        mode: 'LEGACY',
        cutoverStatus: before.cutoverStatus === 'OPEN' ? 'FREEZE_PENDING' : before.cutoverStatus,
        countStartedAt: new Date(),
      },
      update: {
        countStartedAt: new Date(),
        ...(before.cutoverStatus === 'OPEN' ? { cutoverStatus: 'FREEZE_PENDING' } : {}),
      },
    });
    await this.writeAudit({
      action: 'COUNT_STARTED',
      userId,
      inventoryModeBefore: before.mode,
      inventoryModeAfter: before.mode,
      notes,
    });
    return this.getStatus();
  }

  async markCountFinalized(userId: number, notes?: string) {
    const before = await this.getStatus();
    await this.prisma.inventoryCutoverSettings.update({
      where: { id: CUTOVER_SETTINGS_ID },
      data: { countFinalizedAt: new Date() },
    });
    await this.writeAudit({
      action: 'COUNT_FINALIZED',
      userId,
      inventoryModeBefore: before.mode,
      inventoryModeAfter: before.mode,
      notes,
    });
    return this.getStatus();
  }

  async writeAudit(args: {
    action: CutoverAuditAction;
    userId: number;
    inventoryModeBefore: string;
    inventoryModeAfter: string;
    openingFileHash?: string | null;
    openingPhysicalTotal?: number | null;
    warehousePhysical?: number | null;
    showroomPhysical?: number | null;
    notes?: string | null;
    details?: Record<string, unknown>;
  }) {
    await this.prisma.activity.create({
      data: {
        userId: args.userId,
        type: CUTOVER_AUDIT_TYPE,
        description: `Cutover ${args.action}`,
        details: JSON.stringify({
          action: args.action,
          timestamp: new Date().toISOString(),
          inventoryModeBefore: args.inventoryModeBefore,
          inventoryModeAfter: args.inventoryModeAfter,
          openingFileHash: args.openingFileHash ?? null,
          openingPhysicalTotal: args.openingPhysicalTotal ?? null,
          warehousePhysical: args.warehousePhysical ?? null,
          showroomPhysical: args.showroomPhysical ?? null,
          notes: args.notes ?? null,
          ...(args.details || {}),
        }),
      },
    });
  }
}

export class CutoverDomainError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'CutoverDomainError';
    this.code = code;
  }
}

export function cutoverErrorToHttp(error: unknown): {
  status: number;
  body: { error: string; code?: string };
} | null {
  if (error instanceof CutoverDomainError) {
    const status =
      error.code === 'ALREADY_CUTOVER' || error.code === 'CUTOVER_FROZEN' ? 409 : 400;
    return { status, body: { error: error.message, code: error.code } };
  }
  return null;
}
