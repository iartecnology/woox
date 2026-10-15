import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Conversation, Message } from '../types/domain';

export function useConversations(merchantId?: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['conversations', merchantId],
    queryFn: async (): Promise<Conversation[]> => {
      if (!merchantId) return [];
      const { data, error } = await supabase
        .from('conversations')
        .select('*, customers(full_name, phone, address, orders(*))')
        .eq('merchant_id', merchantId)
        .order('last_message_at', { ascending: false });

      if (error) throw error;
      return (data as Conversation[]) || [];
    },
    enabled: !!merchantId,
  });

  // Suscripción Realtime a nuevas conversaciones o actualizaciones
  useEffect(() => {
    if (!merchantId) return;

    const channelName = `convs_${merchantId}_${Math.random().toString(36).substring(2, 9)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
          filter: `merchant_id=eq.${merchantId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['conversations', merchantId] });
        }
      );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [merchantId, queryClient]);

  // Mutación para alternar Modo IA vs Agente Humano
  const toggleBotMutation = useMutation({
    mutationFn: async ({ conversationId, isBotActive }: { conversationId: string; isBotActive: boolean }) => {
      const { error } = await supabase
        .from('conversations')
        .update({ ai_active: isBotActive })
        .eq('id', conversationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations', merchantId] });
    },
  });

  // Mutación para marcar conversación como leída (unread_count = 0)
  const markAsReadMutation = useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await supabase
        .from('conversations')
        .update({ unread_count: 0 })
        .eq('id', conversationId);

      if (error) console.error('[useConversations] Error marking as read:', error);
    },
    onSuccess: (_, conversationId) => {
      queryClient.setQueryData<Conversation[]>(['conversations', merchantId], (old) => {
        if (!old) return old;
        return old.map((c) => (c.id === conversationId ? { ...c, unread_count: 0 } : c));
      });
      queryClient.invalidateQueries({ queryKey: ['conversations', merchantId] });
    },
  });

  return {
    ...query,
    conversations: query.data || [],
    toggleBot: toggleBotMutation.mutateAsync,
    isTogglingBot: toggleBotMutation.isPending,
    markAsRead: markAsReadMutation.mutateAsync,
  };
}

export function useChatMessages(conversationId?: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: async (): Promise<Message[]> => {
      if (!conversationId) return [];
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data as Message[]) || [];
    },
    enabled: !!conversationId,
  });

  // Suscripción Realtime a mensajes de esta conversación
  useEffect(() => {
    if (!conversationId) return;

    const channelName = `msgs_${conversationId}_${Math.random().toString(36).substring(2, 9)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          queryClient.setQueryData<Message[]>(['messages', conversationId], (old) => {
            if (!old) return [newMsg];
            if (old.some((m) => m.id === newMsg.id)) return old;
            return [...old, newMsg];
          });
        }
      );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient]);

  // Enviar mensaje como Agente Humano
  const sendMessageMutation = useMutation({
    mutationFn: async ({ content, mediaUrl }: { content: string; mediaUrl?: string }) => {
      if (!conversationId) throw new Error('No conversation selected');

      // 1. Guardar mensaje en base de datos
      const { data, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_type: 'human_agent',
          content,
          media_url: mediaUrl,
        })
        .select('*')
        .single();

      if (error) throw error;

      // 2. Actualizar último mensaje de la conversación
      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversationId);

      return data as Message;
    },
    onSuccess: (newMsg) => {
      queryClient.setQueryData<Message[]>(['messages', conversationId], (old) => {
        if (!old) return [newMsg];
        if (old.some((m) => m.id === newMsg.id)) return old;
        return [...old, newMsg];
      });
    },
  });

  return {
    ...query,
    messages: query.data || [],
    sendMessage: sendMessageMutation.mutateAsync,
    isSending: sendMessageMutation.isPending,
  };
}
