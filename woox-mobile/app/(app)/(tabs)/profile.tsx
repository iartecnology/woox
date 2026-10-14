import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Switch, Platform, ScrollView } from 'react-native';
import { useAuthStore } from '../../../src/stores/useAuthStore';
import { useSettingsStore } from '../../../src/stores/useSettingsStore';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../src/constants/theme';

export default function ProfileScreen() {
  const { profile, merchant, signOut } = useAuthStore();
  const {
    showOrdersMenu,
    showReservationsMenu,
    loadSettings,
    setShowOrdersMenu,
    setShowReservationsMenu,
  } = useSettingsStore();
  const router = useRouter();

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSignOut = async () => {
    Alert.alert(
      'Cerrar Sesión',
      '¿Estás seguro de que deseas salir de tu cuenta de comercio?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Salir',
          style: 'destructive',
          onPress: async () => {
            await signOut();
            router.replace('/(auth)/login');
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Ionicons name="storefront" size={32} color={Colors.primaryDark} />
        </View>
        <Text style={styles.businessName}>{merchant?.business_name || merchant?.name || 'Comercio Woox'}</Text>
        <Text style={styles.emailText}>{profile?.email || 'admin@woox.ai'}</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Plan Merchant Activo</Text>
        </View>
      </View>

      {/* Control de Módulos y Pestañas */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Módulos y Menús de la Aplicación</Text>
        <Text style={styles.sectionSubtitle}>
          Activa o desactiva las secciones de la barra inferior según tu modelo de negocio.
        </Text>

        {/* Interruptor Pedidos */}
        <View style={styles.switchRow}>
          <View style={styles.menuIconContainer}>
            <Ionicons name="receipt-outline" size={20} color={Colors.primaryDark} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.menuItemText}>Menú de Pedidos</Text>
            <Text style={styles.switchSubtext}>Gestión de comandas, cocina y entregas</Text>
          </View>
          <Switch
            value={showOrdersMenu}
            onValueChange={(val) => setShowOrdersMenu(val)}
            trackColor={{ false: '#E2E8F0', true: '#C7D2FE' }}
            thumbColor={showOrdersMenu ? Colors.primaryDark : '#94A3B8'}
            style={Platform.OS === 'ios' ? { transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] } : undefined}
          />
        </View>

        {/* Interruptor Reservas */}
        <View style={styles.switchRow}>
          <View style={styles.menuIconContainer}>
            <Ionicons name="calendar-outline" size={20} color={Colors.primaryDark} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.menuItemText}>Menú de Reservas</Text>
            <Text style={styles.switchSubtext}>Mesas, citas y agendamiento (desactivado por defecto)</Text>
          </View>
          <Switch
            value={showReservationsMenu}
            onValueChange={(val) => setShowReservationsMenu(val)}
            trackColor={{ false: '#E2E8F0', true: '#C7D2FE' }}
            thumbColor={showReservationsMenu ? Colors.primaryDark : '#94A3B8'}
            style={Platform.OS === 'ios' ? { transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] } : undefined}
          />
        </View>
      </View>

      {/* Configuración Operativa */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Configuración Operativa</Text>
        <View style={styles.menuItem}>
          <Ionicons name="volume-high-outline" size={20} color={Colors.textMuted} />
          <Text style={styles.menuItemText}>Alertas Sonoras de Pedidos</Text>
          <Text style={styles.menuItemValue}>Activadas</Text>
        </View>
        <View style={styles.menuItem}>
          <Ionicons name="notifications-outline" size={20} color={Colors.textMuted} />
          <Text style={styles.menuItemText}>Notificaciones Push</Text>
          <Text style={styles.menuItemValue}>En Vivo</Text>
        </View>
        <View style={styles.menuItem}>
          <Ionicons name="hardware-chip-outline" size={20} color={Colors.textMuted} />
          <Text style={styles.menuItemText}>Motor de IA</Text>
          <Text style={styles.menuItemValue}>Conectado</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
        <Ionicons name="log-out-outline" size={20} color={Colors.danger} />
        <Text style={styles.signOutText}>Cerrar Sesión</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
    padding: 16,
    gap: 20,
  },
  profileCard: {
    backgroundColor: Colors.bgSecondary,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: Colors.primarySubtle,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  businessName: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  emailText: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 4,
  },
  badge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  badgeText: {
    color: '#059669',
    fontSize: 12,
    fontWeight: '700',
  },
  section: {
    backgroundColor: Colors.bgSecondary,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  menuItemText: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  menuItemValue: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  scrollContent: {
    padding: 16,
    gap: 18,
    paddingBottom: 40,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 6,
    lineHeight: 16,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  menuIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primarySubtle,
    justifyContent: 'center',
    alignItems: 'center',
  },
  switchSubtext: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.dangerSubtle,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.danger,
    marginTop: 10,
  },
  signOutText: {
    color: Colors.danger,
    fontSize: 15,
    fontWeight: '700',
  },
});
