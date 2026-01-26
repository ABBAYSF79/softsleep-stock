// src/hooks/useApi.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { toast } from 'sonner';

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
export const useOrders = () => {
  return useQuery({
    queryKey: ['orders'],
    queryFn: async () => {
      const { data } = await api.get('/orders');
      return data;
    }
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
    onSuccess: () => {
      // Invalidate all relevant queries
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['stock'] }); // This will refresh the stock data
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to update order status');
    }
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
      toast.success('Payment status updated successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to update payment status');
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

// Users
export const useUsers = () => {
  return useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data } = await api.get('/users');
      return data;
    }
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
    }
  });
};

// Dashboard
export const useDashboard = () => {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const { data } = await api.get('/dashboard/stats');
      return data;
    }
  });
};

// Delivery Services
export const useDeliveryServices = () => {
  return useQuery({
    queryKey: ['delivery'],
    queryFn: async () => {
      const { data } = await api.get('/delivery');
      return data;
    }
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