import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useOrders } from '../../../src/hooks/useOrders';
import { useConversations } from '../../../src/hooks/useConversations';
import { useAuthStore } from '../../../src/stores/useAuthStore';
import { useSettingsStore } from '../../../src/stores/useSettingsStore';
import { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Colors } from '../../../src/constants/theme';

export default function TabsLayout() {
  const { merchant } = useAuthStore();
  const { showOrdersMenu, showReservationsMenu, loadSettings } = useSettingsStore();
  const router = useRouter();
  const { orders } = useOrders(merchant?.id);
  const { conversations } = useConversations(merchant?.id);

  useEffect(() => {
    loadSettings();
  }, []);

  const pendingOrdersCount = orders.filter((o) => o.status === 'pending').length;
  const unreadChatsCount = conversations.reduce((acc, c) => acc + (Number(c.unread_count) || 0), 0);
  const totalNotifications = pendingOrdersCount + unreadChatsCount;

  // Header Bell Component
  const NotificationBell = () => (
    <TouchableOpacity
      style={styles.bellBtn}
      onPress={() => router.push('/(app)/(tabs)/dashboard' as any)}
      activeOpacity={0.7}
    >
      <Ionicons name="notifications-outline" size={22} color={Colors.textPrimary} />
      {totalNotifications > 0 && (
        <View style={styles.bellBadge}>
          <Text style={styles.bellBadgeText}>
            {totalNotifications > 99 ? '99+' : totalNotifications}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <Tabs
      screenOptions={{
        headerStyle: {
          backgroundColor: Colors.bgSecondary,
          borderBottomWidth: 1,
          borderBottomColor: Colors.borderSubtle,
          height: 85,
        },
        headerTintColor: Colors.textPrimary,
        headerTitleAlign: 'center',
        headerTitle: () => (
          <Image
            source={require('../../../assets/woox-logo.png')}
            style={styles.headerLogo}
            resizeMode="contain"
          />
        ),
        headerShadowVisible: false,
        headerRight: () => <NotificationBell />,
        tabBarStyle: {
          backgroundColor: Colors.bgSecondary,
          borderTopColor: Colors.borderSubtle,
          height: 64,
          paddingBottom: 10,
          paddingTop: 8,
          elevation: 4,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
        },
        tabBarActiveTintColor: Colors.primaryDark,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: { fontWeight: '600', fontSize: 11 },
      }}
    >
      {/* 1. Dashboard General */}
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="pie-chart-outline" size={size} color={color} />
          ),
        }}
      />

      {/* 2. Pedidos en Cocina */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Pedidos',
          href: showOrdersMenu ? '/(app)/(tabs)/' : null,
          tabBarIcon: ({ color, size }) => (
            <View>
              <Ionicons name="receipt-outline" size={size} color={color} />
              {pendingOrdersCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{pendingOrdersCount}</Text>
                </View>
              )}
            </View>
          ),
        }}
      />

      {/* 3. Chats Omnicanal (Nombre cambiado de Mensajes a Chats) */}
      <Tabs.Screen
        name="chats"
        options={{
          title: 'Chats',
          tabBarIcon: ({ color, size }) => (
            <View>
              <Ionicons name="chatbubbles-outline" size={size} color={color} />
              {unreadChatsCount > 0 && (
                <View style={[styles.badge, { backgroundColor: Colors.primaryDark }]}>
                  <Text style={styles.badgeText}>{unreadChatsCount}</Text>
                </View>
              )}
            </View>
          ),
        }}
      />

      {/* 4. Reservas */}
      <Tabs.Screen
        name="reservations"
        options={{
          title: 'Reservas',
          href: showReservationsMenu ? '/(app)/(tabs)/reservations' : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
        }}
      />

      {/* 5. Catálogo y Stock */}
      <Tabs.Screen
        name="catalog"
        options={{
          title: 'Stock',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cube-outline" size={size} color={color} />
          ),
        }}
      />

      {/* 6. Ajustes de Perfil */}
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Ajustes',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    right: -6,
    top: -3,
    backgroundColor: Colors.danger,
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  headerLogo: {
    width: 220,
    height: 65,
  },
  bellBtn: {
    marginRight: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.bgPrimary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  bellBadge: {
    position: 'absolute',
    right: -4,
    top: -4,
    backgroundColor: Colors.danger,
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  bellBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
  },
});
