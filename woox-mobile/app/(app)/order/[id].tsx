import { formatOrderNumber } from '../../../src/lib/orderNumber';
import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../src/lib/supabase';
import { Order, OrderStatus, OrderItem } from '../../../src/types/domain';
import { Colors } from '../../../src/constants/theme';
import { Ionicons } from '@expo/vector-icons';

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pendiente', color: '#DC2626', bg: '#FEE2E2' },
  confirmed: { label: 'Confirmado', color: '#2563EB', bg: '#EFF6FF' },
  preparing: { label: 'En Cocina', color: '#D97706', bg: '#FEF3C7' },
  ready: { label: 'Listo p/ Entrega', color: '#4F46E5', bg: '#EEF2FF' },
  delivered: { label: 'Entregado', color: '#059669', bg: '#D1FAE5' },
  cancelled: { label: 'Cancelado', color: '#4B5563', bg: '#F3F4F6' },
};

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isUpdating, setIsUpdating] = useState(false);

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: async (): Promise<Order | null> => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('orders')
        .select('*, customers(full_name, phone, address, email), order_items(*)')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      return data as Order;
    },
    enabled: !!id,
  });

  const getNextStatus = (current: OrderStatus): OrderStatus | null => {
    switch (current) {
      case 'pending': return 'preparing';
      case 'confirmed': return 'preparing';
      case 'preparing': return 'ready';
      case 'ready': return 'delivered';
      default: return null;
    }
  };

  const getNextStatusLabel = (current: OrderStatus): string => {
    switch (current) {
      case 'pending': return 'Aceptar y Preparar';
      case 'confirmed': return 'Enviar a Cocina';
      case 'preparing': return 'Marcar como Listo';
      case 'ready': return 'Marcar como Entregado';
      default: return '';
    }
  };

  const handleUpdateStatus = async (status: OrderStatus) => {
    if (!id) return;
    try {
      setIsUpdating(true);
      const { error } = await supabase
        .from('orders')
        .update({ status })
        .eq('id', id);

      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['order', id] });
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo actualizar el pedido');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCancel = () => {
    Alert.alert('Cancelar Pedido', '¿Deseas cancelar esta orden?', [
      { text: 'No', style: 'cancel' },
      { text: 'Sí, Cancelar', style: 'destructive', onPress: () => handleUpdateStatus('cancelled') },
    ]);
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <Stack.Screen options={{ title: 'Cargando Pedido...' }} />
        <ActivityIndicator size="large" color={Colors.primaryDark} />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.centerContainer}>
        <Stack.Screen options={{ title: 'Pedido no encontrado' }} />
        <Ionicons name="alert-circle-outline" size={48} color={Colors.danger} />
        <Text style={styles.emptyTitle}>Pedido no encontrado</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const statusCfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
  const nextStatus = getNextStatus(order.status);
  const totalAmount = Number((order as any).total ?? order.total_amount ?? 0);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          title: `Pedido #${formatOrderNumber(order)}`,
          headerShown: true,
          headerStyle: { backgroundColor: Colors.bgSecondary },
          headerTintColor: Colors.textPrimary,
          headerShadowVisible: false,
        }}
      />

      {/* Tarjeta de Encabezado y Estado */}
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.orderIdText}>ORDEN #{formatOrderNumber(order, 8)}</Text>
            <Text style={styles.dateText}>
              {new Date(order.created_at).toLocaleDateString()} • {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusCfg.bg }]}>
            <Text style={[styles.statusText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
          </View>
        </View>

        {/* Acciones de cambio de estado */}
        <View style={styles.actionButtonGroup}>
          {nextStatus && (
            <TouchableOpacity
              style={[styles.primaryActionBtn, isUpdating && styles.disabledBtn]}
              onPress={() => handleUpdateStatus(nextStatus)}
              disabled={isUpdating}
            >
              {isUpdating ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.primaryActionText}>{getNextStatusLabel(order.status)}</Text>
                  <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
                </>
              )}
            </TouchableOpacity>
          )}

          {order.status !== 'delivered' && order.status !== 'cancelled' && (
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={handleCancel}
              disabled={isUpdating}
            >
              <Ionicons name="close-circle-outline" size={16} color={Colors.danger} />
              <Text style={styles.cancelBtnText}>Cancelar Pedido</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Datos del Cliente */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Datos del Cliente</Text>
        <View style={styles.customerRow}>
          <View style={styles.customerAvatar}>
            <Ionicons name="person" size={20} color={Colors.primaryDark} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.customerName}>{order.customers?.full_name || 'Cliente sin nombre'}</Text>
            {order.customers?.phone && (
              <Text style={styles.customerDetail}>📞 {order.customers.phone}</Text>
            )}
            {order.customers?.email && (
              <Text style={styles.customerDetail}>✉️ {order.customers.email}</Text>
            )}
          </View>
        </View>

        {order.delivery_address && (
          <View style={styles.addressBox}>
            <Ionicons name="location" size={16} color={Colors.primaryDark} />
            <Text style={styles.addressText}>{order.delivery_address}</Text>
          </View>
        )}
      </View>

      {/* Ítems del Pedido */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Ítems de la Orden</Text>
        {order.order_items && order.order_items.length > 0 ? (
          order.order_items.map((it: OrderItem, idx: number) => (
            <View key={it.id || idx} style={styles.itemRow}>
              <View style={styles.qtyBadge}>
                <Text style={styles.qtyText}>{it.quantity}x</Text>
              </View>
              <View style={{ flex: 1, paddingHorizontal: 10 }}>
                <Text style={styles.itemName}>{it.product_name}</Text>
                {it.notes ? <Text style={styles.itemNotes}>Nota: {it.notes}</Text> : null}
              </View>
              <Text style={styles.itemPrice}>
                ${Number(it.subtotal || it.unit_price * it.quantity).toFixed(2)}
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.noItemsText}>Sin ítems desglosados en este pedido</Text>
        )}

        <View style={styles.divider} />

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total a Cobrar</Text>
          <Text style={styles.totalValue}>${totalAmount.toFixed(2)}</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  content: {
    padding: 16,
    gap: 16,
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.bgPrimary,
    padding: 20,
    gap: 12,
  },
  card: {
    backgroundColor: Colors.bgSecondary,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  orderIdText: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  dateText: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  actionButtonGroup: {
    gap: 10,
  },
  primaryActionBtn: {
    backgroundColor: Colors.primaryDark,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  disabledBtn: {
    opacity: 0.6,
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  cancelBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FEE2E2',
    backgroundColor: '#FEF2F2',
    gap: 6,
  },
  cancelBtnText: {
    color: Colors.danger,
    fontWeight: '600',
    fontSize: 13,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  customerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primarySubtle,
    justifyContent: 'center',
    alignItems: 'center',
  },
  customerName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  customerDetail: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  addressBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.bgPrimary,
    padding: 10,
    borderRadius: 10,
    marginTop: 12,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  addressText: {
    fontSize: 13,
    color: Colors.textPrimary,
    flex: 1,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  qtyBadge: {
    backgroundColor: Colors.primarySubtle,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  qtyText: {
    color: Colors.primaryDark,
    fontSize: 12,
    fontWeight: '700',
  },
  itemName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  itemNotes: {
    fontSize: 11,
    color: Colors.textMuted,
    fontStyle: 'italic',
    marginTop: 2,
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  noItemsText: {
    fontSize: 13,
    color: Colors.textMuted,
    fontStyle: 'italic',
    paddingVertical: 8,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.borderSubtle,
    marginVertical: 12,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.primaryDark,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  backBtn: {
    backgroundColor: Colors.primaryDark,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  backBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
