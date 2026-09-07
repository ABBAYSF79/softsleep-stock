import { Prisma, PrismaClient, StockDocumentType } from '@prisma/client';
import { DocumentSequenceService } from './DocumentSequenceService';
import { TransferService } from './TransferService';
import { TransferDomainError } from './transfer-errors';
import { InventoryError, InventoryService } from './InventoryService';
import { getInventoryMode } from './InventoryMode';
import { syncPillowStockMirror } from './PillowStockMirror';

type TxClient = Prisma.TransactionClient;

export type DocumentLineInput = { pillowId: number; quantity: number };

const documentInclude = {
  location: { select: { id: true, code: true, name: true, type: true } },
  transfer: {
    select: {
      id: true,
      referenceNumber: true,
      status: true,
      sourceLocationId: true,
      destinationLocationId: true,
    },
  },
  lines: {
    include: { pillow: { select: { id: true, name: true } } },
    orderBy: { id: 'asc' as const },
  },
  createdBy: { select: { id: true, name: true } },
  validatedBy: { select: { id: true, name: true } },
} satisfies Prisma.StockDocumentInclude;

/**
 * Stock documents (TASK 5 foundation + TASK 10 inventory stock effects).
 *
 * LEGACY inventoryMode: document/transfer state only (no InventoryBalance mutation).
 * INVENTORY inventoryMode: BS → TRANSFER_OUT; BE → TRANSFER_IN via InventoryService.
 */
export class StockDocumentService {
  private readonly sequences: DocumentSequenceService;
  private readonly transfers: TransferService;
  private readonly inventory: InventoryService;

  constructor(private readonly prisma: PrismaClient) {
    this.sequences = new DocumentSequenceService(prisma);
    this.transfers = new TransferService(prisma);
    this.inventory = new InventoryService(prisma);
  }

  async listDocuments(filters?: { type?: StockDocumentType; transferId?: number; status?: string }) {
    const rows = await this.prisma.stockDocument.findMany({
      where: {
        ...(filters?.type ? { type: filters.type } : {}),
        ...(filters?.transferId ? { transferId: filters.transferId } : {}),
        ...(filters?.status ? { status: filters.status as any } : {}),
      },
      include: documentInclude,
      orderBy: { id: 'desc' },
      take: 200,
    });
    return rows;
  }

  async getDocument(id: number) {
    const row = await this.prisma.stockDocument.findUnique({
      where: { id },
      include: documentInclude,
    });
    if (!row) throw new TransferDomainError('NOT_FOUND', 'Stock document not found');
    return row;
  }

  async createDraftDocument(args: {
    type: StockDocumentType;
    transferId: number;
    reason?: string | null;
    lines: DocumentLineInput[];
    createdById?: number | null;
  }) {
    if (args.type !== 'BON_SORTIE' && args.type !== 'BON_ENTREE') {
      throw new TransferDomainError('INVALID_TYPE', 'Invalid document type');
    }
    const lines = this.normalizeLines(args.lines);

    return this.prisma.$transaction(async (tx) => {
      const transfer = await this.lockTransfer(tx, args.transferId);

      if (args.type === 'BON_SORTIE') {
        if (transfer.status !== 'DRAFT') {
          throw new TransferDomainError('FORBIDDEN_STATUS', 'Bon de Sortie requires a DRAFT transfer');
        }
        const existingBs = await tx.stockDocument.count({
          where: { transferId: args.transferId, type: 'BON_SORTIE', status: { not: 'CANCELLED' } },
        });
        if (existingBs > 0) {
          throw new TransferDomainError('DUPLICATE_BON_SORTIE', 'Transfer already has a Bon de Sortie');
        }
        await this.assertBsLinesMatchTransfer(tx, args.transferId, lines);
      } else {
        if (transfer.status !== 'DISPATCHED' && transfer.status !== 'PARTIALLY_RECEIVED') {
          throw new TransferDomainError(
            'FORBIDDEN_STATUS',
            'Bon d’Entrée requires a DISPATCHED or PARTIALLY_RECEIVED transfer'
          );
        }
        await this.assertBeWithinRemaining(tx, args.transferId, lines);
      }

      const locationId =
        args.type === 'BON_SORTIE' ? transfer.sourceLocationId : transfer.destinationLocationId;
      const prefix = args.type === 'BON_SORTIE' ? 'BS' : 'BE';
      const documentNumber = await this.sequences.nextNumberInTx(tx, prefix);

      return tx.stockDocument.create({
        data: {
          documentNumber,
          type: args.type,
          status: 'DRAFT',
          transferId: args.transferId,
          locationId,
          reason: args.reason ?? null,
          createdById: args.createdById ?? null,
          lines: {
            create: lines.map((l) => ({
              pillowId: l.pillowId,
              quantity: l.quantity,
            })),
          },
        },
        include: documentInclude,
      });
    });
  }

  async updateDraftDocument(
    id: number,
    args: { reason?: string | null; lines?: DocumentLineInput[] }
  ) {
    return this.prisma.$transaction(async (tx) => {
      const doc = await this.lockDocument(tx, id);
      if (doc.status !== 'DRAFT') {
        throw new TransferDomainError('FORBIDDEN_STATUS', 'Only DRAFT documents can be edited');
      }
      if (!doc.transferId) {
        throw new TransferDomainError('INVALID_TRANSFER', 'Document is not linked to a transfer');
      }

      if (args.lines) {
        const lines = this.normalizeLines(args.lines);
        if (doc.type === 'BON_SORTIE') {
          await this.assertBsLinesMatchTransfer(tx, doc.transferId, lines);
        } else {
          await this.assertBeWithinRemaining(tx, doc.transferId, lines);
        }
        await tx.stockDocumentLine.deleteMany({ where: { stockDocumentId: id } });
        await tx.stockDocumentLine.createMany({
          data: lines.map((l) => ({
            stockDocumentId: id,
            pillowId: l.pillowId,
            quantity: l.quantity,
          })),
        });
      }

      return tx.stockDocument.update({
        where: { id },
        data: {
          reason: args.reason === undefined ? undefined : args.reason,
        },
        include: documentInclude,
      });
    });
  }

  async cancelDraftDocument(id: number) {
    return this.prisma.$transaction(async (tx) => {
      const doc = await this.lockDocument(tx, id);
      if (doc.status !== 'DRAFT') {
        throw new TransferDomainError('FORBIDDEN_STATUS', 'Only DRAFT documents can be cancelled');
      }
      return tx.stockDocument.update({
        where: { id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
        include: documentInclude,
      });
    });
  }

  /**
   * Validate document atomically:
   * - BS: optional InventoryService TRANSFER_OUT (INVENTORY mode) + dispatch transfer
   * - BE: optional InventoryService TRANSFER_IN (INVENTORY mode) + apply receive
   *
   * LEGACY mode: transfer/document state only (no InventoryBalance / StockMovement).
   */
  async validateDocument(id: number, validatedById?: number | null) {
    const mode = await getInventoryMode(this.prisma);

    return this.prisma.$transaction(async (tx) => {
      const doc = await this.lockDocument(tx, id);
      if (doc.status !== 'DRAFT') {
        throw new TransferDomainError('FORBIDDEN_STATUS', 'Only DRAFT documents can be validated');
      }
      if (!doc.transferId) {
        throw new TransferDomainError('INVALID_TRANSFER', 'Document is not linked to a transfer');
      }

      const lines = await tx.stockDocumentLine.findMany({ where: { stockDocumentId: id } });
      if (lines.length === 0) {
        throw new TransferDomainError('INVALID_LINES', 'Document has no lines');
      }

      const transfer = await this.lockTransfer(tx, doc.transferId);
      const transferFull = await tx.transfer.findUnique({ where: { id: doc.transferId } });
      if (!transferFull) throw new TransferDomainError('NOT_FOUND', 'Transfer not found');

      if (doc.type === 'BON_SORTIE') {
        await this.assertBsLinesMatchTransfer(
          tx,
          doc.transferId,
          lines.map((l) => ({ pillowId: l.pillowId, quantity: l.quantity }))
        );

        if (mode === 'INVENTORY') {
          for (const line of lines) {
            try {
              await this.inventory.decreasePhysicalInTx(tx, {
                pillowId: line.pillowId,
                locationId: transfer.sourceLocationId,
                quantity: line.quantity,
                requireExistingBalance: true,
                type: 'TRANSFER_OUT',
                reason: `BS ${doc.documentNumber} / transfer ${transferFull.referenceNumber}`,
                referenceType: 'TRANSFER',
                referenceId: transferFull.id,
                referenceNumber: transferFull.referenceNumber,
                userId: validatedById ?? null,
                // Sync after markDispatched so in-transit is counted in Pillow.stock
                skipMirrorSync: true,
              });
            } catch (e) {
              this.rethrowInventoryAsTransfer(e);
            }
          }
        }

        await this.transfers.markDispatchedInTx(tx, doc.transferId, validatedById);

        if (mode === 'INVENTORY') {
          const pillowIds = Array.from(new Set(lines.map((l) => l.pillowId)));
          for (const pillowId of pillowIds) {
            await syncPillowStockMirror(tx, pillowId);
          }
        }
      } else {
        await this.assertBeWithinRemaining(
          tx,
          doc.transferId,
          lines.map((l) => ({ pillowId: l.pillowId, quantity: l.quantity }))
        );

        if (mode === 'INVENTORY') {
          for (const line of lines) {
            try {
              await this.inventory.increasePhysicalInTx(tx, {
                pillowId: line.pillowId,
                locationId: transfer.destinationLocationId,
                quantity: line.quantity,
                // Destination balance may not exist yet (first receipt creates it)
                requireExistingBalance: false,
                type: 'TRANSFER_IN',
                reason: `BE ${doc.documentNumber} / transfer ${transferFull.referenceNumber}`,
                referenceType: 'TRANSFER',
                referenceId: transferFull.id,
                referenceNumber: transferFull.referenceNumber,
                userId: validatedById ?? null,
                skipMirrorSync: true,
                forceSyncMirror: true,
              });
            } catch (e) {
              this.rethrowInventoryAsTransfer(e);
            }
          }
        }

        await this.transfers.applyReceiveInTx(
          tx,
          doc.transferId,
          lines.map((l) => ({ pillowId: l.pillowId, quantity: l.quantity })),
          validatedById
        );

        if (mode === 'INVENTORY') {
          const pillowIds = Array.from(new Set(lines.map((l) => l.pillowId)));
          for (const pillowId of pillowIds) {
            await syncPillowStockMirror(tx, pillowId);
          }
        }
      }

      const validated = await tx.stockDocument.update({
        where: { id },
        data: {
          status: 'VALIDATED',
          validatedAt: new Date(),
          validatedById: validatedById ?? null,
        },
        include: documentInclude,
      });

      if (validatedById) {
        await tx.activity.create({
          data: {
            userId: validatedById,
            type: doc.type === 'BON_SORTIE' ? 'TRANSFER_BS_VALIDATED' : 'TRANSFER_BE_VALIDATED',
            description: `Validated ${validated.documentNumber} for transfer ${transferFull.referenceNumber}`,
            details: JSON.stringify({
              documentId: validated.id,
              documentNumber: validated.documentNumber,
              documentType: validated.type,
              transferId: transferFull.id,
              transferReference: transferFull.referenceNumber,
              inventoryMode: mode,
              lines: lines.map((l) => ({ pillowId: l.pillowId, quantity: l.quantity })),
              sourceLocationId: transfer.sourceLocationId,
              destinationLocationId: transfer.destinationLocationId,
            }),
          },
        });
      }

      return validated;
    });
  }

  /**
   * Convenience: create BS from transfer lines (if needed) and validate → DISPATCHED.
   */
  async dispatchTransfer(transferId: number, userId?: number | null) {
    const transfer = await this.transfers.getTransfer(transferId);
    if (transfer.status !== 'DRAFT') {
      throw new TransferDomainError('FORBIDDEN_STATUS', 'Only DRAFT transfers can be dispatched');
    }

    const existingBs = await this.prisma.stockDocument.findFirst({
      where: { transferId, type: 'BON_SORTIE', status: { not: 'CANCELLED' } },
    });

    let bsId = existingBs?.id;
    if (!bsId) {
      const bs = await this.createDraftDocument({
        type: 'BON_SORTIE',
        transferId,
        lines: transfer.lines.map((l: any) => ({
          pillowId: l.pillowId,
          quantity: l.sentQuantity,
        })),
        createdById: userId ?? null,
      });
      bsId = bs.id;
    } else if (existingBs!.status === 'VALIDATED') {
      throw new TransferDomainError('FORBIDDEN_STATUS', 'Bon de Sortie already validated');
    }

    return this.validateDocument(bsId, userId);
  }

  /**
   * Convenience: create BE for receive lines and validate.
   */
  async receiveTransfer(
    transferId: number,
    lines: DocumentLineInput[],
    userId?: number | null
  ) {
    const transfer = await this.transfers.getTransfer(transferId);
    if (transfer.status !== 'DISPATCHED' && transfer.status !== 'PARTIALLY_RECEIVED') {
      throw new TransferDomainError(
        'FORBIDDEN_STATUS',
        'Receiving requires DISPATCHED or PARTIALLY_RECEIVED transfer'
      );
    }

    const be = await this.createDraftDocument({
      type: 'BON_ENTREE',
      transferId,
      lines,
      createdById: userId ?? null,
    });

    return this.validateDocument(be.id, userId);
  }

  private rethrowInventoryAsTransfer(e: unknown): never {
    if (e instanceof InventoryError) {
      throw new TransferDomainError(
        e.code === 'INSUFFICIENT_AVAILABLE_STOCK'
          ? 'INSUFFICIENT_AVAILABLE_STOCK'
          : e.code === 'INVENTORY_BALANCE_NOT_FOUND'
            ? 'INVENTORY_BALANCE_NOT_FOUND'
            : 'INVENTORY_ERROR',
        e.message
      );
    }
    throw e;
  }

  private async lockTransfer(tx: TxClient, id: number) {
    const rows = await tx.$queryRaw<
      Array<{
        id: number;
        status: string;
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

  private async lockDocument(tx: TxClient, id: number) {
    const rows = await tx.$queryRaw<
      Array<{
        id: number;
        type: StockDocumentType;
        status: string;
        transferId: number | null;
        locationId: number;
        documentNumber: string;
      }>
    >`
      SELECT id, type, status, transferId, locationId, documentNumber
      FROM StockDocument
      WHERE id = ${id}
      FOR UPDATE
    `;
    if (!rows[0]) throw new TransferDomainError('NOT_FOUND', 'Stock document not found');
    return rows[0];
  }

  private async assertBsLinesMatchTransfer(
    tx: TxClient,
    transferId: number,
    lines: DocumentLineInput[]
  ) {
    const transferLines = await tx.transferLine.findMany({ where: { transferId } });
    if (transferLines.length !== lines.length) {
      throw new TransferDomainError(
        'BS_LINES_MISMATCH',
        'Bon de Sortie lines must exactly match transfer lines'
      );
    }
    const map = new Map(transferLines.map((l) => [l.pillowId, l.sentQuantity]));
    for (const line of lines) {
      const sent = map.get(line.pillowId);
      if (sent === undefined || sent !== line.quantity) {
        throw new TransferDomainError(
          'BS_LINES_MISMATCH',
          'Bon de Sortie quantities must match transfer sent quantities'
        );
      }
    }
  }

  private async assertBeWithinRemaining(
    tx: TxClient,
    transferId: number,
    lines: DocumentLineInput[]
  ) {
    const transferLines = await tx.$queryRaw<
      Array<{ pillowId: number; sentQuantity: number; receivedQuantity: number }>
    >`
      SELECT pillowId, sentQuantity, receivedQuantity
      FROM TransferLine
      WHERE transferId = ${transferId}
      FOR UPDATE
    `;
    const map = new Map(transferLines.map((l) => [l.pillowId, l]));
    for (const line of lines) {
      const tl = map.get(line.pillowId);
      if (!tl) {
        throw new TransferDomainError('INVALID_LINE', `Pillow ${line.pillowId} is not on this transfer`);
      }
      const remaining = tl.sentQuantity - tl.receivedQuantity;
      if (line.quantity > remaining) {
        throw new TransferDomainError(
          'OVER_RECEIVE',
          `Cannot receive ${line.quantity} for pillow ${line.pillowId}; remaining: ${remaining}`
        );
      }
    }
  }

  private normalizeLines(lines: DocumentLineInput[]) {
    if (!Array.isArray(lines) || lines.length === 0) {
      throw new TransferDomainError('INVALID_LINES', 'At least one document line is required');
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
}
