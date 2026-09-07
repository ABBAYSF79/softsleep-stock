import type {
  InventoryBalance,
  InventoryStockRow,
  LocationStockSummary,
  Transfer,
} from '../types';

export function computeAvailable(physical: number, presentation: number, reserved: number): number {
  return physical - presentation - reserved;
}

/**
 * Build per-accessory stock rows from balances + open transfer in-transit.
 * Warehouse / Showroom columns aggregate by location.type (supports multiple sites).
 */
export function buildStockRows(
  balances: InventoryBalance[],
  transfers: Transfer[],
  warehouseCode = 'WH-MAIN',
  showroomCode = 'SR-MAIN'
): InventoryStockRow[] {
  const byPillow = new Map<
    number,
    {
      name: string;
      warehousePhysical: number;
      showroomPhysical: number;
      otherPhysical: number;
      presentation: number;
      reserved: number;
      available: number;
    }
  >();

  for (const b of balances) {
    const existing = byPillow.get(b.pillow.id) ?? {
      name: b.pillow.name,
      warehousePhysical: 0,
      showroomPhysical: 0,
      otherPhysical: 0,
      presentation: 0,
      reserved: 0,
      available: 0,
    };
    const locType = b.location.type;
    if (locType === 'WAREHOUSE' || (!locType && b.location.code === warehouseCode)) {
      existing.warehousePhysical += b.physical;
    } else if (locType === 'SHOWROOM' || (!locType && b.location.code === showroomCode)) {
      existing.showroomPhysical += b.physical;
    } else if (b.location.code === warehouseCode) {
      existing.warehousePhysical += b.physical;
    } else if (b.location.code === showroomCode) {
      existing.showroomPhysical += b.physical;
    } else {
      existing.otherPhysical += b.physical;
    }
    existing.presentation += b.presentation;
    existing.reserved += b.reserved;
    existing.available += b.available;
    existing.name = b.pillow.name;
    byPillow.set(b.pillow.id, existing);
  }

  const inTransitByPillow = new Map<number, number>();
  for (const t of transfers) {
    if (t.status !== 'DISPATCHED' && t.status !== 'PARTIALLY_RECEIVED') continue;
    for (const line of t.lines) {
      const qty = line.inTransitQuantity ?? Math.max(0, line.sentQuantity - line.receivedQuantity);
      inTransitByPillow.set(line.pillowId, (inTransitByPillow.get(line.pillowId) ?? 0) + qty);
    }
  }

  return Array.from(byPillow.entries())
    .map(([pillowId, row]) => {
      const inTransit = inTransitByPillow.get(pillowId) ?? 0;
      return {
        pillowId,
        name: row.name,
        warehousePhysical: row.warehousePhysical,
        showroomPhysical: row.showroomPhysical,
        presentation: row.presentation,
        reserved: row.reserved,
        available: row.available,
        inTransit,
        totalPhysical: row.warehousePhysical + row.showroomPhysical + row.otherPhysical,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function buildLocationSummaries(
  balances: InventoryBalance[],
  transfers: Transfer[],
  locations: Array<{ id: number; code: string; name: string; type: string }>
): LocationStockSummary[] {
  return locations.map((loc) => {
    const locBalances = balances.filter((b) => b.location.id === loc.id);
    const physical = locBalances.reduce((s, b) => s + b.physical, 0);
    const presentation = locBalances.reduce((s, b) => s + b.presentation, 0);
    const reserved = locBalances.reduce((s, b) => s + b.reserved, 0);
    const available = locBalances.reduce((s, b) => s + b.available, 0);

    // In-transit attributed to transfers leaving this location (source)
    let inTransit = 0;
    for (const t of transfers) {
      if (t.status !== 'DISPATCHED' && t.status !== 'PARTIALLY_RECEIVED') continue;
      if (t.sourceLocation.id !== loc.id) continue;
      inTransit += t.totals?.inTransit ?? 0;
    }

    return {
      locationId: loc.id,
      code: loc.code,
      name: loc.name,
      type: loc.type,
      physical,
      presentation,
      reserved,
      available,
      inTransit,
    };
  });
}

export function availableAtLocation(
  balances: InventoryBalance[],
  pillowId: number,
  locationId: number
): number {
  const b = balances.find((x) => x.pillow.id === pillowId && x.location.id === locationId);
  return b?.available ?? 0;
}
