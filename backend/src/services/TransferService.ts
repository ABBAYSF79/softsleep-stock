import { Prisma, PrismaClient, TransferStatus } from '@prisma/client';
import { DocumentSequenceService } from './DocumentSequenceService';
import { TransferDomainError } from './transfer-errors';

type TxClient = Prisma.TransactionClient;

export type TransferLineInput = { pillowId: number; quantity: number };

const transferInclude = {
  sourceLocation: { select: { id: true, code: true, name: true, type: true, active: true } },
  destinationLocation: { select: { id: true, code: true, name: true, type: true, active: true } },
  lines: {
    include: { pillow: { select: { id: true, name: true } } },
    orderBy: { id: 'asc' as const },
  },
  stockDocuments: {
    include: {
      lines: { include: { pillow: { select: { id: true, name: true } } } },
      location: { select: { id: true, code: true, name: true, type: true } },
    },
    orderBy: { id: 'asc' as const },
  },
  createdBy: { select: { id: true, name: true } },
  dispatchedBy: { select: { id: true, name: true } },
  completedBy: { select: { id: true, name: true } },
} satisfies Prisma.TransferInclude;

/**
 * Transfer workflow (TASK 5 foundation + TASK 10 status/quantities).
 * Stock effects live in StockDocumentService.validateDocument when inventoryMode=INVENTORY.
 */
export class TransferService {
  private readonly sequences: DocumentSequenceService;

  constructor(private readonly prisma: PrismaClient) {
    this.sequences = new DocumentSequenceService(prisma);
  }

  async listTransfers(filters?: { status?: TransferStatus }) {
    const rows = await this.prisma.transfer.findMany({
      where: filters?.status ? { status: filters.status } : undefined,
      include: transferInclude,
      orderBy: { id: 'desc' },
      take: 200,
    });
    return rows.map((t) => this.serialize(t));
  }

  async getTransfer(id: number) {
    const row = await this.prisma.transfer.findUnique({
      where: { id },
      include: transferInclude,
    });
    if (!row) throw new TransferDomainError('NOT_FOUND', 'Transfer not found');
    return this.serialize(row);
  }

  async createTransfer(args: {
    sourceLocationId: number;
    destinationLocationId: number;
    reason?: string | null;
    lines: TransferLineInput[];
    createdById?: number | null;
  }) {
    await this.validateLocations(args.sourceLocationId, args.destinationLocationId);
    const lines = this.normalizeLines(args.lines);
    await this.assertPillowsExist(lines.map((l) => l.pillowId));

    return this.prisma.$transaction(async (tx) => {
      const referenceNumber = await this.sequences.nextNumberInTx(tx, 'TR');
      const created = await tx.transfer.create({
        data: {
          referenceNumber,
          sourceLocationId: args.sourceLocationId,
          destinationLocationId: args.destinationLocationId,
          status: 'DRAFT',
          reason: args.reason ?? null,
          createdById: args.createdById ?? null,
          lines: {
            create: lines.map((l) => ({
              pillowId: l.pillowId,
              sentQuantity: l.quantity,
              receivedQuantity: 0,
            })),
          },
        },
        include: transferInclude,
      });
      return this.serialize(created);
    });
  }

  async updateDraftTransfer(
    id: number,
    args: {
      sourceLocationId?: number;
      destinationLocationId?: number;
      reason?: string | null;
      lines?: TransferLineInput[];
    }
  ) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await this.lockTransfer(tx, id);
      if (existing.status !== 'DRAFT') {
        throw new TransferDomainError('FORBIDDEN_STATUS', 'Only DRAFT transfers can be edited');
      }

      const sourceLocationId = args.sourceLocationId ?? existing.sourceLocationId;
      const destinationLocationId = args.destinationLocationId ?? existing.destinationLocationId;
      await this.validateLocations(sourceLocationId, destinationLocationId, tx);

      if (args.lines) {
        const lines = this.normalizeLines(args.lines);
        await this.assertPillowsExist(lines.map((l) => l.pillowId), tx);
        await tx.transferLine.deleteMany({ where: { transferId: id } });
        await tx.transferLine.createMany({
          data: lines.map((l) => ({
            transferId: id,
            pillowId: l.pillowId,
            sentQuantity: l.quantity,
            receivedQuantity: 0,
          })),
        });
      }

      const updated = await tx.transfer.update({
        where: { id },
        data: {
          sourceLocationId,
          destinationLocationId,
          reason: args.reason === undefined ? undefined : args.reason,
        },
        include: transferInclude,
      });
      return this.serialize(updated);
    });
  }

  async cancelDraftTransfer(id: number) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await this.lockTransfer(tx, id);
      if (existing.status !== 'DRAFT') {
        throw new TransferDomainError(
          'CANCELLATION_NOT_ALLOWED',
          `Cannot cancel transfer in status ${existing.status}. Only DRAFT may be cancelled; post-dispatch cancellation requires a dedicated compensating/reversal workflow.`
        );
      }
      const updated = await tx.transfer.update({
        where: { id },
        data: { status: 'CANCELLED' },
        include: transferInclude,
      });
      return this.serialize(updated);
    });
  }

  /** Called by StockDocumentService after validating a BON_SORTIE. No stock mutation. */
  async markDispatchedInTx(tx: TxClient, transferId: number, userId?: number | null) {
    const transfer = await this.lockTransfer(tx, transferId);
    if (transfer.status !== 'DRAFT') {
      throw new TransferDomainError('FORBIDDEN_STATUS', 'Only DRAFT transfers can be dispatched');
    }
    return tx.transfer.update({
      where: { id: transferId },
      data: {
        status: 'DISPATCHED',
        dispatchedAt: new Date(),
        dispatchedById: userId ?? null,
      },
    });
  }

  /**
   * Apply validated BE quantities to transfer lines (document state only).
   * Locks transfer + lines. No InventoryBalance / StockMovement writes.
   */
  async applyReceiveInTx(
    tx: TxClient,
    transferId: number,
    receiveLines: Array<{ pillowId: number; quantity: number }>,
    userId?: number | null
  ) {
    const transfer = await this.lockTransfer(tx, transferId);
    if (
      transfer.status !== 'DISPATCHED' &&
      transfer.status !== 'PARTIALLY_RECEIVED'
    ) {
      throw new TransferDomainError(
        'FORBIDDEN_STATUS',
        'Receiving is only allowed on DISPATCHED or PARTIALLY_RECEIVED transfers'
      );
    }

    const lines = await tx.$queryRaw<
      Array<{ id: number; pillowId: number; sentQuantity: number; receivedQuantity: number }>
    >`
      SELECT id, pillowId, sentQuantity, receivedQuantity
      FROM TransferLine
      WHERE transferId = ${transferId}
      FOR UPDATE
    `;

    const byPillow = new Map(lines.map((l) => [l.pillowId, l]));
    for (const rl of receiveLines) {
      const line = byPillow.get(rl.pillowId);
      if (!line) {
        throw new TransferDomainError('INVALID_LINE', `Pillow ${rl.pillowId} is not on this transfer`);
      }
      if (!Number.isInteger(rl.quantity) || rl.quantity <= 0) {
        throw new TransferDomainError('INVALID_QUANTITY', 'Receive quantity must be a positive integer');
      }
      const remaining = line.sentQuantity - line.receivedQuantity;
      if (rl.quantity > remaining) {
        throw new TransferDomainError(
          'OVER_RECEIVE',
          `Cannot receive ${rl.quantity} for pillow ${rl.pillowId}; remaining in transit: ${remaining}`
        );
      }
      await tx.transferLine.update({
        where: { id: line.id },
        data: { receivedQuantity: line.receivedQuantity + rl.quantity },
      });
    }

    const refreshed = await tx.transferLine.findMany({ where: { transferId } });
    const totalSent = refreshed.reduce((s, l) => s + l.sentQuantity, 0);
    const totalReceived = refreshed.reduce((s, l) => s + l.receivedQuantity, 0);
    let status: TransferStatus = 'DISPATCHED';
    let completedAt: Date | null = null;
    let completedById: number | null = null;
    if (totalReceived <= 0) {
      status = 'DISPATCHED';
    } else if (totalReceived < totalSent) {
      status = 'PARTIALLY_RECEIVED';
    } else if (totalReceived === totalSent) {
      status = 'RECEIVED';
      completedAt = new Date();
      completedById = userId ?? null;
    } else {
      throw new TransferDomainError('OVER_RECEIVE', 'Total received exceeds sent');
    }

    await tx.transfer.update({
      where: { id: transferId },
      data: {
        status,
        completedAt,
        completedById,
      },
    });
  }

  private async lockTransfer(tx: TxClient, id: number) {
    const rows = await tx.$queryRaw<
      Array<{
        id: number;
        status: TransferStatus;
        sourceLocationId: number;
        destinationLocationId: number;
      }>
    >`
      SELECT id, status, sourceLocationId, destinationLocationId
      FROM Transfer
      WHERE id = ${id}
      FOR UPDATE
    `;
    if (!rows[0]) throw new TransferDomainError('NOT_FOUND', 'Transfer not found');
    return rows[0];
  }

  private async assertPillowsExist(
    pillowIds: number[],
    client: PrismaClient | TxClient = this.prisma
  ) {
    const unique = Array.from(new Set(pillowIds));
    const count = await client.pillow.count({ where: { id: { in: unique } } });
    if (count !== unique.length) {
      throw new TransferDomainError('INVALID_PILLOW', 'One or more pillows were not found');
    }
  }

  private async validateLocations(
    sourceLocationId: number,
    destinationLocationId: number,
    client: PrismaClient | TxClient = this.prisma
  ) {
    if (sourceLocationId === destinationLocationId) {
      throw new TransferDomainError(
        'SOURCE_DESTINATION_MUST_DIFFER',
        'Source and destination locations must differ'
      );
    }
    const locs = await client.location.findMany({
      where: { id: { in: [sourceLocationId, destinationLocationId] } },
    });
    if (locs.length !== 2) {
      throw new TransferDomainError('INVALID_LOCATION', 'Source or destination location not found');
    }
    for (const loc of locs) {
      if (!loc.active) {
        throw new TransferDomainError('INACTIVE_LOCATION', `Location ${loc.code} is inactive`);
      }
    }
  }

  private normalizeLines(lines: TransferLineInput[]) {
    if (!Array.isArray(lines) || lines.length === 0) {
      throw new TransferDomainError('INVALID_LINES', 'At least one transfer line is required');
    }
    const map = new Map<number, number>();
    for (const row of lines) {
      const pillowId = Number(row.pillowId);
      const quantity = Number(row.quantity);
      if (!Number.isInteger(pillowId) || pillowId <= 0) {
        throw new TransferDomainError('INVALID_LINES', 'Invalid pillowId');
      }
      if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new TransferDomainError('INVALID_QUANTITY', 'Line quantity must be a positive integer');
      }
      map.set(pillowId, (map.get(pillowId) || 0) + quantity);
    }
    return Array.from(map.entries()).map(([pillowId, quantity]) => ({ pillowId, quantity }));
  }

  private serialize(t: any) {
    const openTransit =
      t.status === 'DISPATCHED' || t.status === 'PARTIALLY_RECEIVED';
    const lines = (t.lines || []).map((l: any) => {
      const remaining = l.sentQuantity - l.receivedQuantity;
      return {
        id: l.id,
        pillowId: l.pillowId,
        pillow: l.pillow,
        // requestedQuantity aliases sentQuantity (schema has no separate requested field)
        requestedQuantity: l.sentQuantity,
        sentQuantity: l.sentQuantity,
        receivedQuantity: l.receivedQuantity,
        inTransit: remaining,
        inTransitQuantity: openTransit ? Math.max(0, remaining) : 0,
        availableRemainingToReceive: Math.max(0, remaining),
      };
    });
    const totalSent = lines.reduce((s: number, l: any) => s + l.sentQuantity, 0);
    const totalReceived = lines.reduce((s: number, l: any) => s + l.receivedQuantity, 0);
    const totalInTransit = openTransit ? totalSent - totalReceived : 0;
    return {
      id: t.id,
      reference: t.referenceNumber,
      referenceNumber: t.referenceNumber,
      status: t.status,
      reason: t.reason,
      sourceLocation: t.sourceLocation,
      destinationLocation: t.destinationLocation,
      lines,
      totals: {
        sent: totalSent,
        received: totalReceived,
        inTransit: totalInTransit,
      },
      documents: t.stockDocuments || [],
      createdBy: t.createdBy,
      dispatchedBy: t.dispatchedBy,
      completedBy: t.completedBy,
      createdAt: t.createdAt,
      dispatchedAt: t.dispatchedAt,
      completedAt: t.completedAt,
      updatedAt: t.updatedAt,
    };
  }
}
