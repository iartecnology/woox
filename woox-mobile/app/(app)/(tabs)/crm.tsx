import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Linking,
  Alert,
  Platform,
} from 'react-native';
import { useAuthStore } from '../../../src/stores/useAuthStore';
import { useCustomers } from '../../../src/hooks/useCustomers';
import { Customer } from '../../../src/types/domain';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors } from '../../../src/constants/theme';

function formatCurrency(amount?: number | null): string {
  if (!amount) return '$0';
  return `$${Number(amount).toLocaleString('es-CO')}`;
}

const LOYALTY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  bronze: { label: 'Bronce', color: '#B45309', bg: '#FEF3C7' },
  silver: { label: 'Plata', color: '#4B5563', bg: '#F3F4F6' },
  gold: { label: 'Oro', color: '#D97706', bg: '#FEF9C3' },
  platinum: { label: 'Platino', color: '#4F46E5', bg: '#EEF2FF' },
};

export default function CRMScreen() {
  const { merchant } = useAuthStore();
  const { customers, isLoading, isRefetching, refetch } = useCustomers(merchant?.id);
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [filterLevel, setFilterLevel] = useState<'all' | 'gold' | 'silver' | 'bronze' | 'risk'>('all');

  // Métricas
  const totalCustomers = customers.length;
  const vipCustomers = customers.filter(
    (c) => c.loyalty_level === 'gold' || c.loyalty_level === 'platinum'
  ).length;
  const atRiskCustomers = customers.filter((c) => c.churn_risk === 'high').length;
  const totalCLV = customers.reduce((acc, c) => acc + (Number(c.clv) || 0), 0);

  // Filtrado
  const filteredCustomers = customers.filter((c) => {
    const matchesSearch =
      c.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      c.phone?.includes(search) ||
      c.email?.toLowerCase().includes(search.toLowerCase()) ||
      c.tags?.some((t) => t.toLowerCase().includes(search.toLowerCase()));

    if (!matchesSearch) return false;

    if (filterLevel === 'gold') return c.loyalty_level === 'gold' || c.loyalty_level === 'platinum';
    if (filterLevel === 'silver') return c.loyalty_level === 'silver';
    if (filterLevel === 'bronze') return c.loyalty_level === 'bronze';
    if (filterLevel === 'risk') return c.churn_risk === 'high';

    return true;
  });

  const handleWhatsApp = (phone?: string, name?: string) => {
    if (!phone) {
      Alert.alert('Sin teléfono', 'Este cliente no tiene número de teléfono registrado.');
      return;
    }
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const url = `https://wa.me/${cleanPhone}?text=Hola%20${encodeURIComponent(
      name || ''
    )},%20te%20escribimos%20de%20${encodeURIComponent(merchant?.name || 'nuestro restaurante')}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'No se pudo abrir WhatsApp');
    });
  };

  const handleCall = (phone?: string) => {
    if (!phone) {
      Alert.alert('Sin teléfono', 'Este cliente no tiene número de teléfono registrado.');
      return;
    }
    Linking.openURL(`tel:${phone}`).catch(() => {
      Alert.alert('Error', 'No se pudo realizar la llamada');
    });
  };

  const renderCustomerItem = ({ item }: { item: Customer }) => {
    const loyalty = LOYALTY_CONFIG[item.loyalty_level?.toLowerCase() || 'bronze'] || LOYALTY_CONFIG.bronze;
    const isHighRisk = item.churn_risk === 'high';

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => router.push(`/(app)/customer/${item.id}` as any)}
      >
        <View style={styles.cardHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {item.full_name ? item.full_name.substring(0, 2).toUpperCase() : 'CL'}
            </Text>
          </View>

          <View style={styles.cardMainInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.customerName} numberOfLines={1}>
                {item.full_name}
              </Text>
              <View style={[styles.loyaltyBadge, { backgroundColor: loyalty.bg }]}>
                <Ionicons name="sparkles" size={11} color={loyalty.color} />
                <Text style={[styles.loyaltyText, { color: loyalty.color }]}>
                  {loyalty.label}
                </Text>
              </View>
            </View>

            <Text style={styles.contactText}>
              {item.phone || 'Sin teléfono'} {item.address ? `• ${item.address}` : ''}
            </Text>
          </View>
        </View>

        {/* Métricas rápidas del cliente */}
        <View style={styles.metricsRow}>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Total Gastado</Text>
            <Text style={styles.metricValue}>{formatCurrency(item.clv)}</Text>
          </View>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Pedidos</Text>
            <Text style={styles.metricValue}>{item.total_orders || 0}</Text>
          </View>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Riesgo Fuga</Text>
            <Text style={[styles.metricValue, { color: isHighRisk ? Colors.danger : Colors.success }]}>
              {isHighRisk ? 'Alto' : 'Bajo'}
            </Text>
          </View>
        </View>

        {/* Tags */}
        {item.tags && item.tags.length > 0 && (
          <View style={styles.tagsContainer}>
            {item.tags.map((tag, idx) => (
              <View key={idx} style={styles.tagBadge}>
                <Text style={styles.tagText}>#{tag}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Acciones Rápidas */}
        <View style={styles.cardActions}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnOutline]}
            onPress={() => handleCall(item.phone)}
          >
            <Ionicons name="call-outline" size={15} color={Colors.textPrimary} />
            <Text style={styles.actionBtnText}>Llamar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnWhatsApp]}
            onPress={() => handleWhatsApp(item.phone, item.full_name)}
          >
            <Ionicons name="logo-whatsapp" size={15} color="#FFFFFF" />
            <Text style={[styles.actionBtnText, { color: '#FFFFFF' }]}>WhatsApp</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnDetail]}
            onPress={() => router.push(`/(app)/customer/${item.id}` as any)}
          >
            <Ionicons name="receipt-outline" size={15} color={Colors.primaryDark} />
            <Text style={[styles.actionBtnText, { color: Colors.primaryDark }]}>Historial</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Resumen Superior */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryNumber}>{totalCustomers}</Text>
          <Text style={styles.summaryLabel}>Clientes</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={[styles.summaryNumber, { color: '#D97706' }]}>{vipCustomers}</Text>
          <Text style={styles.summaryLabel}>VIPs</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={[styles.summaryNumber, { color: Colors.danger }]}>{atRiskCustomers}</Text>
          <Text style={styles.summaryLabel}>En Riesgo</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={[styles.summaryNumber, { color: Colors.primaryDark }]}>{formatCurrency(totalCLV)}</Text>
          <Text style={styles.summaryLabel}>CLV Total</Text>
        </View>
      </View>

      {/* Buscador */}
      <View style={styles.searchSection}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={18} color={Colors.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por nombre, teléfono o tag..."
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
            clearButtonMode="while-editing"
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')} style={styles.clearBtn}>
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Chips de Filtro */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterChip, filterLevel === 'all' && styles.filterChipActive]}
          onPress={() => setFilterLevel('all')}
        >
          <Text style={[styles.filterChipText, filterLevel === 'all' && styles.filterChipTextActive]}>
            Todos ({totalCustomers})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, filterLevel === 'gold' && styles.filterChipActive]}
          onPress={() => setFilterLevel('gold')}
        >
          <Text style={[styles.filterChipText, filterLevel === 'gold' && styles.filterChipTextActive]}>
            VIP / Oro ({vipCustomers})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, filterLevel === 'risk' && styles.filterChipActive]}
          onPress={() => setFilterLevel('risk')}
        >
          <Text style={[styles.filterChipText, filterLevel === 'risk' && styles.filterChipTextActive]}>
            En Riesgo ({atRiskCustomers})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Lista */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primaryDark} />
          <Text style={styles.loadingText}>Cargando base de clientes CRM...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredCustomers}
          keyExtractor={(item) => item.id}
          renderItem={renderCustomerItem}
          contentContainerStyle={styles.listContent}
          onRefresh={refetch}
          refreshing={isRefetching}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={54} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>No se encontraron clientes</Text>
              <Text style={styles.emptySubtitle}>
                {search ? 'Intenta con otro término de búsqueda.' : 'Aún no hay clientes registrados.'}
              </Text>
            </View>
          }
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
  summaryBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.bgSecondary,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  summaryNumber: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  summaryLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '600',
    marginTop: 2,
  },
  searchSection: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgSecondary,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: Colors.textPrimary,
  },
  clearBtn: {
    padding: 4,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 8,
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: Colors.bgSecondary,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  filterChipActive: {
    backgroundColor: Colors.primaryDark,
    borderColor: Colors.primaryDark,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    padding: 16,
    paddingTop: 8,
    gap: 12,
  },
  card: {
    backgroundColor: Colors.bgSecondary,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primarySubtle,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.primaryDark,
  },
  cardMainInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  customerName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    flex: 1,
    marginRight: 8,
  },
  loyaltyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 4,
  },
  loyaltyText: {
    fontSize: 11,
    fontWeight: '700',
  },
  contactText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  metricsRow: {
    flexDirection: 'row',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
  },
  metricItem: {
    flex: 1,
  },
  metricLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 2,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  tagBadge: {
    backgroundColor: Colors.primarySubtle,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tagText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.primaryDark,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    gap: 5,
  },
  actionBtnOutline: {
    backgroundColor: Colors.bgPrimary,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  actionBtnWhatsApp: {
    backgroundColor: '#16A34A',
  },
  actionBtnDetail: {
    backgroundColor: Colors.primarySubtle,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: Colors.textMuted,
    fontSize: 14,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
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
    marginTop: 4,
    textAlign: 'center',
  },
});
