import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
    // Manejar preflight de CORS
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const { business_info, merchant_id } = await req.json();

        if (!business_info) {
            return new Response(JSON.stringify({ error: "Falta business_info" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Obtener API Key de Gemini desde variables de entorno de Supabase
        const apiKey = Deno.env.get("GEMINI_API_KEY");
        if (!apiKey) {
            throw new Error("GEMINI_API_KEY no configurada en las Edge Functions.");
        }

        const systemPrompt = `
        Eres un Experto en Marketing Digital y Conversión Web (CRO).
        Tu tarea es analizar la información de un negocio y generar un 'Blueprint' (mapa estructural) para su Landing Page profesional.
        
        PASO 1: Clasificar la industria en una de estas categorías:
        - 'restaurant': Foco en comida, menú, fotos apetitosas y pedidos rápidos.
        - 'hotel': Foco en hospitalidad, descanso, galería de fotos y reservas.
        - 'services': Foco en confianza, autoridad, beneficios claros y agendamiento.
        - 'ecommerce': Foco en producto físico, catálogo, descuentos y compra.
        - 'health': Foco en bienestar, profesionalismo, antes/después y turnos.

        PASO 2: Extraer/Generar Identidad:
        - Brand Name (Nombre de marca)
        - Propuesta de Valor (Slogan impactante)
        - Tono de voz (Elegante, Cercano, Profesional, Dinámico)

        PASO 3: Generar contenido por bloques (Redactar copies persuasivos):
        - Hero: Título y Subtítulo que conviertan.
        - Features: 3 beneficios clave con un icono sugerido (Lucide Icon name en minusculas, ej: 'zap', 'shield', 'heart').
        - About: Historia breve y humana centrada en el cliente.
        - SEO: Title y Meta Description.

        Responde ÚNICAMENTE con un JSON puro con esta estructura:
        {
          "industry_type": "...",
          "brand_name": "...",
          "tone": "...",
          "theme_suggestion": {
            "palette": {"primary": "#HEX", "secondary": "#HEX", "background": "#HEX", "text": "#HEX", "accent": "#HEX"},
            "typography": "Outfit"
          },
          "blocks_order": ["hero", "features", "about", "catalog", "location"],
          "content": {
            "hero": {"title": "...", "subtitle": "..."},
            "features": [{"icon": "...", "title": "...", "desc": "..."}],
            "about": {"title": "...", "text": "..."},
            "seo": {"title": "...", "description": "..."}
          }
        }
        `;

        const userPrompt = `Información del Negocio / ADN:\n${business_info}\n\nGenera el blueprint JSON:`;

        // Llamar a Gemini API
        const model = "gemini-1.5-flash";
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                system_instruction: { parts: [{ text: systemPrompt }] },
                contents: [{ role: "user", parts: [{ text: userPrompt }] }],
                generationConfig: {
                    temperature: 0.2,
                    maxOutputTokens: 2048,
                    response_mime_type: "application/json",
                },
            }),
        });

        const data = await response.json();
        const rawOutput = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!rawOutput) {
            throw new Error("Gemini no devolvió una respuesta válida.");
        }

        // Devolver el JSON parseado
        return new Response(rawOutput, {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (error: any) {
        console.error("[LANDING-GEN ERROR]", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
