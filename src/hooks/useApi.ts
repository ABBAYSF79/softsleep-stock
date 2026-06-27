// src/hooks/useApi.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

const HEAVY_QUERY_OPTIONS = {
  staleTime: 60 * 1000,
  gcTime: 5 * 60 * 1000,
  refetchOnWindowFocus: false as const,
  refetchOnReconnect: false as const,
};

const REFERENCE_QUERY_OPTIONS = {
  staleTime: 5 * 60 * 1000,
  gcTime: 10 * 60 * 1000,
  refetchOnWindowFocus: false as const,
  refetchOnReconnect: false as const,
};

// Products
export const useProducts = () => {
  return useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data } = await api.get('/products');
      return data;
    }
  });
};

export const useCreateProduct = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (productData: any) => {
      const { data } = await api.post('/products', productData);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Product created successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to create product');
    }
  });
};

export const useUpdateProduct = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const response = await api.put(`/products/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Product updated successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to update product');
    }
  });
};

export const useDeleteProduct = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, password }: { id: number; password: string }) => {
      const { data } = await api.delete(`/products/${id}`, { data: { password } });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Product deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to delete product');
    }
  });
};
// Orders
export interface OrderFilters {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
  salesman?: string;
  salesmanId?: string | number;
  /** @deprecated Prefer deliveryServiceId + deliveryServiceName */
  deliveryService?: string;
  /** Preferred: numeric id as string */
  deliveryServiceId?: string | number;
  /** Substring / name match (sent with id for redundancy in production) */
  deliveryServiceName?: string;
  productId?: string;
  confirmationUserId?: string | number;
  dateFilter?: string;
  startDate?: Date | string;
  endDate?: Date | string;
}

export const useOrders = (
  filters?: OrderFilters,
  options?: { enabled?: boolean }
) => {
  return useQuery({
    queryKey: ['orders', filters],
    queryFn: async () => {
      const { data } = await api.get('/orders', { params: filters });
      return data;
    },
    enabled: options?.enabled ?? true,
    placeholderData: (previousData) => previousData,
    ...HEAVY_QUERY_OPTIONS,
  });
};

export const useConfirmationUsers = (options?: { enabled?: boolean }) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['confirmationUsers', user?.id, user?.role],
    queryFn: async () => {
      const path =
        user?.role === 'ADMIN' ? '/confirmation-users' : '/confirmation-users/my-team';
      const { data } = await api.get(path);
      return data ?? [];
    },
    enabled: !!user && (options?.enabled ?? true),
    ...REFERENCE_QUERY_OPTIONS,
  });
};

export interface InvoicePayload {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  paymentMode: string;
  notes?: string;
  companyName: string;
  companyAddress: string;
  companyPhone?: string;
  companyEmail?: string;
  companyRib?: string;
  companyIce?: string;
  clientName: string;
  clientPhone?: string;
  clientAddress?: string;
  clientCity?: string;
  orderIds: number[];
  items: Array<{
    orderId: number;
    orderItemId: number;
    productName: string;
    variantDetails: string;
    quantity: number;
  }>;
  subtotalHt: number;
  taxRate: number;
  taxAmount: number;
  totalTtc: number;
  currency?: string;
}

export const useInvoices = (searchTerm = '') => {
  return useQuery({
    queryKey: ['invoices', searchTerm],
    queryFn: async () => {
      const { data } = await api.get('/invoices', { params: { search: searchTerm } });
      return data;
    },
    ...REFERENCE_QUERY_OPTIONS,
  });
};

export const useCreateInvoice = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: InvoicePayload) => {
      const { data } = await api.post('/invoices', payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice-next-reference'] });
      toast.success('Invoice saved successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to save invoice');
    }
  });
};

export const useNextInvoiceReference = () => {
  return useQuery({
    queryKey: ['invoice-next-reference'],
    queryFn: async () => {
      const { data } = await api.get('/invoices/next-reference');
      return data.reference as string;
    },
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
};

export const usePaginatedOrders = (
  filters: OrderFilters,
  options?: { enabled?: boolean }
) => {
  return useQuery({
    queryKey: ['orders-paginated', filters],
    queryFn: async () => {
      const { data } = await api.get('/orders', { params: filters });
      return data;
    },
    placeholderData: (previousData) => previousData,
    enabled: options?.enabled ?? true,
    ...HEAVY_QUERY_OPTIONS,
  });
};

export const useCreateOrder = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (orderData: any) => {
      const { data } = await api.post('/orders', orderData);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['stock'] }); // Invalidate stock data
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Order created successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to create order');
    }
  });
};

export interface OrderStatusUpdate {
  id: number;
  status: string;
  note?: string;
  trackingCode?: string;
}

export const useUpdateOrderStatus = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: OrderStatusUpdate) => {
      const { data: response } = await api.patch(`/orders/${data.id}/status`, data);
      return response;
    },
    onMutate: async (newData) => {
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({ queryKey: ['orders-paginated'] });

      // Snapshot the previous value
      const previousOrders = queryClient.getQueryData(['orders-paginated']);

      // Optimistically update to the new value
      queryClient.setQueriesData({ queryKey: ['orders-paginated'] }, (old: any) => {
        if (!old || !old.data) return old;
        return {
          ...old,
          data: old.data.map((order: any) => 
            order.id === newData.id 
              ? { ...order, status: newData.status, note: newData.note || order.note, trackingCode: newData.trackingCode || order.trackingCode } 
              : order
          )
        };
      });

      // Return a context object with the snapshotted value
      return { previousOrders };
    },
    onError: (err, newData, context: any) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousOrders) {
        queryClient.setQueriesData({ queryKey: ['orders-paginated'] }, context.previousOrders);
      }
      toast.error((err as any).response?.data?.error || 'Failed to update order status');
    },
    onSettled: () => {
      // Always refetch after error or success:
      queryClient.invalidateQueries({ queryKey: ['orders-paginated'] });
      queryClient.invalidateQueries({ queryKey: ['stock'] }); 
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['orders-stats'] });
    },
  });
};

export const useUpdateOrderPaymentStatus = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, isPaid }: { id: number; isPaid: boolean }) => {
      const { data } = await api.patch(`/orders/${id}/payment`, { isPaid });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Payment status updated successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to update payment status');
    }
  });
};

export const useFullUpdateOrder = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const { data: response } = await api.put(`/orders/${id}/full`, data);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['orders-paginated'] });
      queryClient.invalidateQueries({ queryKey: ['orders-stats'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      toast.success('Order updated successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to update order');
    }
  });
};

export const useDeleteOrder = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, password }: { id: number; password: string }) => {
      const { data } = await api.delete(`/orders/${id}`, { data: { password } });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['orders-paginated'] });
      queryClient.invalidateQueries({ queryKey: ['orders-stats'] });
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Order deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to delete order');
    }
  });
};

export const useUpdateOrderDelivery = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, deliveryServiceId, city }: { id: number; deliveryServiceId?: string | number; city?: string }) => {
      const { data } = await api.patch(`/orders/${id}`, { deliveryServiceId, city });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Order delivery service/city updated successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to update order delivery service/city');
    }
  });
};

// Stock
export const useStock = () => {
  return useQuery({
    queryKey: ['stock'],
    queryFn: async () => {
      const { data } = await api.get('/stock');
      return data;
    },
    refetchInterval: 5000, // Refetch every 5 seconds
    staleTime: 2000, // Consider data stale after 2 seconds
  });
};

export const useAddSupply = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, quantity, reason }: { id: number; quantity: number; reason: string }) => {
      const { data } = await api.post(`/stock/${id}/supply`, { quantity, reason });
      return data;
    },
    onSuccess: () => {
      // Force refresh of stock data immediately
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      queryClient.invalidateQueries({ queryKey: ['stock-history'] });
      // Also invalidate dashboard as it might show stock stats
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Stock supply added successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to add supply');
    }
  });
};

export const useAddCorrection = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, quantity, reason, type }: { id: number; quantity: number; reason: string; type?: string }) => {
      const { data } = await api.post(`/stock/${id}/correction`, { quantity, reason, type });
      return data;
    },
    onSuccess: () => {
      // Force refresh of stock data immediately
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      queryClient.invalidateQueries({ queryKey: ['stock-history'] });
      // Also invalidate dashboard as it might show stock stats
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Stock correction applied successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to apply correction');
    }
  });
};

// Pillow Stock
export const usePillowStock = () => {
  return useQuery({
    queryKey: ['pillow-stock'],
    queryFn: async () => {
      const { data } = await api.get('/pillow-stock', { timeout: 15000 });
      return data;
    },
    retry: 1,
    ...HEAVY_QUERY_OPTIONS,
  });
};

export const usePillowStockHistory = (pillowId?: number) => {
  return useQuery({
    queryKey: ['pillow-stock-history', pillowId ?? 'all'],
    queryFn: async () => {
      const { data } = await api.get('/pillow-stock/history', {
        params: pillowId ? { pillowId } : undefined,
        headers: { 'x-admin-code': 'admin123456' },
        timeout: 15000,
      });
      return data;
    },
    ...HEAVY_QUERY_OPTIONS,
  });
};

export const usePillowStockAnalytics = (params?: { from?: string; to?: string; pillowId?: number }) => {
  return useQuery({
    queryKey: ['pillow-stock-analytics', params?.from ?? null, params?.to ?? null, params?.pillowId ?? 'all'],
    queryFn: async () => {
      const { data } = await api.get('/pillow-stock/analytics', {
        params: {
          ...(params?.from ? { from: params.from } : {}),
          ...(params?.to ? { to: params.to } : {}),
          ...(params?.pillowId ? { pillowId: params.pillowId } : {}),
        },
        timeout: 20000,
      });
      return data;
    },
    retry: 1,
    ...HEAVY_QUERY_OPTIONS,
  });
};

export const usePaginatedPillowStockHistory = (params: {
  page: number;
  limit: number;
  pillowId?: number;
  from?: string;
  to?: string;
  search?: string;
}) => {
  return useQuery({
    queryKey: [
      'pillow-stock-history-query',
      params.page,
      params.limit,
      params.pillowId ?? 'all',
      params.from ?? null,
      params.to ?? null,
      params.search ?? '',
    ],
    queryFn: async () => {
      const { data } = await api.get('/pillow-stock/history-query', {
        params: {
          page: params.page,
          limit: params.limit,
          ...(params.pillowId ? { pillowId: params.pillowId } : {}),
          ...(params.from ? { from: params.from } : {}),
          ...(params.to ? { to: params.to } : {}),
          ...(params.search ? { search: params.search } : {}),
        },
        timeout: 20000,
      });
      return data;
    },
    retry: 1,
    ...HEAVY_QUERY_OPTIONS,
  });
};

export const useCreatePillow = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { name: string; price: number; stock: number }) => {
      const { data } = await api.post('/pillow-stock', { ...payload, password: 'admin123456' });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pillow-stock'] });
      queryClient.invalidateQueries({ queryKey: ['pillow-stock-history'] });
      toast.success('Accessoire created successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to create pillow');
    }
  });
};

export const usePillowSupply = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, quantity, reason }: { id: number; quantity: number; reason: string }) => {
      const { data } = await api.post(`/pillow-stock/${id}/supply`, { quantity, reason, password: 'admin123456' });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pillow-stock'] });
      queryClient.invalidateQueries({ queryKey: ['pillow-stock-history'] });
      toast.success('Accessoires stock updated');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to add supply');
    }
  });
};

export const usePillowOutgoing = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, quantity, reason }: { id: number; quantity: number; reason: string }) => {
      const { data } = await api.post(`/pillow-stock/${id}/outgoing`, { quantity, reason, password: 'admin123456' });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pillow-stock'] });
      queryClient.invalidateQueries({ queryKey: ['pillow-stock-history'] });
      toast.success('Accessoires stock updated');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to remove stock');
    }
  });
};

// Pillow Orders
export const usePillowOrders = () => {
  return useQuery({
    queryKey: ['pillow-orders'],
    queryFn: async () => {
      const { data } = await api.get('/pillow-orders', { timeout: 15000 });
      return data;
    },
    retry: 1,
    ...HEAVY_QUERY_OPTIONS,
  });
};

export const useCreatePillowOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      customerName: string;
      phone: string;
      address: string;
      city: string;
      deliveryServiceId: number;
      items: Array<{ pillowId: number; quantity: number }>;
    }) => {
      const { data } = await api.post('/pillow-orders', payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pillow-orders'] });
      queryClient.invalidateQueries({ queryKey: ['pillow-stock'] });
      queryClient.invalidateQueries({ queryKey: ['pillow-stock-history'] });
      toast.success('Accessoires order created');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to create pillow order');
    }
  });
};

export const useUpdatePillowOrderStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const { data } = await api.patch(`/pillow-orders/${id}/status`, { status });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pillow-orders'] });
      queryClient.invalidateQueries({ queryKey: ['pillow-stock'] });
      queryClient.invalidateQueries({ queryKey: ['pillow-stock-history'] });
      toast.success('Status updated');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to update status');
    }
  });
};

export const useUpdatePillowOrderPaymentStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, isPaid }: { id: number; isPaid: boolean }) => {
      const { data } = await api.patch(`/pillow-orders/${id}/payment`, { isPaid });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pillow-orders'] });
      queryClient.invalidateQueries({ queryKey: ['pillow-orders-paginated'] });
      toast.success('Payment status updated');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to update payment status');
    }
  });
};

export interface PillowOrderFilters {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
  deliveryServiceId?: string | number;
}

export const usePaginatedPillowOrders = (filters: PillowOrderFilters) => {
  return useQuery({
    queryKey: ['pillow-orders-paginated', filters],
    queryFn: async () => {
      const { data } = await api.get('/pillow-orders', { params: filters, timeout: 15000 });
      return data;
    },
    placeholderData: (previousData) => previousData,
    ...HEAVY_QUERY_OPTIONS,
  });
};

// Users
export const useUsers = () => {
  return useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data } = await api.get('/users');
      return data;
    },
    ...REFERENCE_QUERY_OPTIONS,
  });
};

export const useCreateUser = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (userData: any) => {
      const { data } = await api.post('/users', userData);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('User created successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to create user');
    }
  });
};

export const useUpdateUser = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const response = await api.put(`/users/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('User updated successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to update user');
    }
  });
};

export const useDeleteUser = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.delete(`/users/${id}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('User deactivated successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to deactivate user');
    }
  });
};

export const useStockHistory = () => {
  return useQuery({
    queryKey: ['stock-history'],
    queryFn: async () => {
      const { data } = await api.get('/stock/history');
      return data;
    },
    ...HEAVY_QUERY_OPTIONS,
  });
};

// Dashboard
export interface DashboardLeader {
  userId?: number;
  id?: number;
  name: string;
  deliveredCount: number;
  revenue: number;
  commission: number;
}

export interface DashboardStats {
  products: number;
  users: number;
  orders: number;
  revenue: number;
  commission: number;
  ordersToday: number;
  deliveredThisMonth: number;
  pendingThisMonth: number;
  inProcessThisMonth: number;
  returnedThisMonth: number;
  returnedThisYear: number;
  paidDeliveredThisMonth: number;
  unpaidDeliveredThisMonth: number;
  paidRevenueThisMonth: number;
  unpaidRevenueThisMonth: number;
}

export interface DashboardRecentOrder {
  id: number;
  customerName: string;
  totalAmount: number | string;
  commission: number | string;
  createdAt: string;
  status?: string;
}

export interface DashboardSalesPoint {
  name: string;
  sales: number;
  commission: number;
}

export interface DashboardStatusBreakdown {
  status: string;
  count: number;
}

export interface DashboardReturnsPoint {
  name: string;
  returns: number;
}

export interface DashboardReturnCity {
  city: string;
  count: number;
}

export interface DashboardData {
  stats: DashboardStats;
  topSellers: DashboardLeader[];
  topConfirmationUsers: DashboardLeader[];
  statusBreakdown: DashboardStatusBreakdown[];
  returnsByMonth: DashboardReturnsPoint[];
  topReturnCities: DashboardReturnCity[];
  recentOrders: DashboardRecentOrder[];
  salesData: DashboardSalesPoint[];
  isAdmin: boolean;
  period: {
    type: string;
    from: string;
    to: string;
    label: string;
    year?: number;
  };
}

export const useDashboard = () => {
  return useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const { data } = await api.get('/dashboard/stats');
      return data;
    },
    ...HEAVY_QUERY_OPTIONS,
  });
};

// Delivery Services
export const useDeliveryServices = () => {
  return useQuery({
    queryKey: ['delivery'],
    queryFn: async () => {
      const { data } = await api.get('/delivery');
      return data;
    },
    ...REFERENCE_QUERY_OPTIONS,
  });
};

export const useCreateDeliveryService = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (serviceData: any) => {
      const { data } = await api.post('/delivery', serviceData);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery'] });
      toast.success('Delivery service created successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to create delivery service');
    }
  });
};

export const useUpdateDeliveryService = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const response = await api.put(`/delivery/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery'] });
      toast.success('Delivery service updated successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to update delivery service');
    }
  });
};

export const useDeleteDeliveryService = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.delete(`/delivery/${id}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery'] });
      toast.success('Delivery service deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to delete delivery service');
    }
  });
};

// Auth
export const useLogin = () => {
  return useMutation({
    mutationFn: async (credentials: { email: string; password: string }) => {
      const { data } = await api.post('/auth/login', credentials);
      return data;
    },
    onSuccess: (data) => {
      localStorage.setItem('token', data.token);
      toast.success('Login successful');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Invalid credentials');
    }
  });
};

export const useRegister = () => {
  return useMutation({
    mutationFn: async (userData: { name: string; email: string; password: string; role?: string }) => {
      const { data } = await api.post('/auth/register', userData);
      return data;
    },
    onSuccess: (data) => {
      localStorage.setItem('token', data.token);
      toast.success('Registration successful');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Registration failed');
    }
  });
};

export const useCurrentUser = () => {
  return useQuery({
    queryKey: ['currentUser'],
    queryFn: async () => {
      const { data } = await api.get('/auth/me');
      return data;
    },
    retry: false,
    throwOnError: false
  });
};

// Settings
const getCommissionSettings = () => api.get('/settings/commission');
const updateCommissionSettings = (data: any) => api.put('/settings/commission', data);

export const useApi = () => {
  return {
    getCommissionSettings,
    updateCommissionSettings,
    api
  };
};

// Sales Overview
export const useSalesOverview = () => {
  return useQuery({
    queryKey: ['sales-overview'],
    queryFn: async () => {
      const { data } = await api.get('/orders/overview');
      return data;
    }
  });
};

export const useActivities = (password?: string) => {
  return useQuery({
    queryKey: ['activities'],
    queryFn: async () => {
      const response = await api.get('/activities', {
        params: { password }
      });
      return response.data;
    },
    enabled: !!password
  });
};
