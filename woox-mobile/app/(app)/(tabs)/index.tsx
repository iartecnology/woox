import { formatOrderNumber } from '../../../src/lib/orderNumber';
import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Alert,
} from 'react-native';
import { useAuthStore } from '../../../src/stores/useAuthStore';
import { useOrders } from '../../../src/hooks/useOrders';
import { Order, OrderStatus } from '../../../src/types/domain';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../src/constants/theme';
import { useRouter } from 'expo-router';

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pendiente', color: '#DC2626', bg: '#FEE2E2' },
  confirmed: { label: 'Confirmado', color: '#2563EB', bg: '#EFF6FF' },
  preparing: { label: 'En Cocina', color: '#D97706', bg: '#FEF3C7' },
  ready: { label: 'Listo p/ Entrega', color: '#4F46E5', bg: '#EEF2FF' },
  delivered: { label: 'Entregado', color: '#059669', bg: '#D1FAE5' },
  cancelled: { label: 'Cancelado', color: '#4B5563', bg: '#F3F4F6' },
};

export default function OrdersScreen() {
  const router = useRouter();
  const { merchant } = useAuthStore();
  const { orders, isLoading, updateStatus, isUpdating, hasNewPendingOrder, acknowledgeAlert } = useOrders(merchant?.id);
  type FilterType = 'all' | 'active' | 'completed' | 'pending' | 'preparing' | 'ready' | 'delivered';
  const [filter, setFilter] = useState<FilterType>('active');
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);

  // Métricas del Dashboard de Pedidos
  const totalOrders = orders.length;
  const pendingCount = orders.filter((o) => o.status === 'pending').length;
  const preparingCount = orders.filter((o) => o.status === 'preparing' || o.status === 'confirmed').length;
  const readyCount = orders.filter((o) => o.status === 'ready').length;
  const deliveredCount = orders.filter((o) => o.status === 'delivered').length;
  const totalSales = orders
    .filter((o) => o.status !== 'cancelled')
    .reduce((acc, o) => acc + Number((o as any).total ?? o.total_amount ?? 0), 0);

  const filteredOrders = orders.filter((o) => {
    if (filter === 'active') return ['pending', 'confirmed', 'preparing', 'ready'].includes(o.status);
    if (filter === 'completed') return ['delivered', 'cancelled'].includes(o.status);
    if (filter === 'pending') return o.status === 'pending';
    if (filter === 'preparing') return o.status === 'preparing' || o.status === 'confirmed';
    if (filter === 'ready') return o.status === 'ready';
    if (filter === 'delivered') return o.status === 'delivered';
    return true;
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

  const handleUpdateStatus = async (orderId: string, status: OrderStatus) => {
    try {
      setUpdatingOrderId(orderId);
      await updateStatus({ orderId, status });
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo actualizar el estado del pedido.');
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const handleCancelOrder = (orderId: string) => {
    Alert.alert(
      'Cancelar Pedido',
      '¿Estás seguro de que deseas cancelar este pedido?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Sí, Cancelar',
          style: 'destructive',
          onPress: () => handleUpdateStatus(orderId, 'cancelled'),
        },
      ]
    );
  };

  const renderOrderItem = ({ item }: { item: Order }) => {
    const statusCfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
    const nextStatus = getNextStatus(item.status);
    const isThisUpdating = isUpdating && updatingOrderId === item.id;

    return (
      <TouchableOpacity
        style={[styles.orderCard, item.status === 'pending' && styles.pendingCardHighlight]}
        onPress={() => router.push(`/(app)/order/${item.id}` as any)}
        activeOpacity={0.85}
      >
        <View style={styles.cardHeader}>
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.orderNumber}>Orden #{formatOrderNumber(item)}</Text>
              <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
            </View>
            <Text style={styles.customerName}>
              {item.customers?.full_name || 'Cliente sin nombre'}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusCfg.bg }]}>
            <Text style={[styles.statusText, { color: statusCfg.color }]}>
              {statusCfg.label}
            </Text>
          </View>
        </View>

        {/* Lista de productos del pedido */}
        <View style={styles.itemsList}>
          {item.order_items && item.order_items.length > 0 ? (
            item.order_items.map((it, idx) => (
              <View key={it.id || idx} style={styles.itemRow}>
                <Text style={styles.itemQuantity}>{it.quantity}x</Text>
                <Text style={styles.itemName} numberOfLines={1}>{it.product_name}</Text>
                <Text style={styles.itemPrice}>${Number(it.subtotal || it.unit_price * it.quantity).toFixed(2)}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.noItemsText}>Sin ítems desglosados en el pedido</Text>
          )}
        </View>

        {item.delivery_address && (
          <View style={styles.addressRow}>
            <Ionicons name="location-outline" size={14} color={Colors.textMuted} />
            <Text style={styles.addressText} numberOfLines={1}>{item.delivery_address}</Text>
          </View>
        )}

        <View style={styles.cardFooter}>
          <Text style={styles.totalAmount}>
            Total: ${Number((item as any).total ?? item.total_amount ?? 0).toFixed(2)}
          </Text>

          <View style={styles.footerActions}>
            {item.status !== 'delivered' && item.status !== 'cancelled' && (
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => handleCancelOrder(item.id)}
                disabled={isThisUpdating}
              >
                <Ionicons name="close" size={16} color={Colors.danger} />
              </TouchableOpacity>
            )}

            {nextStatus && (
              <TouchableOpacity
                style={[styles.actionButton, isThisUpdating && styles.disabledButton]}
                onPress={() => handleUpdateStatus(item.id, nextStatus)}
                disabled={isThisUpdating}
              >
                {isThisUpdating ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Text style={styles.actionButtonText}>{getNextStatusLabel(item.status)}</Text>
                    <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Modal de Alarma de Nuevo Pedido */}
      <Modal visible={hasNewPendingOrder} transparent animationType="fade">
        <View style={styles.alertOverlay}>
          <View style={styles.alertBox}>
            <View style={styles.alertIconPulse}>
              <Ionicons name="notifications" size={48} color={Colors.danger} />
            </View>
            <Text style={styles.alertTitle}>¡NUEVO PEDIDO RECIBIDO!</Text>
            <Text style={styles.alertSubtitle}>Tienes pedidos pendientes de confirmación en cocina.</Text>
            <TouchableOpacity style={styles.alertConfirmBtn} onPress={acknowledgeAlert}>
              <Text style={styles.alertConfirmText}>Atender Ahora</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* DASHBOARD DE ESTADÍSTICAS EN VIVO */}
      <View style={styles.dashboardCard}>
        <View style={styles.dashboardHeader}>
          <View style={styles.dashboardTitleRow}>
            <Ionicons name="bar-chart" size={18} color={Colors.primaryDark} />
            <Text style={styles.dashboardTitle}>Resumen del Negocio</Text>
          </View>
          <Text style={styles.salesTotal}>${totalSales.toFixed(2)}</Text>
        </View>

        <View style={styles.statsGrid}>
          <TouchableOpacity
            style={[styles.statBox, filter === 'all' && styles.statBoxActive]}
            onPress={() => setFilter(filter === 'all' ? 'active' : 'all')}
          >
            <Text style={styles.statNumber}>{totalOrders}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.statBox,
              { borderLeftWidth: 1, borderColor: Colors.borderSubtle },
              filter === 'pending' && styles.statBoxActive,
            ]}
            onPress={() => setFilter(filter === 'pending' ? 'active' : 'pending')}
          >
            <Text style={[styles.statNumber, { color: '#DC2626' }]}>{pendingCount}</Text>
            <Text style={styles.statLabel}>Pendientes</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.statBox,
              { borderLeftWidth: 1, borderColor: Colors.borderSubtle },
              filter === 'preparing' && styles.statBoxActive,
            ]}
            onPress={() => setFilter(filter === 'preparing' ? 'active' : 'preparing')}
          >
            <Text style={[styles.statNumber, { color: '#D97706' }]}>{preparingCount}</Text>
            <Text style={styles.statLabel}>En Cocina</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.statBox,
              { borderLeftWidth: 1, borderColor: Colors.borderSubtle },
              filter === 'ready' && styles.statBoxActive,
            ]}
            onPress={() => setFilter(filter === 'ready' ? 'active' : 'ready')}
          >
            <Text style={[styles.statNumber, { color: '#4F46E5' }]}>{readyCount}</Text>
            <Text style={styles.statLabel}>Listos</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.statBox,
              { borderLeftWidth: 1, borderColor: Colors.borderSubtle },
              filter === 'delivered' && styles.statBoxActive,
            ]}
            onPress={() => setFilter(filter === 'delivered' ? 'active' : 'delivered')}
          >
            <Text style={[styles.statNumber, { color: '#059669' }]}>{deliveredCount}</Text>
            <Text style={styles.statLabel}>Entregados</Text>
          </TouchableOpacity>
        </View>
      </View>




      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.primaryDark} />
        </View>
      ) : filteredOrders.length === 0 ? (
        <View style={styles.centerContainer}>
          <Ionicons name="receipt-outline" size={56} color={Colors.borderColor} />
          <Text style={styles.emptyTitle}>Sin pedidos en esta sección</Text>
          <Text style={styles.emptySubtitle}>Los nuevos pedidos aparecerán aquí en tiempo real.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredOrders}
          keyExtractor={(item) => item.id}
          renderItem={renderOrderItem}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  dashboardCard: {
    backgroundColor: Colors.bgSecondary,
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 8,
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
  dashboardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  dashboardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dashboardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  salesTotal: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.primaryDark,
  },
  statsGrid: {
    flexDirection: 'row',
    backgroundColor: Colors.bgPrimary,
    borderRadius: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
    borderRadius: 8,
  },
  statBoxActive: {
    backgroundColor: '#EEF2FF',
  },
  statNumber: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  statLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '600',
    marginTop: 2,
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: Colors.bgSecondary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: Colors.bgPrimary,
  },
  filterTabActive: {
    backgroundColor: Colors.primaryDark,
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  filterTabTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    padding: 16,
    gap: 16,
  },
  orderCard: {
    backgroundColor: Colors.bgSecondary,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  pendingCardHighlight: {
    borderColor: Colors.danger,
    borderWidth: 1.5,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  orderNumber: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  customerName: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  itemsList: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.borderSubtle,
    paddingVertical: 10,
    gap: 6,
    marginBottom: 12,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemQuantity: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.primaryDark,
    width: 28,
  },
  itemName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textPrimary,
  },
  itemPrice: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  noItemsText: {
    fontSize: 12,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  addressText: {
    fontSize: 12,
    color: Colors.textMuted,
    flex: 1,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalAmount: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  footerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cancelButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.dangerSubtle,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.danger,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primaryDark,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  disabledButton: {
    opacity: 0.6,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
  },
  alertOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  alertBox: {
    backgroundColor: Colors.bgSecondary,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.danger,
    width: '100%',
  },
  alertIconPulse: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.dangerSubtle,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  alertTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: Colors.danger,
    textAlign: 'center',
  },
  alertSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  alertConfirmBtn: {
    backgroundColor: Colors.danger,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  alertConfirmText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});
