import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// --- DEFINICIÓN DE HERRAMIENTAS MCP ---
const MCP_TOOLS = [
  {
    name: "catalog_search",
    description: "Busca productos en el catálogo. Devuelve nombre, descripción, precio y fotos.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Término de búsqueda" },
        merchant_id: { type: "string", description: "UUID del comercio" }
      },
      required: ["query", "merchant_id"]
    }
  },
  {
    name: "add_to_cart",
    description: "Añade un producto al carrito del cliente.",
    inputSchema: {
      type: "object",
      properties: {
        merchant_id: { type: "string" },
        customer_id: { type: "string" },
        product_name: { type: "string" },
        quantity: { type: "number" },
        notes: { type: "string" }
      },
      required: ["merchant_id", "customer_id", "product_name", "quantity"]
    }
  },
  {
    name: "get_cart",
    description: "Obtiene el contenido actual del carrito del cliente.",
    inputSchema: {
      type: "object",
      properties: {
        merchant_id: { type: "string" },
        customer_id: { type: "string" }
      },
      required: ["merchant_id", "customer_id"]
    }
  },
  {
    name: "register_order",
    description: "Registra el pedido final con los datos del cliente.",
    inputSchema: {
      type: "object",
      properties: {
        merchant_id: { type: "string" },
        customer_id: { type: "string" },
        address: { type: "string" },
        customer_name: { type: "string" },
        customer_phone: { type: "string" }
      },
      required: ["merchant_id", "customer_id", "address", "customer_name", "customer_phone"]
    }
  }
];

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // --- PROTOCOLO MCP: SOPORTE SSE (GET) PARA CLIENTES COMO N8N ---
  if (req.method === 'GET') {
    const sseUrl = new URL(req.url);
    const postUrl = `${sseUrl.origin}${sseUrl.pathname}${sseUrl.search}`;
    
    console.log(`[MCP-WOOX] SSE Init GET requested, posting back to: ${postUrl}`);

    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`event: endpoint\ndata: ${postUrl}\n\n`));
      },
      cancel() {
        console.log("[MCP-WOOX] SSE Connection cancelled/closed");
      }
    });

    return new Response(body, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json();
    const { method, params } = body;

    console.log(`[MCP-WOOX] Method: ${method}`, params);

    // --- PROTOCOLO MCP: LISTAR HERRAMIENTAS ---
    if (method === "tools/list") {
      return new Response(JSON.stringify({
        tools: MCP_TOOLS
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // --- PROTOCOLO MCP: LLAMAR HERRAMIENTA ---
    if (method === "tools/call") {
      const { name, arguments: args } = params;
      let result = "";

      // Reutilizamos la lógica de base de datos directamente
      switch (name) {
        case "catalog_search": {
          const { data } = await supabase.rpc('search_products_v2', {
            p_merchant_id: args.merchant_id,
            p_query: args.query
          });
          result = data?.length > 0 
            ? data.map((p: any) => `- ${p.name}: $${p.price} (${p.description})`).join('\n')
            : "No se encontraron productos.";
          break;
        }

        case "add_to_cart": {
          const { data, error } = await supabase.rpc('manage_cart_v2', {
            p_merchant_id: args.merchant_id,
            p_customer_id: args.customer_id,
            p_product_name: args.product_name,
            p_quantity: args.quantity,
            p_notes: args.notes || ''
          });
          result = error ? `Error: ${error.message}` : `✅ ${args.product_name} añadido al carrito.`;
          break;
        }

        case "get_cart": {
          const { data } = await supabase
            .from('bot_flow_sessions')
            .select('cart')
            .eq('merchant_id', args.merchant_id)
            .eq('customer_id', args.customer_id)
            .maybeSingle();
          
          const cart = data?.cart || [];
          result = cart.length > 0 
            ? cart.map((i: any) => `${i.product_name} x${i.quantity}`).join('\n')
            : "El carrito está vacío.";
          break;
        }

        case "register_order": {
          // Lógica simplificada de registro para MCP
          const { data: session } = await supabase
            .from('bot_flow_sessions')
            .select('cart')
            .eq('merchant_id', args.merchant_id)
            .eq('customer_id', args.customer_id)
            .single();

          if (!session?.cart?.length) {
            result = "Error: El carrito está vacío.";
            break;
          }

          const { error } = await supabase.from('orders').insert({
            merchant_id: args.merchant_id,
            customer_id: args.customer_id,
            customer_name: args.customer_name,
            customer_phone: args.customer_phone,
            address: args.address,
            items: session.cart,
            status: 'pending'
          });

          if (!error) {
            await supabase.from('bot_flow_sessions').update({ cart: [] }).eq('customer_id', args.customer_id);
            result = "✅ Pedido registrado con éxito.";
          } else {
            result = `Error al registrar: ${error.message}`;
          }
          break;
        }

        default:
          return new Response(JSON.stringify({ error: { message: "Tool not found" } }), { status: 404 });
      }

      return new Response(JSON.stringify({
        content: [{ type: "text", text: result }]
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: { message: "Method not supported" } }), { status: 400 });

  } catch (err) {
    return new Response(JSON.stringify({ error: { message: err.message } }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
