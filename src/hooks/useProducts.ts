import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

export const useProducts = () => {
  return useQuery(['products'], async () => {
    const { data } = await api.get('/products');
    return data;
  });
};

export const useCreateProduct = () => {
  const queryClient = useQueryClient();
  
  return useMutation(
    async (productData: any) => {
      const { data } = await api.post('/products', productData);
      return data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['products']);
      },
    }
  );
};
