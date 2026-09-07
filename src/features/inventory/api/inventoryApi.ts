import api from '@/lib/api';
import type {
  AccessoryCatalogItem,
  CreateTransferInput,
  InventoryBalance,
  InventoryLocation,
  InventoryModeInfo,
  ReceiveTransferInput,
  StockDocument,
  StockMovement,
  Transfer,
} from '../types';

export const inventoryApi = {
  getMode: async (): Promise<InventoryModeInfo> => {
    const { data } = await api.get('/inventory/mode', { timeout: 15000 });
    return data;
  },

  getLocations: async (params?: { includeInactive?: boolean }): Promise<InventoryLocation[]> => {
    const { data } = await api.get('/inventory/locations', {
      params: {
        ...(params?.includeInactive ? { includeInactive: '1' } : {}),
      },
      timeout: 15000,
    });
    return data;
  },

  createLocation: async (input: {
    code?: string;
    name: string;
    type: 'WAREHOUSE' | 'SHOWROOM' | 'OTHER';
    isSellable?: boolean;
    allowsPresentation?: boolean;
    sortOrder?: number;
  }): Promise<InventoryLocation> => {
    const { data } = await api.post('/inventory/locations', input, { timeout: 15000 });
    return data;
  },

  updateLocation: async (
    id: number,
    input: {
      name?: string;
      type?: 'WAREHOUSE' | 'SHOWROOM' | 'OTHER';
      active?: boolean;
      isSellable?: boolean;
      allowsPresentation?: boolean;
      sortOrder?: number;
    }
  ): Promise<InventoryLocation> => {
    const { data } = await api.patch(`/inventory/locations/${id}`, input, { timeout: 15000 });
    return data;
  },

  getBalances: async (params?: {
    pillowId?: number;
    locationId?: number;
  }): Promise<InventoryBalance[]> => {
    const { data } = await api.get('/inventory/balances', {
      params: {
        ...(params?.pillowId ? { pillowId: params.pillowId } : {}),
        ...(params?.locationId ? { locationId: params.locationId } : {}),
      },
      timeout: 15000,
    });
    return data;
  },

  getMovements: async (params?: {
    pillowId?: number;
    locationId?: number;
    type?: string;
    referenceType?: string;
    referenceId?: number;
    limit?: number;
  }): Promise<StockMovement[]> => {
    const { data } = await api.get('/inventory/movements', {
      params: {
        ...(params?.pillowId ? { pillowId: params.pillowId } : {}),
        ...(params?.locationId ? { locationId: params.locationId } : {}),
        ...(params?.type ? { type: params.type } : {}),
        ...(params?.referenceType ? { referenceType: params.referenceType } : {}),
        ...(params?.referenceId ? { referenceId: params.referenceId } : {}),
        ...(params?.limit ? { limit: params.limit } : {}),
      },
      timeout: 15000,
    });
    return data;
  },

  getTransfers: async (params?: { status?: string }): Promise<Transfer[]> => {
    const { data } = await api.get('/inventory/transfers', {
      params: { ...(params?.status ? { status: params.status } : {}) },
      timeout: 15000,
    });
    return data;
  },

  getTransfer: async (id: number): Promise<Transfer> => {
    const { data } = await api.get(`/inventory/transfers/${id}`, { timeout: 15000 });
    return data;
  },

  createTransfer: async (input: CreateTransferInput): Promise<Transfer> => {
    const { data } = await api.post('/inventory/transfers', input, { timeout: 20000 });
    return data;
  },

  cancelTransfer: async (id: number): Promise<Transfer> => {
    const { data } = await api.post(`/inventory/transfers/${id}/cancel`, {}, { timeout: 15000 });
    return data;
  },

  dispatchTransfer: async (id: number): Promise<StockDocument> => {
    const { data } = await api.post(`/inventory/transfers/${id}/dispatch`, {}, { timeout: 30000 });
    return data;
  },

  receiveTransfer: async (id: number, input: ReceiveTransferInput): Promise<StockDocument> => {
    const { data } = await api.post(`/inventory/transfers/${id}/receive`, input, {
      timeout: 30000,
    });
    return data;
  },

  getDocuments: async (params?: {
    type?: string;
    transferId?: number;
    status?: string;
  }): Promise<StockDocument[]> => {
    const { data } = await api.get('/inventory/documents', {
      params: {
        ...(params?.type ? { type: params.type } : {}),
        ...(params?.transferId ? { transferId: params.transferId } : {}),
        ...(params?.status ? { status: params.status } : {}),
      },
      timeout: 15000,
    });
    return data;
  },

  getDocument: async (id: number): Promise<StockDocument> => {
    const { data } = await api.get(`/inventory/documents/${id}`, { timeout: 15000 });
    return data;
  },

  getReservations: async (params?: {
    status?: string;
    orderId?: number;
    pillowOrderId?: number;
  }) => {
    const { data } = await api.get('/inventory/reservations', {
      params: {
        ...(params?.status ? { status: params.status } : {}),
        ...(params?.orderId ? { orderId: params.orderId } : {}),
        ...(params?.pillowOrderId ? { pillowOrderId: params.pillowOrderId } : {}),
      },
      timeout: 15000,
    });
    return data;
  },

  getReservation: async (id: number) => {
    const { data } = await api.get(`/inventory/reservations/${id}`, { timeout: 15000 });
    return data;
  },

  supply: async (input: {
    pillowId: number;
    locationId: number;
    quantity: number;
    reason: string;
  }) => {
    const { data } = await api.post('/inventory/supply', input, { timeout: 20000 });
    return data;
  },

  adjust: async (input: {
    pillowId: number;
    locationId: number;
    delta: number;
    reason: string;
  }) => {
    const { data } = await api.post('/inventory/adjust', input, { timeout: 20000 });
    return data;
  },

  setPresentation: async (input: {
    pillowId: number;
    locationId: number;
    presentation: number;
    reason?: string;
  }) => {
    const { data } = await api.post('/inventory/presentation', input, { timeout: 20000 });
    return data;
  },

  reconcile: async () => {
    const { data } = await api.get('/inventory/reconciliation', { timeout: 60000 });
    return data;
  },

  /** Accessoire catalogue (legacy pillow-stock list — names/ids for pickers). */
  getAccessories: async (): Promise<AccessoryCatalogItem[]> => {
    const { data } = await api.get('/pillow-stock', { timeout: 15000 });
    return data;
  },
};
