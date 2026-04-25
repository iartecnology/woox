import { Injectable } from '@angular/core';
import { supabase } from '../supabase-config';

/**
 * BotService — Gestión de Flujos del Bot, Sesiones, Plantillas y Versionamiento
 * Extraído del monolito supabase.service.ts.
 */
@Injectable({ providedIn: 'root' })
export class BotService {

    // --- FLUJOS ---
    async getBotFlows(merchantId: string) {
        return await supabase
            .from('bot_flows')
            .select('*')
            .eq('merchant_id', merchantId)
            .order('created_at', { ascending: false });
    }

    async saveBotFlow(flow: any) {
        return await supabase
            .from('bot_flows')
            .upsert(flow)
            .select()
            .single();
    }

    async deleteBotFlow(id: string) {
        return await supabase.from('bot_flows').delete().eq('id', id);
    }

    async getActiveBotFlow(merchantId: string) {
        return await supabase.rpc('get_active_bot_flow', { p_merchant_id: merchantId });
    }

    // --- PLANTILLAS PRO ---
    async getBotFlowTemplates() {
        return await supabase
            .from('bot_flow_templates')
            .select('*')
            .order('created_at', { ascending: false });
    }

    async saveBotFlowTemplate(template: any) {
        return await supabase
            .from('bot_flow_templates')
            .upsert(template)
            .select()
            .single();
    }

    async deleteBotFlowTemplate(id: string) {
        return await supabase.from('bot_flow_templates').delete().eq('id', id);
    }

    // --- SESIONES ---
    async getOrCreateBotSession(conversationId: string, merchantId: string, flowId: string, startNodeId: string) {
        return await supabase.rpc('get_or_create_bot_session', {
            p_conversation_id: conversationId,
            p_merchant_id: merchantId,
            p_flow_id: flowId,
            p_start_node_id: startNodeId
        });
    }

    async updateBotSession(sessionId: string, updates: any) {
        return await supabase
            .from('bot_flow_sessions')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', sessionId);
    }

    async getSessionVariables(conversationId: string) {
        const { data, error } = await supabase
            .from('bot_flow_sessions')
            .select('variables')
            .eq('conversation_id', conversationId)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        return { data, error };
    }

    async getBotSessionByConversation(conversationId: string) {
        return await supabase
            .from('bot_flow_sessions')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();
    }

    // --- LOGS DE EJECUCIÓN (DEBUG) ---
    async getExecutionLogs(sessionId: string) {
        return await supabase
            .from('bot_execution_logs')
            .select('*')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: true });
    }
}
