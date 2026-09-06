import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { processBotFlow, processBotFlowWithOverride } from "../_shared/bot-engine.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { 
      conversation_id, 
      merchant_id, 
      customer_id, 
      message,
      // Nuevos parámetros para el simulador:
      flow_data,      // JSON del flujo completo (nodos + conexiones)
      flow_id,        // ID del flujo siendo probado
      node_context,   // Prompt/contexto del nodo de IA activo
      simulator_mode  // true cuando viene del simulador
    } = body;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Resolver customer_id si no viene
    let final_customer_id = customer_id;
    if (!final_customer_id) {
       const { data: conv } = await supabase.from('conversations').select('customer_id').eq('id', conversation_id).single();
       final_customer_id = conv?.customer_id;
    }
    if (!final_customer_id) {
        const { data: customer } = await supabase.from('customers').select('id').eq('merchant_id', merchant_id).limit(1).single();
        final_customer_id = customer?.id;
    }
    if (!final_customer_id) {
        throw new Error("Customer ID required or could not be found.");
    }

    let responseText: string;

    // MODO SIMULADOR: Usar el flow_data enviado directamente (sin cargarlo desde BD)
    if (simulator_mode && flow_data) {
      console.log('[BOT-ENGINE] Modo simulador activado. Usando flow_data del cliente.');
      responseText = await processBotFlowWithOverride(
        supabase,
        merchant_id,
        conversation_id,
        message,
        final_customer_id,
        flow_data,
        flow_id || 'simulator',
        node_context
      );
    } else {
      // MODO PRODUCCIÓN: Cargar flujo desde BD (comportamiento original)
      responseText = await processBotFlow(supabase, merchant_id, conversation_id, message, final_customer_id);
    }

    return new Response(JSON.stringify({ 
      content: responseText,
      success: true 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("[BOT-ENGINE ERROR]", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
