import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-auth-token",
};

serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const { merchant_id, conversation_id, customer_id, message_text, platform } = await req.json();

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        );

        // 1. Obtener Configuración del Comercio y IA
        const { data: merchant } = await supabase.from("merchants").select("*").eq("id", merchant_id).single();
        const { data: platformSettings } = await supabase.from("platform_settings").select("*").eq("id", "global").single();

        if (!merchant) throw new Error("Comercio no encontrado.");

        // 2. Obtener Prompt Compilado (vía RPC)
        const { data: systemPrompt } = await supabase.rpc("get_compiled_prompt", { p_merchant_id: merchant_id });

        // 3. Obtener Historial Reciente (últimos 6 mensajes)
        const { data: history } = await supabase
            .from("messages")
            .select("sender_type, content")
            .eq("conversation_id", conversation_id)
            .order("created_at", { ascending: false })
            .limit(6);
        
        const historyContext = history 
            ? history.reverse().map(m => `${m.sender_type === 'customer' ? 'Cliente' : 'Asistente'}: ${m.content}`).join('\n')
            : "";

        // 4. Configuración de IA (Prioridad: Merchant > Global > Env)
        const apiKey = merchant.ai_api_key || platformSettings?.ai_api_key || Deno.env.get("GEMINI_API_KEY");
        const model = merchant.ai_model || platformSettings?.ai_model || "gemini-1.5-flash";

        if (!apiKey) throw new Error("API Key de IA no configurada.");

        // 5. Preparar Prompt Multitarea (Migrado de Python)
        const multitaskInstruction = `
        IMPORTANTE: Al final de tu respuesta, DEBES incluir un bloque de datos JSON con el resumen de la compra y perfilamiento usando la siguiente estructura.
        
        [DATA]
        {
            "order": {
                "items": [{"name": "producto", "qty": 1, "price": 0.0}],
                "total": 0.0,
                "is_complete": false
            },
            "crm": {
                "preferences": ["prefiere dulce", "pide sin cebolla"],
                "tags": ["cliente_frecuente", "potencial_pro"],
                "sentiment": "positive/neutral/negative"
            }
        }
        [/DATA]
        
        No envíes ningún otro bloque JSON. Si no hay datos, envía el bloque vacío.
        Se breve, cordial y usa emojis.
        `;

        const fullSystemPrompt = `${systemPrompt}\n\n${multitaskInstruction}`;

        // 6. Llamada a Gemini
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const aiResponse = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                system_instruction: { parts: [{ text: fullSystemPrompt }] },
                contents: [{ role: "user", parts: [{ text: `HISTORIAL:\n${historyContext}\n\nMENSAJE ACTUAL: ${message_text}` }] }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 1024,
                },
            }),
        });

        const aiData = await aiResponse.json();
        const rawText = aiData.candidates?.[0]?.content?.parts?.[0]?.text || "Mmm, no pude procesar eso. Intentemos de nuevo.";

        // 7. Parsear Respuesta y Datos (RegEx migrado de Python)
        let cleanResponse = rawText;
        let orderData = null;
        let crmData = null;

        const dataMatch = rawText.match(/\[DATA\]([\s\S]*?)\[\/DATA\]/);
        if (dataMatch) {
            try {
                const parsed = JSON.parse(dataMatch[1].trim());
                orderData = parsed.order;
                crmData = parsed.crm;
                cleanResponse = rawText.replace(dataMatch[0], "").trim();
            } catch (e) {
                console.error("[AI-PROCESSOR] Error parseando JSON de IA", e);
            }
        }

        // 8. Actualizar CRM en Base de Datos
        if (crmData) {
            await supabase.from("customers").update({
                preferences: crmData.preferences,
                sentiment: crmData.sentiment,
                updated_at: new Date().toISOString()
            }).eq("id", customer_id);
        }

        // 9. Guardar metadatos en la conversación (Typing data para el dashboard)
        if (orderData) {
            await supabase.from("conversations").update({
                typing_data: orderData,
                updated_at: new Date().toISOString()
            }).eq("id", conversation_id);
        }

        return new Response(JSON.stringify({
            success: true,
            response: cleanResponse,
            order_data: orderData,
            crm_data: crmData
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (error: any) {
        console.error("[AI-PROCESSOR ERROR]", error);
        return new Response(JSON.stringify({ success: false, error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
