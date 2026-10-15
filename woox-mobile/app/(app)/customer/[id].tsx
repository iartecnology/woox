import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../src/lib/supabase';
import { Customer, Order } from '../../../src/types/domain';
import { Colors } from '../../../src/constants/theme';
import { formatOrderNumber } from '../../../src/lib/orderNumber';

function formatCurrency(amount?: number | null): string {
  if (!amount) return '$0';
  return `$${Number(amount).toLocaleString('es-CO')}`;
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const LOYALTY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  bronze: { label: 'Bronce', color: '#B45309', bg: '#FEF3C7' },
  silver: { label: 'Plata', color: '#4B5563', bg: '#F3F4F6' },
  gold: { label: 'Oro', color: '#D97706', bg: '#FEF9C3' },
  platinum: { label: 'Platino', color: '#4F46E5', bg: '#EEF2FF' },
};

export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadCustomerProfile() {
      if (!id) return;
      try {
        setLoading(true);
        // Cargar datos de cliente
        const { data: custData, error: custErr } = await supabase
          .from('customers')
          .select('*')
          .eq('id', id)
          .single();

        if (custErr) throw custErr;
        setCustomer(custData);

        // Cargar historial de pedidos de este cliente
        const { data: ordersData, error: ordersErr } = await supabase
          .from('orders')
          .select('*, order_items(*)')
          .eq('customer_id', id)
          .order('created_at', { ascending: false });

        if (!ordersErr && ordersData) {
          setOrders(ordersData as Order[]);
        }
      } catch (err) {
        console.error('Error loading customer:', err);
      } finally {
        setLoading(false);
      }
    }

    loadCustomerProfile();
  }, [id]);

  const handleWhatsApp = () => {
    if (!customer?.phone) {
      Alert.alert('Sin teléfono', 'Este cliente no tiene teléfono registrado.');
      return;
    }
    const clean = customer.phone.replace(/[^0-9]/g, '');
    Linking.openURL(`https://wa.me/${clean}`).catch(() => {
      Alert.alert('Error', 'No se pudo abrir WhatsApp');
    });
  };

  const handleCall = () => {
    if (!customer?.phone) {
      Alert.alert('Sin teléfono', 'Este cliente no tiene teléfono registrado.');
      return;
    }
    Linking.openURL(`tel:${customer.phone}`);
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.primaryDark} />
        <Text style={styles.loadingText}>Cargando perfil CRM...</Text>
      </View>
    );
  }

  if (!customer) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="alert-circle-outline" size={48} color={Colors.danger} />
        <Text style={styles.emptyTitle}>Cliente no encontrado</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const loyalty = LOYALTY_CONFIG[customer.loyalty_level?.toLowerCase() || 'bronze'] || LOYALTY_CONFIG.bronze;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Tarjeta de Perfil */}
      <View style={styles.profileCard}>
        <View style={styles.avatarBig}>
          <Text style={styles.avatarBigText}>
            {customer.full_name ? customer.full_name.substring(0, 2).toUpperCase() : 'CL'}
          </Text>
        </View>

        <Text style={styles.name}>{customer.full_name}</Text>

        <View style={[styles.loyaltyBadge, { backgroundColor: loyalty.bg }]}>
          <Ionicons name="sparkles" size={12} color={loyalty.color} />
          <Text style={[styles.loyaltyText, { color: loyalty.color }]}>
            Nivel {loyalty.label} • {customer.loyalty_points || 0} pts
          </Text>
        </View>

        {/* Acciones principales */}
        <View style={styles.actionsRow}>
          <TouchableOpacity style={[styles.actionCircle, styles.actionCall]} onPress={handleCall}>
            <Ionicons name="call" size={20} color="#FFFFFF" />
            <Text style={styles.actionCircleLabel}>Llamar</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionCircle, styles.actionWA]} onPress={handleWhatsApp}>
            <Ionicons name="logo-whatsapp" size={20} color="#FFFFFF" />
            <Text style={styles.actionCircleLabel}>WhatsApp</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Información de Contacto y Dirección */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Datos de Contacto</Text>
        <View style={styles.infoRow}>
          <Ionicons name="call-outline" size={16} color={Colors.textMuted} />
          <Text style={styles.infoText}>{customer.phone || 'No registrado'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Ionicons name="mail-outline" size={16} color={Colors.textMuted} />
          <Text style={styles.infoText}>{customer.email || 'No registrado'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Ionicons name="location-outline" size={16} color={Colors.textMuted} />
          <Text style={styles.infoText}>{customer.address || 'Sin dirección registrada'}</Text>
        </View>
      </View>

      {/* Indicadores CRM de Negocio */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Métricas Comerciales (CLV)</Text>
        <View style={styles.metricsGrid}>
          <View style={styles.metricBox}>
            <Text style={styles.metricBoxLabel}>Valor Histórico (CLV)</Text>
            <Text style={styles.metricBoxValue}>{formatCurrency(customer.clv)}</Text>
          </View>
          <View style={styles.metricBox}>
            <Text style={styles.metricBoxLabel}>Ticket Promedio</Text>
            <Text style={styles.metricBoxValue}>{formatCurrency(customer.avg_ticket)}</Text>
          </View>
          <View style={styles.metricBox}>
            <Text style={styles.metricBoxLabel}>Total Pedidos</Text>
            <Text style={styles.metricBoxValue}>{customer.total_orders || orders.length || 0}</Text>
          </View>
          <View style={styles.metricBox}>
            <Text style={styles.metricBoxLabel}>Riesgo de Churn</Text>
            <Text
              style={[
                styles.metricBoxValue,
                { color: customer.churn_risk === 'high' ? Colors.danger : Colors.success },
              ]}
            >
              {customer.churn_risk === 'high' ? 'Alto' : 'Bajo'}
            </Text>
          </View>
        </View>
      </View>

      {/* Historial de Pedidos */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Historial de Pedidos ({orders.length})</Text>

        {orders.length === 0 ? (
          <Text style={styles.noOrdersText}>No hay pedidos registrados para este cliente.</Text>
        ) : (
          orders.map((order) => (
            <TouchableOpacity
              key={order.id}
              style={styles.orderItem}
              onPress={() => router.push(`/(app)/order/${order.id}` as any)}
            >
              <View style={styles.orderTop}>
                <Text style={styles.orderNumber}>{formatOrderNumber(order)}</Text>
                <Text style={styles.orderTotal}>{formatCurrency(order.total_amount)}</Text>
              </View>
              <Text style={styles.orderDate}>{formatDate(order.created_at)}</Text>
              {order.order_items && order.order_items.length > 0 && (
                <Text style={styles.orderSummary} numberOfLines={1}>
                  {order.order_items.map((it) => `${it.product_name} x${it.quantity}`).join(', ')}
                </Text>
              )}
            </TouchableOpacity>
          ))
        )}
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
    gap: 14,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    color: Colors.textMuted,
    fontSize: 14,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 8,
  },
  backBtn: {
    marginTop: 16,
    backgroundColor: Colors.primaryDark,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  backBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  profileCard: {
    backgroundColor: Colors.bgSecondary,
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  avatarBig: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: Colors.primarySubtle,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  avatarBigText: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.primaryDark,
  },
  name: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  loyaltyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 8,
    gap: 5,
  },
  loyaltyText: {
    fontSize: 12,
    fontWeight: '700',
  },
  actionsRow: {
    flexDirection: 'row',
    marginTop: 18,
    gap: 20,
  },
  actionCircle: {
    alignItems: 'center',
    gap: 4,
  },
  actionCircleLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  actionCall: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primaryDark,
    justifyContent: 'center',
  },
  actionWA: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#16A34A',
    justifyContent: 'center',
  },
  sectionCard: {
    backgroundColor: Colors.bgSecondary,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  infoText: {
    fontSize: 13,
    color: Colors.textPrimary,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricBox: {
    width: '48%',
    backgroundColor: Colors.bgPrimary,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  metricBoxLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  metricBoxValue: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginTop: 4,
  },
  noOrdersText: {
    fontSize: 13,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  orderItem: {
    backgroundColor: Colors.bgPrimary,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    marginBottom: 8,
  },
  orderTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderNumber: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  orderTotal: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  orderDate: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  orderSummary: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 4,
  },
});
