import { describe, expect, it } from 'vitest';
import { buildStockRows, computeAvailable } from '@/features/inventory/utils/stockRows';
import { inventoryErrorMessage, movementTypeLabel, transferStatusLabel } from '@/features/inventory/utils/labels';
import type { InventoryBalance, Transfer } from '@/features/inventory/types';

describe('inventory labels', () => {
  it('maps movement types to business labels', () => {
    expect(movementTypeLabel('TRANSFER_OUT')).toBe('Transfer Out');
    expect(movementTypeLabel('TRANSFER_IN')).toBe('Transfer In');
    expect(movementTypeLabel('INITIAL')).toBe('Initial Stock');
  });

  it('maps transfer statuses', () => {
    expect(transferStatusLabel('PARTIALLY_RECEIVED')).toBe('Partially Received');
    expect(transferStatusLabel('DRAFT')).toBe('Draft');
  });

  it('maps insufficient stock errors', () => {
    const msg = inventoryErrorMessage({
      response: { data: { code: 'INSUFFICIENT_AVAILABLE_STOCK' } },
    });
    expect(msg).toContain('insuffisant');
  });

  it('maps over-receive errors', () => {
    const msg = inventoryErrorMessage({
      response: { data: { code: 'OVER_RECEIVE' } },
    });
    expect(msg).toContain('transit');
  });
});

describe('stock row aggregation', () => {
  const balances: InventoryBalance[] = [
    {
      id: 1,
      pillow: { id: 10, name: 'Ice Sleep' },
      location: { id: 1, code: 'WH-MAIN', name: 'Warehouse', type: 'WAREHOUSE' },
      physical: 16,
      presentation: 0,
      reserved: 2,
      available: 14,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 2,
      pillow: { id: 10, name: 'Ice Sleep' },
      location: { id: 2, code: 'SR-MAIN', name: 'Showroom', type: 'SHOWROOM' },
      physical: 5,
      presentation: 1,
      reserved: 0,
      available: 4,
      createdAt: '',
      updatedAt: '',
    },
  ];

  const transfers: Transfer[] = [
    {
      id: 1,
      reference: 'TR-1',
      referenceNumber: 'TR-1',
      status: 'DISPATCHED',
      reason: null,
      sourceLocation: { id: 1, code: 'WH-MAIN', name: 'Warehouse', type: 'WAREHOUSE', active: true, isSellable: true, allowsPresentation: false, sortOrder: 1 },
      destinationLocation: { id: 2, code: 'SR-MAIN', name: 'Showroom', type: 'SHOWROOM', active: true, isSellable: true, allowsPresentation: true, sortOrder: 2 },
      lines: [
        {
          id: 1,
          pillowId: 10,
          requestedQuantity: 3,
          sentQuantity: 3,
          receivedQuantity: 0,
          inTransit: 3,
          inTransitQuantity: 3,
          availableRemainingToReceive: 3,
        },
      ],
      totals: { sent: 3, received: 0, inTransit: 3 },
      documents: [],
      createdAt: '',
      updatedAt: '',
    },
  ];

  it('builds stock rows with warehouse/showroom and in-transit', () => {
    const rows = buildStockRows(balances, transfers);
    expect(rows).toHaveLength(1);
    expect(rows[0].warehousePhysical).toBe(16);
    expect(rows[0].showroomPhysical).toBe(5);
    expect(rows[0].available).toBe(18);
    expect(rows[0].inTransit).toBe(3);
    expect(rows[0].totalPhysical).toBe(21);
  });

  it('computeAvailable mirrors backend formula', () => {
    expect(computeAvailable(20, 5, 3)).toBe(12);
  });
});
