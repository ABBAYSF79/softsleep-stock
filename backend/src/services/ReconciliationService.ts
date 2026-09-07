import { PrismaClient } from '@prisma/client';
import { computeAvailable } from '../utils/inventory-balance';
import { computeCompanyPhysicalStock } from './PillowStockMirror';

export type ReconciliationMismatch = {
  code: string;
  severity: 'error' | 'warning';
  pillowId?: number;
  locationId?: number;
  transferId?: number;
  movementId?: number;
  message: string;
  details?: Record<string, unknown>;
};

export type ReconciliationReport = {
  status: 'HEALTHY' | 'INCONSISTENT';
  checkedAt: string;
  pillowCount: number;
  balanceCount: number;
  movementCount: number;
  transferCount: number;
  mismatchCount: number;
  mismatches: ReconciliationMismatch[];
};

/**
 * Read-only inventory reconciliation (TASK 13).
 * Detects mismatches; never mutates data.
 */
export class ReconciliationService {
  constructor(private readonly prisma: PrismaClient) {}

  async reconcileInventory(): Promise<ReconciliationReport> {
    const checkedAt = new Date().toISOString();
    const mismatches: ReconciliationMismatch[] = [];

    const [pillowCount, balanceCount, movementCount, transferCount] = await Promise.all([
      this.prisma.pillow.count(),
      this.prisma.inventoryBalance.count(),
      this.prisma.stockMovement.count(),
      this.prisma.transfer.count(),
    ]);

    // --- Invalid balance invariants ---
    const balances = await this.prisma.inventoryBalance.findMany({
      select: {
        id: true,
        pillowId: true,
        locationId: true,
        physical: true,
        presentation: true,
        reserved: true,
        location: { select: { code: true, allowsPresentation: true } },
      },
    });

    for (const b of balances) {
      if (b.physical < 0 || b.presentation < 0 || b.reserved < 0) {
        mismatches.push({
          code: 'INVALID_BALANCE_NEGATIVE',
          severity: 'error',
          pillowId: b.pillowId,
          locationId: b.locationId,
          message: `Negative quantity on balance ${b.id}`,
          details: {
            physical: b.physical,
            presentation: b.presentation,
            reserved: b.reserved,
          },
        });
      }
      if (b.presentation > b.physical) {
        mismatches.push({
          code: 'INVALID_BALANCE_PRESENTATION',
          severity: 'error',
          pillowId: b.pillowId,
          locationId: b.locationId,
          message: `Presentation (${b.presentation}) > physical (${b.physical})`,
        });
      }
      if (b.reserved > b.physical - b.presentation) {
        mismatches.push({
          code: 'INVALID_BALANCE_RESERVED',
          severity: 'error',
          pillowId: b.pillowId,
          locationId: b.locationId,
          message: `Reserved (${b.reserved}) exceeds physical - presentation`,
        });
      }
      const available = computeAvailable(b.physical, b.presentation, b.reserved);
      if (available < 0) {
        mismatches.push({
          code: 'INVALID_BALANCE_AVAILABLE',
          severity: 'error',
          pillowId: b.pillowId,
          locationId: b.locationId,
          message: `Computed available is negative (${available})`,
        });
      }
      if (!b.location.allowsPresentation && b.presentation > 0) {
        mismatches.push({
          code: 'PRESENTATION_ON_NON_SHOWROOM',
          severity: 'error',
          pillowId: b.pillowId,
          locationId: b.locationId,
          message: `Presentation > 0 on location that disallows presentation (${b.location.code})`,
        });
      }
    }

    // --- Pillow.stock mirror vs company physical ---
    const pillowsWithBalances = await this.prisma.pillow.findMany({
      where: { inventoryBalances: { some: {} } },
      select: { id: true, stock: true, name: true },
    });

    for (const pillow of pillowsWithBalances) {
      const expected = await this.prisma.$transaction(async (tx) =>
        computeCompanyPhysicalStock(tx, pillow.id)
      );
      if (pillow.stock !== expected) {
        mismatches.push({
          code: 'PHYSICAL_MIRROR_MISMATCH',
          severity: 'error',
          pillowId: pillow.id,
          message: `Pillow.stock (${pillow.stock}) != company physical (${expected}) for "${pillow.name}"`,
          details: { pillowStock: pillow.stock, companyPhysical: expected },
        });
      }
    }

    // --- Transfer line integrity ---
    const transferLines = await this.prisma.transferLine.findMany({
      select: {
        id: true,
        transferId: true,
        pillowId: true,
        sentQuantity: true,
        receivedQuantity: true,
        transfer: { select: { status: true, referenceNumber: true } },
      },
    });

    for (const line of transferLines) {
      if (line.receivedQuantity > line.sentQuantity) {
        mismatches.push({
          code: 'TRANSFER_RECEIVED_GT_SENT',
          severity: 'error',
          transferId: line.transferId,
          pillowId: line.pillowId,
          message: `Transfer ${line.transfer.referenceNumber}: received (${line.receivedQuantity}) > sent (${line.sentQuantity})`,
        });
      }
      if (line.sentQuantity < 0 || line.receivedQuantity < 0) {
        mismatches.push({
          code: 'TRANSFER_NEGATIVE_QTY',
          severity: 'error',
          transferId: line.transferId,
          pillowId: line.pillowId,
          message: 'Transfer line has negative quantity',
        });
      }
    }

    // --- Obvious movement inconsistencies (before/after vs quantity for physical types) ---
    const movements = await this.prisma.stockMovement.findMany({
      where: {
        type: { in: ['SUPPLY', 'SALE', 'ADJUSTMENT', 'TRANSFER_OUT', 'TRANSFER_IN', 'RETURN'] },
      },
      select: {
        id: true,
        type: true,
        quantity: true,
        previousPhysical: true,
        newPhysical: true,
        previousPresentation: true,
        newPresentation: true,
        previousReserved: true,
        newReserved: true,
        pillowId: true,
        locationId: true,
      },
      take: 5000,
      orderBy: { id: 'desc' },
    });

    for (const m of movements) {
      const physicalDelta = m.newPhysical - m.previousPhysical;
      if (
        ['SUPPLY', 'SALE', 'ADJUSTMENT', 'TRANSFER_OUT', 'TRANSFER_IN', 'RETURN'].includes(m.type) &&
        m.previousPresentation === m.newPresentation &&
        m.previousReserved === m.newReserved &&
        physicalDelta !== m.quantity
      ) {
        // Presentation-only ADJUSTMENTs have quantity = presentation delta; skip those
        if (m.type === 'ADJUSTMENT' && physicalDelta === 0) continue;
        mismatches.push({
          code: 'MOVEMENT_QUANTITY_MISMATCH',
          severity: 'warning',
          movementId: m.id,
          pillowId: m.pillowId,
          locationId: m.locationId,
          message: `Movement ${m.id} (${m.type}): quantity ${m.quantity} != physical delta ${physicalDelta}`,
        });
      }
      if (m.newPhysical < 0 || m.previousPhysical < 0) {
        mismatches.push({
          code: 'MOVEMENT_NEGATIVE_PHYSICAL',
          severity: 'error',
          movementId: m.id,
          pillowId: m.pillowId,
          locationId: m.locationId,
          message: `Movement ${m.id} records negative physical`,
        });
      }
    }

    return {
      status: mismatches.length === 0 ? 'HEALTHY' : 'INCONSISTENT',
      checkedAt,
      pillowCount,
      balanceCount,
      movementCount,
      transferCount,
      mismatchCount: mismatches.length,
      mismatches,
    };
  }
}
