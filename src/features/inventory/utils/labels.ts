import type { StockDocumentType, StockMovementType, TransferStatus } from '../types';

export function movementTypeLabel(type: StockMovementType | string): string {
  const map: Record<string, string> = {
    INITIAL: 'Initial Stock',
    SUPPLY: 'Supply',
    SALE: 'Sale',
    RESERVATION: 'Reservation',
    RELEASE: 'Release',
    RETURN: 'Return',
    ADJUSTMENT: 'Adjustment',
    TRANSFER_OUT: 'Transfer Out',
    TRANSFER_IN: 'Transfer In',
  };
  return map[type] ?? type;
}

export function transferStatusLabel(status: TransferStatus | string): string {
  const map: Record<string, string> = {
    DRAFT: 'Draft',
    DISPATCHED: 'Dispatched',
    PARTIALLY_RECEIVED: 'Partially Received',
    RECEIVED: 'Received',
    CANCELLED: 'Cancelled',
  };
  return map[status] ?? status;
}

export function documentTypeLabel(type: StockDocumentType | string): string {
  if (type === 'BON_SORTIE') return 'Bon de Sortie';
  if (type === 'BON_ENTREE') return "Bon d'Entrée";
  return type;
}

export function documentStatusLabel(status: string): string {
  const map: Record<string, string> = {
    DRAFT: 'Draft',
    VALIDATED: 'Validated',
    CANCELLED: 'Cancelled',
  };
  return map[status] ?? status;
}

export function locationDisplayName(code: string, name: string): string {
  if (code === 'WH-MAIN') return 'Warehouse';
  if (code === 'SR-MAIN') return 'Showroom';
  return name || code;
}

/** Map API / transfer error codes to French business messages. */
export function inventoryErrorMessage(error: unknown, fallback = 'Action failed'): string {
  const err = error as {
    response?: { data?: { error?: string; code?: string } };
    message?: string;
  };
  const code = err.response?.data?.code;
  const serverMsg = err.response?.data?.error;

  const byCode: Record<string, string> = {
    INSUFFICIENT_AVAILABLE_STOCK: 'Stock disponible insuffisant pour cet accessoire.',
    OVER_RECEIVE: 'La quantité reçue dépasse la quantité encore en transit.',
    SOURCE_DESTINATION_MUST_DIFFER: 'La source et la destination doivent être différentes.',
    INVALID_QUANTITY: 'La quantité doit être un entier positif.',
    INVALID_PILLOW: 'Accessoire introuvable.',
    INVALID_LOCATION: 'Emplacement invalide.',
    INACTIVE_LOCATION: 'Emplacement inactif.',
    FORBIDDEN_STATUS: 'Cette action n’est pas autorisée pour le statut actuel.',
    CANCELLATION_NOT_ALLOWED:
      'Seul un transfert brouillon peut être annulé. Après expédition, une compensation est requise.',
    DUPLICATE_BON_SORTIE: 'Un Bon de Sortie existe déjà pour ce transfert.',
    NOT_FOUND: 'Élément introuvable.',
    INVENTORY_BALANCE_NOT_FOUND: 'Aucun stock inventaire pour cet accessoire à cet emplacement.',
  };

  if (code && byCode[code]) return byCode[code];
  if (serverMsg) return serverMsg;
  if (err.message) return err.message;
  return fallback;
}
