import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Switch,
  Platform,
  ScrollView,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useAuthStore } from '../../../src/stores/useAuthStore';
import { useSettingsStore } from '../../../src/stores/useSettingsStore';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../src/constants/theme';
import { supabase } from '../../../src/lib/supabase';

const DEFAULT_WEEKLY_SCHEDULE = [
  { day: 'monday', name: 'Lunes', enabled: true, open: '11:00', close: '22:00' },
  { day: 'tuesday', name: 'Martes', enabled: true, open: '11:00', close: '22:00' },
  { day: 'wednesday', name: 'Miércoles', enabled: true, open: '11:00', close: '22:00' },
  { day: 'thursday', name: 'Jueves', enabled: true, open: '11:00', close: '23:00' },
  { day: 'friday', name: 'Viernes', enabled: true, open: '11:00', close: '23:30' },
  { day: 'saturday', name: 'Sábado', enabled: true, open: '11:00', close: '23:30' },
  { day: 'sunday', name: 'Domingo', enabled: true, open: '11:00', close: '21:00' },
];

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

  // Estados de Apertura y Horarios del Comercio
  const [scheduleMode, setScheduleMode] = useState<'manual' | 'automatic'>('manual');
  const [isOpenManual, setIsOpenManual] = useState<boolean>(true);
  const [weeklySchedule, setWeeklySchedule] = useState(DEFAULT_WEEKLY_SCHEDULE);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [isLoadingStoreStatus, setIsLoadingStoreStatus] = useState(true);

  useEffect(() => {
    loadSettings();
    loadStoreStatus();
  }, [merchant?.id]);

  const loadStoreStatus = async () => {
    if (!merchant?.id) return;
    try {
      setIsLoadingStoreStatus(true);
      const { data, error } = await supabase
        .from('merchants')
        .select('schedule_mode, is_open_manual, weekly_schedule')
        .eq('id', merchant.id)
        .single();

      if (!error && data) {
        if (data.schedule_mode) setScheduleMode(data.schedule_mode as any);
        if (typeof data.is_open_manual === 'boolean') setIsOpenManual(data.is_open_manual);
        if (Array.isArray(data.weekly_schedule) && data.weekly_schedule.length > 0) {
          setWeeklySchedule(data.weekly_schedule);
        }
      }
    } catch (e) {
      console.error('Error loading store status:', e);
    } finally {
      setIsLoadingStoreStatus(false);
    }
  };

  const handleToggleManualOpen = async (newVal: boolean) => {
    setIsOpenManual(newVal);
    if (!merchant?.id) return;
    try {
      const { error } = await supabase
        .from('merchants')
        .update({ is_open_manual: newVal })
        .eq('id', merchant.id);

      if (error) throw error;
    } catch (e) {
      Alert.alert('Error', 'No se pudo actualizar el estado de apertura manual');
      setIsOpenManual(!newVal);
    }
  };

  const handleToggleScheduleMode = async (mode: 'manual' | 'automatic') => {
    setScheduleMode(mode);
    if (!merchant?.id) return;
    try {
      const { error } = await supabase
        .from('merchants')
        .update({ schedule_mode: mode })
        .eq('id', merchant.id);

      if (error) throw error;
    } catch (e) {
      Alert.alert('Error', 'No se pudo cambiar el modo de horario');
      setScheduleMode(mode === 'manual' ? 'automatic' : 'manual');
    }
  };

  const handleToggleDay = (index: number) => {
    const updated = [...weeklySchedule];
    updated[index].enabled = !updated[index].enabled;
    setWeeklySchedule(updated);
  };

  const handleTimeChange = (index: number, field: 'open' | 'close', value: string) => {
    const updated = [...weeklySchedule];
    updated[index][field] = value;
    setWeeklySchedule(updated);
  };

  const handleSaveWeeklySchedule = async () => {
    if (!merchant?.id) return;
    try {
      setIsSavingSchedule(true);
      const { error } = await supabase
        .from('merchants')
        .update({
          weekly_schedule: weeklySchedule,
          schedule_mode: 'automatic',
        })
        .eq('id', merchant.id);

      if (error) throw error;
      setScheduleMode('automatic');
      Alert.alert('¡Horario Guardado!', 'El comercio operará automáticamente según estos días y horas.');
    } catch (e) {
      Alert.alert('Error', 'No se pudo guardar el horario semanal');
    } finally {
      setIsSavingSchedule(false);
    }
  };

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
      {/* Tarjeta de Comercio */}
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

      {/* 🟢 SECCIÓN: APERTURA Y CIERRE DEL COMERCIO */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <View>
            <Text style={styles.sectionTitle}>Estado de Atención del Comercio</Text>
            <Text style={styles.sectionSubtitle}>
              Controla si recibes pedidos ahora mismo o si cierras el negocio.
            </Text>
          </View>
          {isLoadingStoreStatus && <ActivityIndicator size="small" color={Colors.primaryDark} />}
        </View>

        {/* Selector de Modo: Manual vs Automático */}
        <View style={styles.modeSelector}>
          <TouchableOpacity
            style={[styles.modeTab, scheduleMode === 'manual' && styles.modeTabActive]}
            onPress={() => handleToggleScheduleMode('manual')}
          >
            <Ionicons
              name="hand-left-outline"
              size={16}
              color={scheduleMode === 'manual' ? '#FFFFFF' : Colors.textMuted}
            />
            <Text
              style={[
                styles.modeTabText,
                scheduleMode === 'manual' && styles.modeTabTextActive,
              ]}
            >
              Control Manual
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.modeTab, scheduleMode === 'automatic' && styles.modeTabActive]}
            onPress={() => handleToggleScheduleMode('automatic')}
          >
            <Ionicons
              name="time-outline"
              size={16}
              color={scheduleMode === 'automatic' ? '#FFFFFF' : Colors.textMuted}
            />
            <Text
              style={[
                styles.modeTabText,
                scheduleMode === 'automatic' && styles.modeTabTextActive,
              ]}
            >
              Por Horarios
            </Text>
          </TouchableOpacity>
        </View>

        {/* 1. MODO MANUAL */}
        {scheduleMode === 'manual' ? (
          <View style={styles.manualCard}>
            <View style={styles.manualRow}>
              <View
                style={[
                  styles.statusLight,
                  { backgroundColor: isOpenManual ? Colors.success : Colors.danger },
                ]}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.manualStatusTitle}>
                  {isOpenManual ? 'Comercio Abierto' : 'Comercio Cerrado'}
                </Text>
                <Text style={styles.manualStatusDesc}>
                  {isOpenManual
                    ? 'Tu bot y cocina están recibiendo pedidos y atendiendo clientes.'
                    : 'El comercio está en pausa. El bot avisará que te encuentras cerrado.'}
                </Text>
              </View>
              <Switch
                value={isOpenManual}
                onValueChange={handleToggleManualOpen}
                trackColor={{ false: '#FECACA', true: '#BBF7D0' }}
                thumbColor={isOpenManual ? Colors.success : Colors.danger}
                style={Platform.OS === 'ios' ? { transform: [{ scaleX: 0.9 }, { scaleY: 0.9 }] } : undefined}
              />
            </View>
          </View>
        ) : (
          /* 2. MODO AUTOMÁTICO POR HORARIOS Y DÍAS DE LA SEMANA */
          <View style={styles.scheduleCard}>
            <Text style={styles.scheduleNotice}>
              El comercio abrirá y cerrará automáticamente según los días y rangos definidos.
            </Text>

            {weeklySchedule.map((item, idx) => (
              <View key={item.day} style={styles.dayRow}>
                <View style={styles.dayLeft}>
                  <Switch
                    value={item.enabled}
                    onValueChange={() => handleToggleDay(idx)}
                    trackColor={{ false: '#E2E8F0', true: '#C7D2FE' }}
                    thumbColor={item.enabled ? Colors.primaryDark : '#94A3B8'}
                    style={Platform.OS === 'ios' ? { transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }] } : undefined}
                  />
                  <Text style={[styles.dayName, !item.enabled && { color: Colors.textMuted }]}>
                    {item.name}
                  </Text>
                </View>

                {item.enabled ? (
                  <View style={styles.timeInputsRow}>
                    <TextInput
                      style={styles.timeInput}
                      value={item.open}
                      onChangeText={(val) => handleTimeChange(idx, 'open', val)}
                      placeholder="11:00"
                      maxLength={5}
                    />
                    <Text style={styles.timeSeparator}>a</Text>
                    <TextInput
                      style={styles.timeInput}
                      value={item.close}
                      onChangeText={(val) => handleTimeChange(idx, 'close', val)}
                      placeholder="23:00"
                      maxLength={5}
                    />
                  </View>
                ) : (
                  <Text style={styles.closedDayText}>Cerrado todo el día</Text>
                )}
              </View>
            ))}

            <TouchableOpacity
              style={styles.saveScheduleBtn}
              onPress={handleSaveWeeklySchedule}
              disabled={isSavingSchedule}
            >
              {isSavingSchedule ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="save-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.saveScheduleBtnText}>Guardar Horarios Semanales</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
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
  },
  scrollContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 40,
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
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: Colors.textMuted,
    lineHeight: 16,
  },
  modeSelector: {
    flexDirection: 'row',
    backgroundColor: Colors.bgPrimary,
    borderRadius: 12,
    padding: 4,
    marginTop: 6,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  modeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
  },
  modeTabActive: {
    backgroundColor: Colors.primaryDark,
  },
  modeTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  modeTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  manualCard: {
    backgroundColor: Colors.bgPrimary,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    marginTop: 4,
  },
  manualRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusLight: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  manualStatusTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  manualStatusDesc: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  scheduleCard: {
    backgroundColor: Colors.bgPrimary,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    marginTop: 4,
    gap: 10,
  },
  scheduleNotice: {
    fontSize: 11,
    color: Colors.textMuted,
    lineHeight: 15,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  dayLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: 110,
  },
  dayName: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  timeInputsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timeInput: {
    backgroundColor: Colors.bgSecondary,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textPrimary,
    width: 58,
    textAlign: 'center',
  },
  timeSeparator: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  closedDayText: {
    fontSize: 12,
    color: Colors.danger,
    fontStyle: 'italic',
  },
  saveScheduleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryDark,
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
    marginTop: 6,
  },
  saveScheduleBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
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
  menuItemText: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  switchSubtext: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  menuItemValue: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
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
