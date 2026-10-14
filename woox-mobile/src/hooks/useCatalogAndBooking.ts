import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Reservation, Product } from '../types/domain';

export function useReservations(merchantId?: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['bookings', merchantId],
    queryFn: async (): Promise<any[]> => {
      if (!merchantId) return [];
      const { data, error } = await supabase
        .from('bookings')
        .select('*, customers(full_name, phone)')
        .eq('merchant_id', merchantId)
        .order('start_time', { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: !!merchantId,
  });

  const updateReservationStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'pending' | 'confirmed' | 'cancelled' | 'completed' }) => {
      const { error } = await supabase
        .from('bookings')
        .update({ status })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings', merchantId] });
    },
  });

  return {
    ...query,
    reservations: query.data || [],
    updateStatus: updateReservationStatus.mutateAsync,
  };
}

export function useProducts(merchantId?: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['products', merchantId],
    queryFn: async (): Promise<Product[]> => {
      if (!merchantId) return [];
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('merchant_id', merchantId)
        .order('name', { ascending: true });

      if (error) throw error;
      return (data as Product[]) || [];
    },
    enabled: !!merchantId,
  });

  const toggleAvailability = useMutation({
    mutationFn: async ({ productId, isAvailable }: { productId: string; isAvailable: boolean }) => {
      const { error } = await supabase
        .from('products')
        .update({ is_available: isAvailable })
        .eq('id', productId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', merchantId] });
    },
  });

  return {
    ...query,
    products: query.data || [],
    toggleAvailability: toggleAvailability.mutateAsync,
  };
}
