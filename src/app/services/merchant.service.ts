import { Injectable } from '@angular/core';
import { supabase } from '../supabase-config';

/**
 * MerchantService — Gestión de Comercios, Categorías, Productos y Configuración
 * Extraído del monolito supabase.service.ts.
 */
@Injectable({ providedIn: 'root' })
export class MerchantService {

    // --- AUTH ---
    async login(email: string, pass: string) {
        const { data, error } = await supabase
            .from('profiles')
            .select('*, merchants(*)')
            .eq('email', email)
            .eq('password', pass)
            .single();
        return { data, error };
    }

    // --- COMERCIOS ---
    async getMerchants() {
        return await supabase.from('merchants').select('*').order('name', { ascending: true });
    }

    async getMerchantById(id: string) {
        return await supabase.from('merchants').select('*').eq('id', id).single();
    }

    async getMerchantByAnyId(idOrCode: string) {
        if (!idOrCode) return { data: null, error: new Error('ID missing') };
        let { data, error } = await supabase.from('merchants').select('*').eq('id', idOrCode).maybeSingle();
        if (!data) {
            const { data: mc, error: mcErr } = await supabase.from('merchants').select('*').eq('merchant_code', idOrCode).maybeSingle();
            data = mc;
            error = mcErr;
        }
        return { data, error };
    }

    async getMerchantInfo(merchantId: string) {
        return await supabase.from('merchants').select('*').eq('id', merchantId).single();
    }

    async saveMerchant(merchant: any) {
        const { data, error } = await supabase.from('merchants').upsert(merchant).select().single();
        if (data && data.id) {
            try {
                const emptyFile = new File([''], '.placeholder', { type: 'text/plain' });
                await supabase.storage.from('merchant-data').upload(`${data.id}/menus/.placeholder`, emptyFile, { upsert: true });
                await supabase.storage.from('merchant-data').upload(`${data.id}/productos/.placeholder`, emptyFile, { upsert: true });
                await supabase.storage.from('merchant-data').upload(`${data.id}/logos/.placeholder`, emptyFile, { upsert: true });
            } catch (err) {
                console.warn('Could not initialize merchant storage folders:', err);
            }
        }
        return { data, error };
    }

    async updateMerchant(id: string, updates: any) {
        return await supabase.from('merchants').update(updates).eq('id', id);
    }

    async deleteMerchant(id: string) {
        return await supabase.from('merchants').delete().eq('id', id);
    }

    async checkMerchantCodeAvailability(code: string, excludeId?: string) {
        let query = supabase.from('merchants').select('id', { count: 'exact', head: true }).eq('merchant_code', code);
        if (excludeId) query = query.neq('id', excludeId);
        const { count, error } = await query;
        return { exists: (count || 0) > 0, error };
    }

    // --- CATEGORÍAS ---
    async getCategories(merchantId: string) {
        if (!merchantId || !this.isValidUUID(merchantId)) {
            return { data: [], error: { message: `ID de comercio inválido ("${merchantId}")` } };
        }
        let result = await supabase.from('categories').select('*').eq('merchant_id', merchantId)
            .order('sort_order', { ascending: true }).order('name', { ascending: true });
        if (result.error?.message?.includes('sort_order')) {
            result = await supabase.from('categories').select('*').eq('merchant_id', merchantId).order('name', { ascending: true });
        }
        return { data: result.data, error: result.error };
    }

    async updateCategoriesOrder(updates: { id: string; sort_order: number }[]) {
        return Promise.all(updates.map(u => supabase.from('categories').update({ sort_order: u.sort_order }).eq('id', u.id)));
    }

    async saveCategory(category: any) { return await supabase.from('categories').upsert(category).select().single(); }
    async updateCategory(id: string, updates: any) { return await supabase.from('categories').update(updates).eq('id', id); }
    async deleteCategory(id: string) { return await supabase.from('categories').delete().eq('id', id); }

    // --- PRODUCTOS ---
    async getProducts(merchantId: string) {
        if (!merchantId || !this.isValidUUID(merchantId)) {
            return { data: [], error: { message: `ID de comercio inválido ("${merchantId}")` } };
        }
        return await supabase.from('products').select('*').eq('merchant_id', merchantId).order('name');
    }

    async saveProduct(product: any) { return await supabase.from('products').upsert(product).select().single(); }
    async updateProduct(id: string, updates: any) { return await supabase.from('products').update(updates).eq('id', id); }
    async deleteProduct(productId: string) { return await supabase.from('products').delete().eq('id', productId); }

    // --- RECURSOS RESERVABLES ---
    async getReservableResources(merchantId: string) {
        if (!merchantId || !this.isValidUUID(merchantId)) return { data: [], error: { message: 'ID inválido' } };
        return await supabase.from('reservable_resources').select('*').eq('merchant_id', merchantId).order('name');
    }

    // --- RESERVAS ---
    async createReservation(reservation: any, getOrCreateCustomer: (m: string, p: string, n?: string) => Promise<string | null>) {
        if (!reservation.merchant_id || !this.isValidUUID(reservation.merchant_id)) {
            return { data: null, error: { message: 'ID de comercio inválido' } };
        }
        const customerId = await getOrCreateCustomer(reservation.merchant_id, reservation.customer_phone, reservation.customer_name);
        if (!customerId) return { data: null, error: { message: 'No se pudo crear/obtener el cliente en CRM' } };

        let start = new Date(reservation.start_time);
        if (isNaN(start.getTime())) {
            const timeMatch = reservation.start_time.match(/(\d{2}):(\d{2})/);
            start = timeMatch ? new Date() : new Date();
            if (timeMatch) start.setHours(parseInt(timeMatch[1]), parseInt(timeMatch[2]), 0, 0);
        }
        const end = new Date(start.getTime() + (reservation.duration || 60) * 60000);

        return await supabase.from('bookings').insert({
            merchant_id: reservation.merchant_id,
            customer_id: customerId,
            resource_id: reservation.resource_id,
            start_time: start.toISOString(),
            end_time: end.toISOString(),
            pax: reservation.pax || 1,
            status: reservation.status || 'confirmed',
            channel: 'whatsapp',
            metadata: { customer_name_manual: reservation.customer_name, source: 'Bot Simulation/Live' }
        }).select().single();
    }

    // --- MÉTRICAS ---
    async getMerchantMetrics(merchantId: string) {
        const { data: orders, error: err1 } = await supabase
            .from('orders')
            .select('total, created_at, closing_agent_type')
            .eq('merchant_id', merchantId);
        if (err1) return { error: err1 };

        const totalSales = orders.reduce((acc, curr) => acc + Number(curr.total), 0);
        const totalOrders = orders.length;
        const aiOrders = orders.filter(o => o.closing_agent_type === 'ai').length;
        const conversionRate = totalOrders > 0 ? Math.round((aiOrders / totalOrders) * 100) : 0;

        return { data: { totalSales, totalOrders, aiOrders, conversionRate, avgTime: '24 min' } };
    }

    // --- PERFILES ---
    async getProfile(id: string) { return await supabase.from('profiles').select('*').eq('id', id).single(); }
    async getProfiles() { return await supabase.from('profiles').select('*, merchants(name), team_members(team_id, teams(name))').order('created_at', { ascending: false }); }
    async saveProfile(profile: any) { return await supabase.from('profiles').upsert(profile).select().single(); }
    async deleteProfile(id: string) { return await supabase.from('profiles').delete().eq('id', id); }

    // --- TEAMS ---
    async getTeams(merchantId: string) { return await supabase.from('teams').select('*').eq('merchant_id', merchantId); }
    async saveTeam(team: any) { return await supabase.from('teams').upsert(team).select().single(); }
    async deleteTeam(teamId: string) { return await supabase.from('teams').delete().eq('id', teamId); }
    async addTeamMember(teamId: string, userId: string) { return await supabase.from('team_members').upsert({ team_id: teamId, user_id: userId }); }

    // --- PLATFORM SETTINGS ---
    async getPlatformSettings() { return await supabase.from('platform_settings').select('*').eq('id', 'global').single(); }
    async updatePlatformSettings(updates: any) { return await supabase.from('platform_settings').upsert({ id: 'global', ...updates }); }

    // --- LANDINGS ---
    async getLandingByMerchant(merchantId: string) { return await supabase.from('ai_landing_pages').select('*').eq('merchant_id', merchantId).maybeSingle(); }
    async getLandingBySlug(slug: string) { return await supabase.from('ai_landing_pages').select('*').eq('slug', slug).maybeSingle(); }
    async saveLandingPage(landing: any) { return await supabase.from('ai_landing_pages').upsert(landing).select().single(); }

    // --- KNOWLEDGE BASE (RAG) ---
    async getKnowledgeBaseDocuments(merchantId: string) {
        return await supabase.from('knowledge_base_documents').select('*').eq('merchant_id', merchantId).order('updated_at', { ascending: false });
    }
    async saveKnowledgeBaseDocument(doc: any) { return await supabase.from('knowledge_base_documents').upsert(doc).select().single(); }
    async deleteKnowledgeBaseDocument(id: string) { return await supabase.from('knowledge_base_documents').delete().eq('id', id); }
    async getKnowledgeBaseChunks(documentId: string) {
        return await supabase.from('knowledge_base_chunks').select('*').eq('document_id', documentId).order('chunk_index', { ascending: true });
    }
    async saveKnowledgeBaseChunk(chunk: any) { return await supabase.from('knowledge_base_chunks').insert(chunk).throwOnError(); }
    async deleteKnowledgeBaseChunks(documentId: string) { return await supabase.from('knowledge_base_chunks').delete().eq('document_id', documentId); }
    async searchKnowledgeBase(merchantId: string, embedding: number[], threshold: number = 0.5, limit: number = 5) {
        return await supabase.rpc('match_knowledge_base_chunks', { p_merchant_id: merchantId, p_embedding: embedding, p_match_threshold: threshold, p_match_count: limit });
    }

    // --- STORAGE ---
    async uploadFile(bucket: string, path: string, file: File) {
        const { data, error } = await supabase.storage.from(bucket).upload(path, file, { cacheControl: '3600', upsert: true });
        if (error) return { data: null, error };
        const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(data.path);
        return { data: { ...data, publicUrl }, error: null };
    }

    // --- EMBEDDINGS ---
    async generateEmbedding(text: string, settings: any): Promise<number[] | null> {
        const provider = settings?.embed_provider || 'google_gemini';
        let model = settings?.embed_model;
        if (!model) model = provider === 'google_gemini' ? 'models/gemini-embedding-001' : 'text-embedding-3-small';

        const apiKey = settings?.embed_api_key || settings?.ai_api_key;
        const ollamaUrl = settings?.ollama_base_url || 'http://localhost:11434';
        if (!apiKey && provider !== 'ollama') return null;

        try {
            if (provider === 'google_gemini') {
                let targetModelId = model || 'models/gemini-embedding-001';
                const fullModelId = targetModelId.includes('/') ? targetModelId : `models/${targetModelId}`;
                const body: any = { content: { parts: [{ text }] } };
                if (fullModelId.includes('preview')) body.outputDimensionality = 768;

                const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/${fullModelId}:embedContent?key=${apiKey}`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
                });
                const data = await resp.json();
                if (data.error) {
                    if (fullModelId !== 'models/gemini-embedding-001') {
                        return this.generateEmbedding(text, { ...settings, embed_model: 'models/gemini-embedding-001' });
                    }
                    throw new Error(data.error.message || 'Error en API de Google');
                }
                let values = data.embedding?.values;
                if (!values || !Array.isArray(values)) throw new Error('Respuesta sin vector válido');
                if (values.length > 768) values = values.slice(0, 768);
                if (values.length < 768) throw new Error(`Pocas dimensiones (${values.length}). Se requieren 768.`);
                return values;
            } else if (provider === 'openai') {
                const resp = await fetch('https://api.openai.com/v1/embeddings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                    body: JSON.stringify({ model: model || 'text-embedding-3-small', input: text, dimensions: 768 })
                });
                const data = await resp.json();
                if (data.error) throw new Error(data.error.message || 'Error en API OpenAI');
                return data.data?.[0]?.embedding || null;
            } else if (provider === 'ollama') {
                const headers: any = { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' };
                if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
                const resp = await fetch(`${ollamaUrl}/api/embeddings`, {
                    method: 'POST', headers, body: JSON.stringify({ model, prompt: text })
                });
                const data = await resp.json();
                if (data.error) throw new Error(data.error || 'Error en API Ollama');
                return data.embedding || null;
            }
        } catch (e: any) {
            console.error('Error en generateEmbedding:', e);
            throw e;
        }
        return null;
    }

    // --- RPC Genérico ---
    async rpc(functionName: string, params: any) {
        return await supabase.rpc(functionName, params);
    }

    // --- UTILIDADES ---
    isValidUUID(uuid: string): boolean {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
    }
}
