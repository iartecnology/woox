import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Switch,
  ScrollView,
  Platform,
} from 'react-native';
import { useAuthStore } from '../../../src/stores/useAuthStore';
import { useConversations } from '../../../src/hooks/useConversations';
import { Conversation, ChannelType } from '../../../src/types/domain';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors } from '../../../src/constants/theme';

const CHANNEL_ICONS: Record<string, { icon: any; color: string; label: string }> = {
  whatsapp: { icon: 'logo-whatsapp', color: '#16A34A', label: 'WhatsApp' },
  telegram: { icon: 'paper-plane', color: '#0284C7', label: 'Telegram' },
  facebook: { icon: 'logo-facebook', color: '#2563EB', label: 'Messenger' },
  instagram: { icon: 'logo-instagram', color: '#DB2777', label: 'Instagram' },
  simulator: { icon: 'terminal-outline', color: '#7C3AED', label: 'Simulador' },
  web: { icon: 'globe-outline', color: Colors.primaryDark, label: 'Web' },
};

function formatMessageTime(dateStr?: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function ChatsScreen() {
  const { merchant } = useAuthStore();
  const { conversations, isLoading, toggleBot } = useConversations(merchant?.id);
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'ai' | 'human' | 'unread'>('all');
  const [selectedChannel, setSelectedChannel] = useState<string>('all');

  // Métricas de Chats
  const totalChats = conversations.length;
  const unreadTotal = conversations.reduce((acc, c) => acc + (Number(c.unread_count) || 0), 0);
  const aiChats = conversations.filter((c) => c.ai_active ?? c.is_bot_active ?? true).length;
  const humanChats = totalChats - aiChats;

  // Filtrado compuesto
  const filteredConversations = conversations.filter((c) => {
    const isAi = c.ai_active ?? c.is_bot_active ?? true;
    const rawChannel = (c.channel || c.platform || 'web').toLowerCase();

    if (filterMode === 'ai' && !isAi) return false;
    if (filterMode === 'human' && isAi) return false;
    if (filterMode === 'unread' && (!c.unread_count || c.unread_count === 0)) return false;
    if (selectedChannel !== 'all' && rawChannel !== selectedChannel) return false;

    if (search.trim()) {
      const q = search.toLowerCase();
      const name = (c.customers?.full_name || c.customer_identifier || c.channel_user_id || '').toLowerCase();
      const lastMsg = (c.last_message || '').toLowerCase();
      return name.includes(q) || lastMsg.includes(q);
    }

    return true;
  });

  const renderConversationItem = ({ item }: { item: Conversation }) => {
    const rawChannel = (item.channel || item.platform || 'web').toLowerCase();
    const channelInfo = CHANNEL_ICONS[rawChannel] || CHANNEL_ICONS.web;
    const isAiActive = item.ai_active ?? item.is_bot_active ?? true;
    const hasUnread = (Number(item.unread_count) || 0) > 0;
    const customerOrders = item.customers?.orders || [];
    const ordersCount = customerOrders.length;
    const timeFormatted = formatMessageTime(item.last_message_at || item.created_at);

    return (
      <TouchableOpacity
        style={[styles.compactCard, hasUnread && styles.unreadCompactCard]}
        onPress={() => router.push(`/(app)/chat/${item.id}` as any)}
        activeOpacity={0.7}
      >
        {/* Avatar / Badge de Canal */}
        <View style={[styles.avatarBadge, { backgroundColor: `${channelInfo.color}15` }]}>
          <Ionicons name={channelInfo.icon} size={20} color={channelInfo.color} />
          {hasUnread && <View style={styles.unreadDot} />}
        </View>

        {/* Contenido Central */}
        <View style={styles.contentCol}>
          <View style={styles.topRow}>
            <Text style={[styles.customerName, hasUnread && styles.customerNameBold]} numberOfLines={1}>
              {item.customers?.full_name || item.customer_identifier || item.channel_user_id || 'Cliente sin nombre'}
            </Text>
            <Text style={[styles.timeText, hasUnread && styles.timeTextBold]}>{timeFormatted}</Text>
          </View>

          <View style={styles.middleRow}>
            <Text style={[styles.lastMessageText, hasUnread && styles.lastMessageBold]} numberOfLines={1}>
              {item.last_message || 'Toca para abrir la conversación...'}
            </Text>
            {hasUnread && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{item.unread_count}</Text>
              </View>
            )}
          </View>

          {/* Badges Inferiores: Pedidos vinculados + Estado IA */}
          <View style={styles.bottomBadgesRow}>
            {ordersCount > 0 && (
              <View style={styles.ordersBadge}>
                <Ionicons name="receipt" size={11} color={Colors.primaryDark} />
                <Text style={styles.ordersBadgeText}>
                  {ordersCount === 1 ? '1 pedido' : `${ordersCount} pedidos`}
                </Text>
              </View>
            )}

            <View style={[styles.modeIndicator, isAiActive ? styles.modeAi : styles.modeHuman]}>
              <View style={[styles.indicatorDot, { backgroundColor: isAiActive ? '#10B981' : '#F59E0B' }]} />
              <Text style={[styles.modeIndicatorText, { color: isAiActive ? '#059669' : '#D97706' }]}>
                {isAiActive ? 'IA Activa' : 'Humano'}
              </Text>
            </View>
          </View>
        </View>

        {/* Switch Compacto IA / Humano */}
        <View style={styles.switchCol}>
          <Switch
            value={isAiActive}
            onValueChange={(val) => toggleBot({ conversationId: item.id, isBotActive: val })}
            trackColor={{ false: '#FEF3C7', true: '#D1FAE5' }}
            thumbColor={isAiActive ? '#059669' : '#D97706'}
            style={Platform.OS === 'ios' ? { transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] } : undefined}
          />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* 1. Dashboard de Métricas de Chats (Filtros en 1 línea) */}
      <View style={styles.kpiContainer}>
        <TouchableOpacity
          style={[styles.kpiCard, filterMode === 'all' && styles.kpiCardActive]}
          onPress={() => setFilterMode('all')}
        >
          <Text style={styles.kpiNum}>{totalChats}</Text>
          <Text style={styles.kpiLbl}>Total</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.kpiCard, filterMode === 'unread' && styles.kpiCardActive]}
          onPress={() => setFilterMode(filterMode === 'unread' ? 'all' : 'unread')}
        >
          <Text style={[styles.kpiNum, { color: '#DC2626' }]}>{unreadTotal}</Text>
          <Text style={styles.kpiLbl}>No Leídos</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.kpiCard, filterMode === 'ai' && styles.kpiCardActive]}
          onPress={() => setFilterMode(filterMode === 'ai' ? 'all' : 'ai')}
        >
          <Text style={[styles.kpiNum, { color: '#059669' }]}>{aiChats}</Text>
          <Text style={styles.kpiLbl}>Por IA</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.kpiCard, filterMode === 'human' && styles.kpiCardActive]}
          onPress={() => setFilterMode(filterMode === 'human' ? 'all' : 'human')}
        >
          <Text style={[styles.kpiNum, { color: '#D97706' }]}>{humanChats}</Text>
          <Text style={styles.kpiLbl}>Operador</Text>
        </TouchableOpacity>
      </View>

      {/* 2. Barra de Búsqueda Compacta */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color={Colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por cliente, pedido o texto..."
          placeholderTextColor={Colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* 3. Selector Horizontal de Canales */}
      <View style={styles.channelsScrollWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.channelsContent}>
          {[
            { id: 'all', label: 'Todos' },
            { id: 'whatsapp', label: 'WhatsApp', icon: 'logo-whatsapp', color: '#16A34A' },
            { id: 'telegram', label: 'Telegram', icon: 'paper-plane', color: '#0284C7' },
            { id: 'instagram', label: 'Instagram', icon: 'logo-instagram', color: '#DB2777' },
            { id: 'simulator', label: 'Simulador', icon: 'terminal-outline', color: '#7C3AED' },
          ].map((ch) => {
            const isSelected = selectedChannel === ch.id;
            return (
              <TouchableOpacity
                key={ch.id}
                style={[styles.channelPill, isSelected && styles.channelPillActive]}
                onPress={() => setSelectedChannel(ch.id)}
              >
                {ch.icon && (
                  <Ionicons
                    name={ch.icon as any}
                    size={13}
                    color={isSelected ? '#FFFFFF' : ch.color}
                  />
                )}
                <Text style={[styles.channelPillText, isSelected && styles.channelPillTextActive]}>
                  {ch.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* 4. Lista de Chats Compacta */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.primaryDark} />
        </View>
      ) : filteredConversations.length === 0 ? (
        <View style={styles.centerContainer}>
          <Ionicons name="chatbubbles-outline" size={48} color={Colors.borderColor} />
          <Text style={styles.emptyTitle}>Sin chats en este filtro</Text>
          <Text style={styles.emptySubtitle}>
            Prueba ajustando los filtros de búsqueda o canal.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredConversations}
          keyExtractor={(item) => item.id}
          renderItem={renderConversationItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
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
  kpiContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.bgSecondary,
    marginHorizontal: 14,
    marginTop: 10,
    borderRadius: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  kpiCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 2,
    borderRadius: 6,
  },
  kpiCardActive: {
    backgroundColor: Colors.primarySubtle,
  },
  kpiNum: {
    fontSize: 15,
    fontWeight: '900',
    color: Colors.textPrimary,
  },
  kpiLbl: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
    marginTop: 1,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgSecondary,
    marginHorizontal: 14,
    marginTop: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  searchInput: {
    flex: 1,
    color: Colors.textPrimary,
    paddingVertical: 8,
    fontSize: 13,
  },
  channelsScrollWrapper: {
    marginTop: 8,
    paddingBottom: 2,
  },
  channelsContent: {
    paddingHorizontal: 14,
    gap: 6,
  },
  channelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: Colors.bgSecondary,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  channelPillActive: {
    backgroundColor: Colors.primaryDark,
    borderColor: Colors.primaryDark,
  },
  channelPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  channelPillTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
  },
  compactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgSecondary,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
    elevation: 1,
  },
  unreadCompactCard: {
    borderLeftWidth: 3.5,
    borderLeftColor: Colors.primaryDark,
    backgroundColor: '#FAF5FF',
  },
  avatarBadge: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  unreadDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.danger,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  contentCol: {
    flex: 1,
    justifyContent: 'center',
    paddingRight: 6,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  customerName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
    flex: 1,
    marginRight: 6,
  },
  customerNameBold: {
    fontWeight: '800',
  },
  timeText: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  timeTextBold: {
    color: Colors.primaryDark,
    fontWeight: '700',
  },
  middleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  lastMessageText: {
    fontSize: 12,
    color: Colors.textMuted,
    flex: 1,
    marginRight: 6,
  },
  lastMessageBold: {
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  unreadBadge: {
    backgroundColor: Colors.primaryDark,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  unreadBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
  },
  bottomBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 5,
  },
  ordersBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.primarySubtle,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  ordersBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  modeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  modeAi: {
    backgroundColor: '#ECFDF5',
  },
  modeHuman: {
    backgroundColor: '#FEF3C7',
  },
  indicatorDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  modeIndicatorText: {
    fontSize: 10,
    fontWeight: '700',
  },
  switchCol: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 2,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 2,
  },
});
