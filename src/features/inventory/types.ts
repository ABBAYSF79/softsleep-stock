/** Inventory domain types for the Accessoires UI (TASK 11). */

export type InventoryMode = 'LEGACY' | 'INVENTORY';

export type TransferStatus =
  | 'DRAFT'
  | 'DISPATCHED'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'CANCELLED';

export type StockDocumentType = 'BON_SORTIE' | 'BON_ENTREE';

export type StockDocumentStatus = 'DRAFT' | 'VALIDATED' | 'CANCELLED';

export type StockMovementType =
  | 'INITIAL'
  | 'SUPPLY'
  | 'SALE'
  | 'RESERVATION'
  | 'RELEASE'
  | 'RETURN'
  | 'ADJUSTMENT'
  | 'TRANSFER_OUT'
  | 'TRANSFER_IN';

export interface InventoryModeInfo {
  mode: InventoryMode;
  initialized: boolean;
  balanceCount: number;
  cutoverAt: string | null;
  cutoverDate: string | null;
  cutoverStatus?: string;
  countStartedAt?: string | null;
  countFinalizedAt?: string | null;
  freezeActivatedAt?: string | null;
  backupConfirmedAt?: string | null;
  openingFileHash?: string | null;
}

export interface InventoryLocation {
  id: number;
  code: string;
  name: string;
  type: string;
  active: boolean;
  isSellable: boolean;
  allowsPresentation: boolean;
  sortOrder: number;
}

export interface InventoryBalance {
  id: number;
  pillow: { id: number; name: string };
  location: { id: number; code: string; name: string; type: string };
  physical: number;
  presentation: number;
  reserved: number;
  available: number;
  createdAt: string;
  updatedAt: string;
}

export interface TransferLine {
  id: number;
  pillowId: number;
  pillow?: { id: number; name: string };
  requestedQuantity: number;
  sentQuantity: number;
  receivedQuantity: number;
  inTransit: number;
  inTransitQuantity: number;
  availableRemainingToReceive: number;
}

export interface Transfer {
  id: number;
  reference: string;
  referenceNumber: string;
  status: TransferStatus;
  reason: string | null;
  sourceLocation: InventoryLocation | { id: number; code: string; name: string; type: string };
  destinationLocation: InventoryLocation | { id: number; code: string; name: string; type: string };
  lines: TransferLine[];
  totals: { sent: number; received: number; inTransit: number };
  documents: StockDocument[];
  createdBy?: { id: number; name: string } | null;
  dispatchedBy?: { id: number; name: string } | null;
  completedBy?: { id: number; name: string } | null;
  createdAt: string;
  dispatchedAt?: string | null;
  completedAt?: string | null;
  updatedAt: string;
}

export interface StockDocumentLine {
  id: number;
  pillowId: number;
  quantity: number;
  pillow?: { id: number; name: string };
}

export interface StockDocument {
  id: number;
  documentNumber: string;
  type: StockDocumentType;
  status: StockDocumentStatus;
  transferId: number | null;
  locationId: number;
  reason?: string | null;
  location?: { id: number; code: string; name: string; type: string };
  transfer?: {
    id: number;
    referenceNumber: string;
    status: TransferStatus;
    sourceLocationId: number;
    destinationLocationId: number;
  } | null;
  lines: StockDocumentLine[];
  createdBy?: { id: number; name: string } | null;
  validatedBy?: { id: number; name: string } | null;
  createdAt: string;
  validatedAt?: string | null;
  cancelledAt?: string | null;
}

export interface StockMovement {
  id: number;
  pillowId: number;
  locationId: number;
  type: StockMovementType;
  quantity: number;
  previousPhysical: number;
  newPhysical: number;
  previousPresentation: number;
  newPresentation: number;
  previousReserved: number;
  newReserved: number;
  reason: string | null;
  referenceType: string | null;
  referenceId: number | null;
  referenceNumber: string | null;
  userId: number | null;
  createdAt: string;
  pillow?: { id: number; name: string };
  location?: { id: number; code: string; name: string; type: string };
  user?: { id: number; name: string } | null;
}

export interface AccessoryCatalogItem {
  id: number;
  name: string;
  price: number;
  stock: number;
}

/** Aggregated stock row for the Stock page (display-only). */
export interface InventoryStockRow {
  pillowId: number;
  name: string;
  warehousePhysical: number;
  showroomPhysical: number;
  presentation: number;
  reserved: number;
  available: number;
  inTransit: number;
  totalPhysical: number;
}

export interface LocationStockSummary {
  locationId: number;
  code: string;
  name: string;
  type: string;
  physical: number;
  presentation: number;
  reserved: number;
  available: number;
  inTransit: number;
}

export interface CreateTransferInput {
  sourceLocationId: number;
  destinationLocationId: number;
  reason?: string | null;
  lines: Array<{ pillowId: number; quantity: number }>;
}

export interface ReceiveTransferInput {
  lines: Array<{ pillowId: number; quantity: number }>;
}
