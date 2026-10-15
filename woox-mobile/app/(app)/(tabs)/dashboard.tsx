import React, { useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useAuthStore } from '../../../src/stores/useAuthStore';
import { useSettingsStore } from '../../../src/stores/useSettingsStore';
import { useOrders } from '../../../src/hooks/useOrders';
import { useConversations } from '../../../src/hooks/useConversations';
import { useReservations } from '../../../src/hooks/useCatalogAndBooking';
import { useCatalogManagement } from '../../../src/hooks/useCatalogManagement';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../src/constants/theme';
import { useRouter } from 'expo-router';

export default function DashboardScreen() {
  const { merchant } = useAuthStore();
  const { showReservationsMenu, loadSettings } = useSettingsStore();
  const router = useRouter();

  useEffect(() => {
    loadSettings();
  }, []);

  const { orders, isLoading: loadingOrders } = useOrders(merchant?.id);
  const { conversations, isLoading: loadingConvs } = useConversations(merchant?.id);
  const { reservations, isLoading: loadingRes } = useReservations(merchant?.id);
  const { products, categories, isLoading: loadingProd } = useCatalogManagement(merchant?.id);

  const isLoading = loadingOrders || loadingConvs || loadingRes || loadingProd;

  // 1. Estadísticas de Pedidos
  const totalOrders = orders.length;
  const pendingOrders = orders.filter((o) => o.status === 'pending').length;
  const preparingOrders = orders.filter((o) => o.status === 'preparing' || o.status === 'confirmed').length;
  const deliveredOrders = orders.filter((o) => o.status === 'delivered').length;
  const totalRevenue = orders
    .filter((o) => o.status !== 'cancelled')
    .reduce((acc, o) => acc + Number((o as any).total ?? o.total_amount ?? 0), 0);

  // 2. Estadísticas de Chats & IA
  const totalChats = conversations.length;
  const aiActiveChats = conversations.filter((c) => c.ai_active ?? c.is_bot_active ?? true).length;
  const humanTakeoverChats = totalChats - aiActiveChats;

  // 3. Estadísticas de Stock
  const totalProducts = products.length;
  const inStockProducts = products.filter((p) => p.is_available).length;
  const outOfStockProducts = totalProducts - inStockProducts;

  // 4. Estadísticas de Reservas
  const totalBookings = reservations.length;
  const confirmedBookings = reservations.filter((r) => r.status === 'confirmed').length;
  const pendingBookings = reservations.filter((r) => r.status === 'pending' || !r.status).length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Encabezado del Comercio */}
      <View style={styles.heroCard}>
        <View style={styles.heroTextContainer}>
          <Text style={styles.greetingText}>Panel General de Control</Text>
          <Text style={styles.merchantName}>{merchant?.business_name || merchant?.name || 'Comercio Woox'}</Text>
          <Text style={styles.heroSubtitle}>Métricas unificadas de operaciones e IA en tiempo real</Text>
        </View>
        <View style={styles.revenueBadge}>
          <Text style={styles.revenueLabel}>Ventas Totales</Text>
          <Text style={styles.revenueValue}>${totalRevenue.toFixed(2)}</Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.primaryDark} />
        </View>
      ) : (
        <View style={styles.sectionsWrapper}>
          {/* SECCIÓN 1: PEDIDOS & DELIVERY */}
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionTitleGroup}>
              <Ionicons name="receipt" size={18} color={Colors.primaryDark} />
              <Text style={styles.sectionTitle}>Gestión de Pedidos</Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/(app)/(tabs)/' as any)}>
              <Text style={styles.viewDetailLink}>Ver Cocina ➔</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.cardsGrid}>
            <TouchableOpacity
              style={[styles.kpiCard, styles.cardPending]}
              onPress={() => router.push('/(app)/(tabs)/' as any)}
            >
              <View style={styles.kpiIconRow}>
                <Ionicons name="alert-circle" size={24} color="#DC2626" />
                <Text style={[styles.kpiNumber, { color: '#DC2626' }]}>{pendingOrders}</Text>
              </View>
              <Text style={styles.kpiTitle}>Pendientes</Text>
              <Text style={styles.kpiSub}>Requieren confirmación</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.kpiCard, styles.cardPreparing]}
              onPress={() => router.push('/(app)/(tabs)/' as any)}
            >
              <View style={styles.kpiIconRow}>
                <Ionicons name="flame" size={24} color="#D97706" />
                <Text style={[styles.kpiNumber, { color: '#D97706' }]}>{preparingOrders}</Text>
              </View>
              <Text style={styles.kpiTitle}>En Cocina</Text>
              <Text style={styles.kpiSub}>En preparación</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.kpiCard, styles.cardDelivered]}
              onPress={() => router.push('/(app)/(tabs)/' as any)}
            >
              <View style={styles.kpiIconRow}>
                <Ionicons name="checkmark-done-circle" size={24} color="#059669" />
                <Text style={[styles.kpiNumber, { color: '#059669' }]}>{deliveredOrders}</Text>
              </View>
              <Text style={styles.kpiTitle}>Entregados</Text>
              <Text style={styles.kpiSub}>Despachos exitosos</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.kpiCard, styles.cardTotal]}
              onPress={() => router.push('/(app)/(tabs)/' as any)}
            >
              <View style={styles.kpiIconRow}>
                <Ionicons name="cube" size={24} color={Colors.primaryDark} />
                <Text style={[styles.kpiNumber, { color: Colors.primaryDark }]}>{totalOrders}</Text>
              </View>
              <Text style={styles.kpiTitle}>Total Órdenes</Text>
              <Text style={styles.kpiSub}>Histórico registrado</Text>
            </TouchableOpacity>
          </View>

          {/* SECCIÓN 2: ATENCIÓN OMNICANAL & IA */}
          <View style={[styles.sectionHeaderRow, { marginTop: 20 }]}>
            <View style={styles.sectionTitleGroup}>
              <Ionicons name="chatbubbles" size={18} color="#2563EB" />
              <Text style={styles.sectionTitle}>Atención al Cliente & IA</Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/(app)/(tabs)/chats' as any)}>
              <Text style={styles.viewDetailLink}>Bandeja en Vivo ➔</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.twoColumnGrid}>
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => router.push('/(app)/(tabs)/chats' as any)}
            >
              <View style={styles.cardHeaderSmall}>
                <View style={[styles.miniBadge, { backgroundColor: '#D1FAE5' }]}>
                  <Ionicons name="sparkles" size={16} color="#059669" />
                </View>
                <Text style={styles.actionCardNumber}>{aiActiveChats}</Text>
              </View>
              <Text style={styles.actionCardTitle}>Chats Atendidos por IA</Text>
              <Text style={styles.actionCardDesc}>Respuestas automáticas 24/7 sin demora</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => router.push('/(app)/(tabs)/chats' as any)}
            >
              <View style={styles.cardHeaderSmall}>
                <View style={[styles.miniBadge, { backgroundColor: '#FEF3C7' }]}>
                  <Ionicons name="person" size={16} color="#D97706" />
                </View>
                <Text style={styles.actionCardNumber}>{humanTakeoverChats}</Text>
              </View>
              <Text style={styles.actionCardTitle}>Control Humano Manual</Text>
              <Text style={styles.actionCardDesc}>Conversaciones intervenidas por ti</Text>
            </TouchableOpacity>
          </View>

          {/* SECCIÓN 3: CONTROL DE STOCK & CATÁLOGO */}
          <View style={[styles.sectionHeaderRow, { marginTop: 20 }]}>
            <View style={styles.sectionTitleGroup}>
              <Ionicons name="layers" size={18} color="#059669" />
              <Text style={styles.sectionTitle}>Inventario & Menú</Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/(app)/(tabs)/catalog' as any)}>
              <Text style={styles.viewDetailLink}>Gestionar Menú ➔</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.threeColumnGrid}>
            <TouchableOpacity
              style={styles.stockKpiCard}
              onPress={() => router.push('/(app)/(tabs)/catalog' as any)}
            >
              <Text style={styles.stockKpiNumber}>{totalProducts}</Text>
              <Text style={styles.stockKpiLabel}>Productos</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.stockKpiCard, { borderColor: '#A7F3D0' }]}
              onPress={() => router.push('/(app)/(tabs)/catalog' as any)}
            >
              <Text style={[styles.stockKpiNumber, { color: '#059669' }]}>{inStockProducts}</Text>
              <Text style={styles.stockKpiLabel}>En Stock</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.stockKpiCard, { borderColor: '#FECACA' }]}
              onPress={() => router.push('/(app)/(tabs)/catalog' as any)}
            >
              <Text style={[styles.stockKpiNumber, { color: '#DC2626' }]}>{outOfStockProducts}</Text>
              <Text style={styles.stockKpiLabel}>Agotados</Text>
            </TouchableOpacity>
          </View>

          {/* SECCIÓN 4: AGENDA DE RESERVAS (Solo si está activo en Ajustes) */}
          {showReservationsMenu && (
            <>
              <View style={[styles.sectionHeaderRow, { marginTop: 20 }]}>
                <View style={styles.sectionTitleGroup}>
                  <Ionicons name="calendar" size={18} color="#9333EA" />
                  <Text style={styles.sectionTitle}>Reservas & Citas</Text>
                </View>
                <TouchableOpacity onPress={() => router.push('/(app)/(tabs)/reservations' as any)}>
                  <Text style={styles.viewDetailLink}>Ver Agenda ➔</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.reservationsBanner}
                onPress={() => router.push('/(app)/(tabs)/reservations' as any)}
              >
                <View style={styles.resIconBox}>
                  <Ionicons name="calendar-outline" size={28} color="#9333EA" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.resBannerTitle}>{totalBookings} Citas Registradas</Text>
                  <Text style={styles.resBannerSub}>
                    {confirmedBookings} confirmadas • {pendingBookings} por confirmar
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
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
    paddingBottom: 32,
  },
  heroCard: {
    backgroundColor: Colors.bgSecondary,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    marginBottom: 16,
  },
  heroTextContainer: {
    marginBottom: 14,
  },
  greetingText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primaryDark,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  merchantName: {
    fontSize: 22,
    fontWeight: '900',
    color: Colors.textPrimary,
    marginTop: 2,
  },
  heroSubtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 4,
  },
  revenueBadge: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.primarySubtle,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  revenueLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  revenueValue: {
    fontSize: 20,
    fontWeight: '900',
    color: Colors.primaryDark,
  },
  sectionsWrapper: {
    gap: 8,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  sectionTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  viewDetailLink: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  cardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  kpiCard: {
    width: '48.5%',
    backgroundColor: Colors.bgSecondary,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  cardPending: {
    borderColor: '#FECACA',
    backgroundColor: '#FFF5F5',
  },
  cardPreparing: {
    borderColor: '#FDE68A',
    backgroundColor: '#FFFBEB',
  },
  cardDelivered: {
    borderColor: '#A7F3D0',
    backgroundColor: '#F0FDF4',
  },
  cardTotal: {
    borderColor: '#C7D2FE',
    backgroundColor: '#EEF2FF',
  },
  kpiIconRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  kpiNumber: {
    fontSize: 22,
    fontWeight: '900',
  },
  kpiTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  kpiSub: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  twoColumnGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  actionCard: {
    flex: 1,
    backgroundColor: Colors.bgSecondary,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  cardHeaderSmall: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  miniBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionCardNumber: {
    fontSize: 20,
    fontWeight: '900',
    color: Colors.textPrimary,
  },
  actionCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  actionCardDesc: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
    lineHeight: 15,
  },
  threeColumnGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  stockKpiCard: {
    flex: 1,
    backgroundColor: Colors.bgSecondary,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  stockKpiNumber: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  stockKpiLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textMuted,
    marginTop: 2,
  },
  reservationsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgSecondary,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    gap: 12,
  },
  resIconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#F3E8FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  resBannerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  resBannerSub: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  centerContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
