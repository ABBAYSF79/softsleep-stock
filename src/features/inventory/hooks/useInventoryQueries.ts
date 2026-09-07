import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { inventoryApi } from '../api/inventoryApi';
import { inventoryErrorMessage } from '../utils/labels';
import type { CreateTransferInput, ReceiveTransferInput } from '../types';

const HEAVY = {
  staleTime: 30_000,
  refetchOnWindowFocus: false as const,
};

export const inventoryKeys = {
  all: ['inventory'] as const,
  mode: ['inventory', 'mode'] as const,
  locations: ['inventory', 'locations'] as const,
  locationsManage: ['inventory', 'locations', 'manage'] as const,
  balances: (pillowId?: number, locationId?: number) =>
    ['inventory', 'balances', pillowId ?? 'all', locationId ?? 'all'] as const,
  movements: (params: Record<string, unknown>) => ['inventory', 'movements', params] as const,
  transfers: (status?: string) => ['inventory', 'transfers', status ?? 'all'] as const,
  transfer: (id?: number) => ['inventory', 'transfer', id ?? null] as const,
  documents: (params: Record<string, unknown>) => ['inventory', 'documents', params] as const,
  document: (id?: number) => ['inventory', 'document', id ?? null] as const,
  accessories: ['inventory', 'accessories'] as const,
  reconciliation: ['inventory', 'reconciliation'] as const,
};

function invalidateStockViews(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['inventory'] });
  void qc.invalidateQueries({ queryKey: ['inventory-balances'] });
  void qc.invalidateQueries({ queryKey: ['inventory-transfers'] });
  void qc.invalidateQueries({ queryKey: ['inventory-transfer'] });
  void qc.invalidateQueries({ queryKey: ['inventory-documents'] });
  void qc.invalidateQueries({ queryKey: ['inventory-document'] });
  void qc.invalidateQueries({ queryKey: ['inventory-movements'] });
  void qc.invalidateQueries({ queryKey: ['pillow-stock'] });
}

export function useInventoryMode() {
  return useQuery({
    queryKey: inventoryKeys.mode,
    queryFn: () => inventoryApi.getMode(),
    retry: 1,
    ...HEAVY,
  });
}

export function useInventoryLocationsQuery(params?: { includeInactive?: boolean }) {
  return useQuery({
    queryKey: params?.includeInactive ? inventoryKeys.locationsManage : inventoryKeys.locations,
    queryFn: () => inventoryApi.getLocations(params),
    retry: 1,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useCreateLocationMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      code?: string;
      name: string;
      type: 'WAREHOUSE' | 'SHOWROOM' | 'OTHER';
      isSellable?: boolean;
      allowsPresentation?: boolean;
      sortOrder?: number;
    }) => inventoryApi.createLocation(input),
    onSuccess: () => {
      toast.success('Location created');
      void qc.invalidateQueries({ queryKey: ['inventory', 'locations'] });
    },
    onError: (e: unknown) => toast.error(inventoryErrorMessage(e, 'Failed to create location')),
  });
}

export function useUpdateLocationMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: {
      id: number;
      name?: string;
      type?: 'WAREHOUSE' | 'SHOWROOM' | 'OTHER';
      active?: boolean;
      isSellable?: boolean;
      allowsPresentation?: boolean;
      sortOrder?: number;
    }) => inventoryApi.updateLocation(id, input),
    onSuccess: () => {
      toast.success('Location updated');
      void qc.invalidateQueries({ queryKey: ['inventory', 'locations'] });
    },
    onError: (e: unknown) => toast.error(inventoryErrorMessage(e, 'Failed to update location')),
  });
}

export function useInventoryBalancesQuery(params?: { pillowId?: number; locationId?: number }) {
  return useQuery({
    queryKey: inventoryKeys.balances(params?.pillowId, params?.locationId),
    queryFn: () => inventoryApi.getBalances(params),
    retry: 1,
    ...HEAVY,
  });
}

export function useStockMovementsQuery(params?: {
  pillowId?: number;
  locationId?: number;
  type?: string;
  referenceType?: string;
  referenceId?: number;
  limit?: number;
}) {
  const keyParams = {
    pillowId: params?.pillowId ?? 'all',
    locationId: params?.locationId ?? 'all',
    type: params?.type ?? 'all',
    referenceType: params?.referenceType ?? null,
    referenceId: params?.referenceId ?? null,
    limit: params?.limit ?? 50,
  };
  return useQuery({
    queryKey: inventoryKeys.movements(keyParams),
    queryFn: () => inventoryApi.getMovements(params),
    retry: 1,
    ...HEAVY,
  });
}

export function useInventoryTransfersQuery(params?: { status?: string }) {
  return useQuery({
    queryKey: inventoryKeys.transfers(params?.status),
    queryFn: () => inventoryApi.getTransfers(params),
    retry: 1,
    ...HEAVY,
  });
}

export function useInventoryTransferQuery(id?: number) {
  return useQuery({
    queryKey: inventoryKeys.transfer(id),
    queryFn: () => inventoryApi.getTransfer(id as number),
    enabled: Number.isInteger(id) && (id as number) > 0,
    retry: 1,
    ...HEAVY,
  });
}

export function useInventoryDocumentsQuery(params?: {
  type?: string;
  transferId?: number;
  status?: string;
}) {
  const keyParams = {
    type: params?.type ?? 'all',
    transferId: params?.transferId ?? 'all',
    status: params?.status ?? 'all',
  };
  return useQuery({
    queryKey: inventoryKeys.documents(keyParams),
    queryFn: () => inventoryApi.getDocuments(params),
    retry: 1,
    ...HEAVY,
  });
}

export function useInventoryDocumentQuery(id?: number) {
  return useQuery({
    queryKey: inventoryKeys.document(id),
    queryFn: () => inventoryApi.getDocument(id as number),
    enabled: Number.isInteger(id) && (id as number) > 0,
    retry: 1,
    ...HEAVY,
  });
}

export function useAccessoriesCatalog() {
  return useQuery({
    queryKey: inventoryKeys.accessories,
    queryFn: () => inventoryApi.getAccessories(),
    retry: 1,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useInventoryReservationsQuery(params?: {
  status?: string;
  orderId?: number;
  pillowOrderId?: number;
}) {
  return useQuery({
    queryKey: [
      'inventory',
      'reservations',
      params?.status ?? 'all',
      params?.orderId ?? null,
      params?.pillowOrderId ?? null,
    ],
    queryFn: () => inventoryApi.getReservations(params),
    retry: 1,
    ...HEAVY,
  });
}

export function useCreateTransferMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTransferInput) => inventoryApi.createTransfer(input),
    onSuccess: () => {
      toast.success('Transfer created');
      invalidateStockViews(qc);
    },
    onError: (e: unknown) => toast.error(inventoryErrorMessage(e, 'Failed to create transfer')),
  });
}

export function useDispatchTransferMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => inventoryApi.dispatchTransfer(id),
    onSuccess: () => {
      toast.success('Transfer dispatched');
      invalidateStockViews(qc);
    },
    onError: (e: unknown) => toast.error(inventoryErrorMessage(e, 'Failed to dispatch transfer')),
  });
}

export function useReceiveTransferMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: ReceiveTransferInput }) =>
      inventoryApi.receiveTransfer(id, input),
    onSuccess: () => {
      toast.success('Receipt validated');
      invalidateStockViews(qc);
    },
    onError: (e: unknown) => toast.error(inventoryErrorMessage(e, 'Failed to receive stock')),
  });
}

export function useCancelTransferMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => inventoryApi.cancelTransfer(id),
    onSuccess: () => {
      toast.success('Transfer cancelled');
      invalidateStockViews(qc);
    },
    onError: (e: unknown) => toast.error(inventoryErrorMessage(e, 'Failed to cancel transfer')),
  });
}

export function useInventoryReconciliationQuery(enabled = true) {
  return useQuery({
    queryKey: inventoryKeys.reconciliation,
    queryFn: () => inventoryApi.reconcile(),
    enabled,
    retry: 1,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });
}

export function useSupplyMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      pillowId: number;
      locationId: number;
      quantity: number;
      reason: string;
    }) => inventoryApi.supply(input),
    onSuccess: () => {
      toast.success('Stock added');
      invalidateStockViews(qc);
    },
    onError: (e: unknown) => toast.error(inventoryErrorMessage(e, 'Failed to add stock')),
  });
}

export function useAdjustMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      pillowId: number;
      locationId: number;
      delta: number;
      reason: string;
    }) => inventoryApi.adjust(input),
    onSuccess: () => {
      toast.success('Stock adjusted');
      invalidateStockViews(qc);
    },
    onError: (e: unknown) => toast.error(inventoryErrorMessage(e, 'Failed to adjust stock')),
  });
}

export function useSetPresentationMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      pillowId: number;
      locationId: number;
      presentation: number;
      reason?: string;
    }) => inventoryApi.setPresentation(input),
    onSuccess: () => {
      toast.success('Presentation updated');
      invalidateStockViews(qc);
    },
    onError: (e: unknown) => toast.error(inventoryErrorMessage(e, 'Failed to update presentation')),
  });
}
