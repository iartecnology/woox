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

  // Al presionar la campana, llevar directamente a lo que requiere atención inmediata
  const handleBellPress = () => {
    if (pendingOrdersCount > 0) {
      router.push('/(app)/(tabs)/' as any); // Ir a Pedidos pendientes
    } else if (unreadChatsCount > 0) {
      router.push('/(app)/(tabs)/chats' as any); // Ir a Chats sin responder
    } else {
      router.push('/(app)/(tabs)/dashboard' as any); // Ir a métricas
    }
  };

  // Header Right Actions (Bell + Profile Avatar)
  const HeaderRightActions = () => (
    <View style={styles.headerRightContainer}>
      <TouchableOpacity
        style={styles.bellBtn}
        onPress={handleBellPress}
        activeOpacity={0.7}
      >
        <Ionicons name="notifications-outline" size={20} color={Colors.textPrimary} />
        {totalNotifications > 0 && (
          <View style={styles.bellBadge}>
            <Text style={styles.bellBadgeText}>
              {totalNotifications > 99 ? '99+' : totalNotifications}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.profileBtn}
        onPress={() => router.push('/(app)/(tabs)/profile' as any)}
        activeOpacity={0.7}
      >
        <Ionicons name="person-circle" size={32} color={Colors.primaryDark} />
      </TouchableOpacity>
    </View>
  );

  return (
    <Tabs
      screenOptions={{
        headerStyle: {
          backgroundColor: Colors.bgSecondary,
          borderBottomWidth: 1,
          borderBottomColor: Colors.borderSubtle,
          height: 95,
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
        headerRight: () => <HeaderRightActions />,
        tabBarStyle: {
          backgroundColor: Colors.bgSecondary,
          borderTopColor: Colors.borderSubtle,
          height: 68,
          paddingBottom: 10,
          paddingTop: 8,
          elevation: 6,
          shadowColor: '#0F172A',
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.06,
          shadowRadius: 10,
        },
        tabBarActiveTintColor: Colors.primaryDark,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: { fontWeight: '700', fontSize: 11, marginTop: 2 },
      }}
    >
      {/* 1. Dashboard General */}
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Panel',
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.tabIconContainer, focused && styles.tabIconContainerActive]}>
              <Ionicons
                name={focused ? 'grid' : 'grid-outline'}
                size={22}
                color={focused ? Colors.primaryDark : color}
              />
            </View>
          ),
        }}
      />

      {/* 2. Pedidos en Cocina */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Pedidos',
          href: showOrdersMenu ? '/(app)/(tabs)/' : null,
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.tabIconContainer, focused && styles.tabIconContainerActive]}>
              <Ionicons
                name={focused ? 'receipt' : 'receipt-outline'}
                size={22}
                color={focused ? Colors.primaryDark : color}
              />
              {pendingOrdersCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{pendingOrdersCount}</Text>
                </View>
              )}
            </View>
          ),
        }}
      />

      {/* 3. Chats Omnicanal */}
      <Tabs.Screen
        name="chats"
        options={{
          title: 'Chats',
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.tabIconContainer, focused && styles.tabIconContainerActive]}>
              <Ionicons
                name={focused ? 'chatbubbles' : 'chatbubbles-outline'}
                size={22}
                color={focused ? Colors.primaryDark : color}
              />
              {unreadChatsCount > 0 && (
                <View style={[styles.badge, { backgroundColor: Colors.primaryDark }]}>
                  <Text style={styles.badgeText}>{unreadChatsCount}</Text>
                </View>
              )}
            </View>
          ),
        }}
      />

      {/* 4. CRM / Clientes */}
      <Tabs.Screen
        name="crm"
        options={{
          title: 'CRM',
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.tabIconContainer, focused && styles.tabIconContainerActive]}>
              <Ionicons
                name={focused ? 'people' : 'people-outline'}
                size={22}
                color={focused ? Colors.primaryDark : color}
              />
            </View>
          ),
        }}
      />

      {/* 5. Reservas */}
      <Tabs.Screen
        name="reservations"
        options={{
          title: 'Reservas',
          href: showReservationsMenu ? '/(app)/(tabs)/reservations' : null,
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.tabIconContainer, focused && styles.tabIconContainerActive]}>
              <Ionicons
                name={focused ? 'calendar' : 'calendar-outline'}
                size={22}
                color={focused ? Colors.primaryDark : color}
              />
            </View>
          ),
        }}
      />

      {/* 6. Catálogo y Stock */}
      <Tabs.Screen
        name="catalog"
        options={{
          title: 'Catálogo',
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.tabIconContainer, focused && styles.tabIconContainerActive]}>
              <Ionicons
                name={focused ? 'fast-food' : 'fast-food-outline'}
                size={22}
                color={focused ? Colors.primaryDark : color}
              />
            </View>
          ),
        }}
      />

      {/* 7. Ajustes */}
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Ajustes',
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.tabIconContainer, focused && styles.tabIconContainerActive]}>
              <Ionicons
                name={focused ? 'settings' : 'settings-outline'}
                size={22}
                color={focused ? Colors.primaryDark : color}
              />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabIconContainer: {
    width: 40,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  tabIconContainerActive: {
    backgroundColor: '#EEF2FF',
  },
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
    width: 118,
    height: 35,
  },
  headerRightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 14,
    gap: 8,
  },
  bellBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.bgPrimary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  profileBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
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
