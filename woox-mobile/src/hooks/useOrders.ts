import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Order, OrderStatus } from '../types/domain';
import { soundAlertManager } from '../lib/soundAlertManager';

export function useOrders(merchantId?: string) {
  const queryClient = useQueryClient();
  const [hasNewPendingOrder, setHasNewPendingOrder] = useState(false);

  const query = useQuery({
    queryKey: ['orders', merchantId],
    queryFn: async (): Promise<Order[]> => {
      if (!merchantId) return [];
      const { data, error } = await supabase
        .from('orders')
        .select('*, customers(full_name, phone, address), order_items(*)')
        .eq('merchant_id', merchantId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data as Order[]) || [];
    },
    enabled: !!merchantId,
  });

  // Suscripción Realtime a nuevos pedidos con identificador único por instancia
  useEffect(() => {
    if (!merchantId) return;

    const channelName = `orders_${merchantId}_${Math.random().toString(36).substring(2, 9)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
          filter: `merchant_id=eq.${merchantId}`,
        },
        (payload) => {
          const newOrder = payload.new as Order;
          if (newOrder.status === 'pending') {
            soundAlertManager.startOrderAlert();
            setHasNewPendingOrder(true);
          }
          queryClient.invalidateQueries({ queryKey: ['orders', merchantId] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `merchant_id=eq.${merchantId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['orders', merchantId] });
        }
      );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [merchantId, queryClient]);

  // Mutación para actualizar estado
  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: OrderStatus }) => {
      const { error } = await supabase
        .from('orders')
        .update({ status })
        .eq('id', orderId);

      if (error) throw error;
    },
    onSuccess: () => {
      soundAlertManager.stopOrderAlert();
      setHasNewPendingOrder(false);
      queryClient.invalidateQueries({ queryKey: ['orders', merchantId] });
    },
  });

  const acknowledgeAlert = () => {
    soundAlertManager.stopOrderAlert();
    setHasNewPendingOrder(false);
  };

  return {
    ...query,
    orders: query.data || [],
    updateStatus: updateStatusMutation.mutateAsync,
    isUpdating: updateStatusMutation.isPending,
    hasNewPendingOrder,
    acknowledgeAlert,
  };
}
