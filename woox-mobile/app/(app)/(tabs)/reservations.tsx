import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useAuthStore } from '../../../src/stores/useAuthStore';
import { useReservations } from '../../../src/hooks/useCatalogAndBooking';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../src/constants/theme';

export default function ReservationsScreen() {
  const { merchant } = useAuthStore();
  const [selectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const { reservations, isLoading, updateStatus } = useReservations(merchant?.id);

  const renderReservationItem = ({ item }: { item: any }) => {
    const isPending = item.status === 'pending';
    const isConfirmed = item.status === 'confirmed';

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.timeBadge}>
            <Ionicons name="time-outline" size={16} color={Colors.primaryDark} />
            <Text style={styles.timeText}>
              {item.start_time ? new Date(item.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Hora no def.'}
            </Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              isConfirmed ? styles.confirmedBadge : isPending ? styles.pendingBadge : styles.completedBadge,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                isConfirmed ? styles.confirmedText : isPending ? styles.pendingText : styles.completedText,
              ]}
            >
              {(item.status || 'PENDIENTE').toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={styles.details}>
          <Text style={styles.customerName}>
            {item.customers?.full_name || item.metadata?.customer_name_manual || 'Cliente sin nombre'}
          </Text>
          {item.customers?.phone && (
            <Text style={styles.customerPhone}>
              <Ionicons name="call-outline" size={12} color={Colors.textMuted} /> {item.customers.phone}
            </Text>
          )}
          {item.pax && (
            <Text style={styles.partyText}>
              <Ionicons name="people-outline" size={12} color={Colors.textMuted} /> {item.pax} personas
            </Text>
          )}
          {item.notes && <Text style={styles.notesText}>"{item.notes}"</Text>}
        </View>

        {isPending && (
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.confirmBtn]}
              onPress={() => updateStatus({ id: item.id, status: 'confirmed' })}
            >
              <Ionicons name="checkmark" size={16} color="#FFFFFF" />
              <Text style={styles.actionBtnText}>Confirmar Cita</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, styles.cancelBtn]}
              onPress={() => updateStatus({ id: item.id, status: 'cancelled' })}
            >
              <Ionicons name="close" size={16} color={Colors.danger} />
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.dateHeader}>
        <Ionicons name="calendar" size={18} color={Colors.primaryDark} />
        <Text style={styles.dateHeaderText}>Agenda de Hoy ({selectedDate})</Text>
      </View>

      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.primaryDark} />
        </View>
      ) : reservations.length === 0 ? (
        <View style={styles.centerContainer}>
          <Ionicons name="calendar-outline" size={56} color={Colors.borderColor} />
          <Text style={styles.emptyTitle}>Sin reservas programadas para hoy</Text>
          <Text style={styles.emptySubtitle}>Las citas agendadas por la IA aparecerán aquí.</Text>
        </View>
      ) : (
        <FlatList
          data={reservations}
          keyExtractor={(item) => item.id}
          renderItem={renderReservationItem}
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
  dateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 16,
    backgroundColor: Colors.bgSecondary,
    borderBottomWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  dateHeaderText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  card: {
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
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primarySubtle,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  timeText: {
    color: Colors.primaryDark,
    fontSize: 13,
    fontWeight: '800',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  confirmedBadge: { backgroundColor: '#D1FAE5' },
  pendingBadge: { backgroundColor: '#FEF3C7' },
  completedBadge: { backgroundColor: '#F3F4F6' },
  statusText: { fontSize: 11, fontWeight: '700' },
  confirmedText: { color: '#059669' },
  pendingText: { color: '#D97706' },
  completedText: { color: Colors.textMuted },
  details: { gap: 4, marginBottom: 12 },
  customerName: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  customerPhone: { fontSize: 13, color: Colors.textSecondary },
  partyText: { fontSize: 13, color: Colors.textSecondary },
  notesText: { fontSize: 13, color: Colors.textMuted, fontStyle: 'italic', marginTop: 4 },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    borderTopWidth: 1,
    borderColor: Colors.borderSubtle,
    paddingTop: 12,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  confirmBtn: {
    flex: 1,
    backgroundColor: Colors.success,
  },
  cancelBtn: {
    backgroundColor: Colors.dangerSubtle,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: Colors.danger,
  },
  actionBtnText: {
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
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginTop: 12 },
  emptySubtitle: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', marginTop: 4 },
});
