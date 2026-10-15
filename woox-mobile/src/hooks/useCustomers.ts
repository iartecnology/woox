import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Customer } from '../types/domain';

export function useCustomers(merchantId?: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['customers', merchantId],
    queryFn: async (): Promise<Customer[]> => {
      if (!merchantId) return [];
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('merchant_id', merchantId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[useCustomers] Error fetching customers:', error);
        throw error;
      }
      return (data as Customer[]) || [];
    },
    enabled: !!merchantId,
  });

  // Realtime subscription for customer updates
  useEffect(() => {
    if (!merchantId) return;

    const channelName = `customers_${merchantId}_${Math.random().toString(36).substring(2, 9)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'customers',
          filter: `merchant_id=eq.${merchantId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['customers', merchantId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [merchantId, queryClient]);

  // Mutation to update tags or customer details
  const updateCustomerMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Customer> }) => {
      const { error } = await supabase
        .from('customers')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers', merchantId] });
    },
  });

  return {
    customers: query.data || [],
    isLoading: query.isLoading,
    isRefetching: query.isRefetching,
    refetch: query.refetch,
    updateCustomer: updateCustomerMutation.mutateAsync,
  };
}
