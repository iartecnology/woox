import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Switch,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useChatMessages, useConversations } from '../../../src/hooks/useConversations';
import { useAuthStore } from '../../../src/stores/useAuthStore';
import { Message, Order } from '../../../src/types/domain';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../src/constants/theme';

export default function ChatDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { merchant } = useAuthStore();
  const { messages, isLoading, sendMessage, isSending } = useChatMessages(id);
  const { conversations, toggleBot } = useConversations(merchant?.id);
  const [inputText, setInputText] = useState('');
  const [showOrdersDrawer, setShowOrdersDrawer] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const currentConv = conversations.find((c) => c.id === id);
  const isAiActive = currentConv?.ai_active ?? currentConv?.is_bot_active ?? true;
  // Ordenar siempre del más reciente al más antiguo
  const rawOrders: Order[] = currentConv?.customers?.orders || [];
  const customerOrders: Order[] = [...rawOrders].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  // Auto-scroll al recibir un nuevo mensaje en vivo
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  const handleSend = async () => {
    if (!inputText.trim() || isSending) return;
    const text = inputText.trim();
    setInputText('');
    await sendMessage({ content: text });
  };

  const renderMessageItem = ({ item }: { item: Message }) => {
    const isHumanAgent = item.sender_type === 'human_agent' || item.sender_type === 'agent';
    const isAi = item.sender_type === 'ai' || item.sender_type === 'bot';
    const isCustomer = item.sender_type === 'customer';

    return (
      <View
        style={[
          styles.messageRow,
          isHumanAgent ? styles.rowAgent : isAi ? styles.rowAi : styles.rowCustomer,
        ]}
      >
        <View
          style={[
            styles.bubble,
            isHumanAgent
              ? styles.bubbleAgent
              : isAi
              ? styles.bubbleAi
              : styles.bubbleCustomer,
          ]}
        >
          {isAi && (
            <View style={styles.botBadge}>
              <Ionicons name="sparkles" size={12} color="#FFFFFF" />
              <Text style={styles.botBadgeText}>Respuesta IA</Text>
            </View>
          )}
          {isHumanAgent && (
            <View style={styles.botBadge}>
              <Ionicons name="person" size={12} color="#FFFFFF" />
              <Text style={[styles.botBadgeText, { color: '#FFFFFF' }]}>Tú (Operador)</Text>
            </View>
          )}
          {isCustomer && (
            <View style={styles.customerBadge}>
              <Ionicons name="chatbubble-ellipses-outline" size={12} color="#047857" />
              <Text style={styles.customerBadgeText}>Cliente</Text>
            </View>
          )}

          <Text
            style={[
              styles.messageText,
              (isAi || isHumanAgent) && styles.messageTextInverse,
              isCustomer && styles.messageTextCustomer,
            ]}
          >
            {item.content}
          </Text>

          <Text
            style={[
              styles.messageTime,
              (isAi || isHumanAgent) && styles.messageTimeInverse,
              isCustomer && styles.messageTimeCustomer,
            ]}
          >
            {item.created_at
              ? new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : ''}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      style={styles.container}
    >
      {/* 1. Barra de Control de IA Compacta */}
      <View style={styles.controlBanner}>
        <View style={styles.controlLeft}>
          <View style={[styles.liveDot, { backgroundColor: isAiActive ? '#10B981' : '#F59E0B' }]} />
          <View>
            <Text style={styles.controlTitle}>
              {isAiActive ? 'Bot / IA Respondiendo' : 'Modo Manual (IA Pausada)'}
            </Text>
            <Text style={styles.controlSubtitle}>
              {currentConv?.customers?.full_name || currentConv?.customer_identifier || 'Cliente'}
            </Text>
          </View>
        </View>

        <View style={styles.bannerActionsRight}>
          {/* Botón superior de pedidos vinculados (despliega historial del más reciente al más antiguo) */}
          {customerOrders.length > 0 && (
            <TouchableOpacity
              style={[styles.ordersPillBtn, showOrdersDrawer && styles.ordersPillBtnActive]}
              onPress={() => setShowOrdersDrawer(!showOrdersDrawer)}
            >
              <Ionicons
                name="receipt"
                size={13}
                color={showOrdersDrawer ? '#FFFFFF' : Colors.primaryDark}
              />
              <Text
                style={[
                  styles.ordersPillBtnText,
                  showOrdersDrawer && styles.ordersPillBtnTextActive,
                ]}
              >
                {customerOrders.length} {customerOrders.length === 1 ? 'pedido' : 'pedidos'}
              </Text>
              <Ionicons
                name={showOrdersDrawer ? 'chevron-up' : 'chevron-down'}
                size={12}
                color={showOrdersDrawer ? '#FFFFFF' : Colors.primaryDark}
              />
            </TouchableOpacity>
          )}

          <Switch
            value={isAiActive}
            onValueChange={(val) => {
              if (id) toggleBot({ conversationId: id, isBotActive: val });
            }}
            trackColor={{ false: '#FEF3C7', true: '#D1FAE5' }}
            thumbColor={isAiActive ? '#059669' : '#D97706'}
            style={Platform.OS === 'ios' ? { transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] } : undefined}
          />
        </View>
      </View>

      {/* 2. Gaveta de Pedidos Vinculados del Cliente */}
      {showOrdersDrawer && customerOrders.length > 0 && (
        <View style={styles.ordersDrawer}>
          <View style={styles.drawerHeader}>
            <View style={styles.drawerTitleGroup}>
              <Ionicons name="bag-check" size={15} color={Colors.primaryDark} />
              <Text style={styles.drawerTitle}>Toca un pedido para ver su detalle individual:</Text>
            </View>
            <TouchableOpacity onPress={() => setShowOrdersDrawer(false)}>
              <Ionicons name="close" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.drawerList}>
            {customerOrders.map((ord, idx) => {
              const isLatest = idx === 0;
              const statusColor =
                ord.status === 'delivered'
                  ? '#059669'
                  : ord.status === 'preparing'
                  ? '#D97706'
                  : ord.status === 'ready'
                  ? Colors.primaryDark
                  : '#DC2626';

              return (
                <TouchableOpacity
                  key={ord.id}
                  style={[styles.orderSnippetCard, isLatest && styles.orderSnippetCardLatest]}
                  onPress={() => {
                    setShowOrdersDrawer(false);
                    router.push(`/(app)/order/${ord.id}` as any);
                  }}
                >
                  <View style={styles.snippetHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={styles.snippetOrderNumber}>
                        #{ord.id.slice(0, 6).toUpperCase()}
                      </Text>
                      {isLatest && (
                        <View style={styles.latestBadge}>
                          <Text style={styles.latestBadgeText}>ÚLTIMO</Text>
                        </View>
                      )}
                    </View>
                    <View style={[styles.snippetStatusBadge, { backgroundColor: `${statusColor}15` }]}>
                      <Text style={[styles.snippetStatusText, { color: statusColor }]}>
                        {ord.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.snippetTotal}>
                    ${Number((ord as any).total ?? ord.total_amount ?? 0).toFixed(2)}
                  </Text>

                  <Text style={styles.snippetTime}>
                    🕒 {new Date(ord.created_at).toLocaleDateString([], { day: '2-digit', month: 'short' })} • {new Date(ord.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>

                  {ord.delivery_address && (
                    <Text style={styles.snippetAddress} numberOfLines={1}>
                      📍 {ord.delivery_address}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* 3. Lista de Mensajes */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.primaryDark} />
        </View>
      ) : messages.length === 0 ? (
        <View style={styles.centerContainer}>
          <Ionicons name="chatbubbles-outline" size={48} color={Colors.borderColor} />
          <Text style={styles.emptyTitle}>Conversación en espera</Text>
          <Text style={styles.emptySubtitle}>
            Los mensajes que intercambien el cliente y el bot aparecerán en este chat en vivo.
          </Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessageItem}
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* 4. Barra de Entrada de Mensaje */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.textInput}
          placeholder="Responder al cliente como operador..."
          placeholderTextColor={Colors.textMuted}
          value={inputText}
          onChangeText={setInputText}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendButton, (!inputText.trim() || isSending) && styles.disabledSend]}
          onPress={handleSend}
          disabled={!inputText.trim() || isSending}
        >
          {isSending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Ionicons name="send" size={17} color="#FFFFFF" />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  controlBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.bgSecondary,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  controlLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  controlTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  controlSubtitle: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  bannerActionsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ordersPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: Colors.primarySubtle,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  ordersPillBtnActive: {
    backgroundColor: Colors.primaryDark,
    borderColor: Colors.primaryDark,
  },
  ordersPillBtnSingle: {
    backgroundColor: Colors.primaryDark,
    borderColor: Colors.primaryDark,
  },
  ordersPillBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  ordersPillBtnTextActive: {
    color: '#FFFFFF',
  },
  ordersPillBtnTextSingle: {
    color: '#FFFFFF',
  },
  ordersDrawer: {
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  drawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  drawerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  drawerTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  drawerList: {
    gap: 8,
    paddingRight: 10,
  },
  orderSnippetCard: {
    backgroundColor: Colors.bgSecondary,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    minWidth: 160,
  },
  snippetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 6,
  },
  snippetOrderNumber: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  snippetStatusBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  snippetStatusText: {
    fontSize: 9,
    fontWeight: '800',
  },
  snippetTotal: {
    fontSize: 13,
    fontWeight: '900',
    color: Colors.primaryDark,
    marginTop: 4,
  },
  orderSnippetCardLatest: {
    borderColor: Colors.primaryDark,
    borderWidth: 1.5,
    backgroundColor: '#FFFFFF',
  },
  latestBadge: {
    backgroundColor: Colors.primarySubtle,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  latestBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: Colors.primaryDark,
  },
  snippetTime: {
    fontSize: 9,
    color: Colors.textMuted,
    marginTop: 2,
    fontWeight: '600',
  },
  snippetAddress: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2,
    maxWidth: 150,
  },
  listContent: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 3,
  },
  rowCustomer: {
    justifyContent: 'flex-start',
  },
  rowAgent: {
    justifyContent: 'flex-end',
  },
  rowAi: {
    justifyContent: 'flex-end',
  },
  bubble: {
    maxWidth: '82%',
    padding: 12,
    borderRadius: 16,
  },
  bubbleCustomer: {
    backgroundColor: '#ECFDF5',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  bubbleAgent: {
    backgroundColor: Colors.primaryDark,
    borderBottomRightRadius: 4,
  },
  bubbleAi: {
    backgroundColor: '#4F46E5',
    borderBottomRightRadius: 4,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  botBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  botBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#C7D2FE',
  },
  customerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  customerBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#047857',
  },
  messageText: {
    color: Colors.textPrimary,
    fontSize: 13.5,
    lineHeight: 19,
  },
  messageTextInverse: {
    color: '#FFFFFF',
  },
  messageTextCustomer: {
    color: '#064E3B',
    fontWeight: '500',
  },
  messageTime: {
    color: Colors.textMuted,
    fontSize: 10,
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  messageTimeInverse: {
    color: 'rgba(255, 255, 255, 0.75)',
  },
  messageTimeCustomer: {
    color: '#047857',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: Colors.bgSecondary,
    borderTopWidth: 1,
    borderColor: Colors.borderSubtle,
    gap: 8,
  },
  textInput: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
    color: Colors.textPrimary,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 13.5,
    maxHeight: 90,
    borderWidth: 1,
    borderColor: Colors.borderColor,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledSend: {
    backgroundColor: Colors.borderColor,
    opacity: 0.6,
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
