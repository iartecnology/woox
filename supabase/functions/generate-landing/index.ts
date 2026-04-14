import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ===== LAYOUT STYLES =====
const layoutStyles = [
    {
        name: "Hero First",
        key: "hero-first",
        blocks_order: ["hero", "features", "about", "catalog", "location"],
        description: "Impacta con un hero section prominente que captura atención inmediata."
    },
    {
        name: "Features First",
        key: "features-first",
        blocks_order: ["features", "hero", "about", "catalog", "location"],
        description: "Destaca tus beneficios clave desde el primer scroll para decisión rápida."
    },
    {
        name: "Catálogo First",
        key: "catalog-first",
        blocks_order: ["hero", "catalog", "features", "about", "location"],
        description: "Muestra tus productos primero para clientes que buscan comprar ya."
    }
];

// ===== PALETTE GENERATOR =====
const palettes: Record<string, any> = {
    "modern": {
        primary: "#6366f1", secondary: "#818cf8", accent: "#a855f7",
        background: "#fafbff", text: "#0f172a"
    },
    "warm": {
        primary: "#f97316", secondary: "#fb923c", accent: "#eab308",
        background: "#fffbeb", text: "#1c1917"
    },
    "elegant": {
        primary: "#1e293b", secondary: "#334155", accent: "#94a3b8",
        background: "#f8fafc", text: "#0f172a"
    },
    "fresh": {
        primary: "#10b981", secondary: "#34d399", accent: "#06b6d4",
        background: "#f0fdf4", text: "#14532d"
    },
    "bold": {
        primary: "#ef4444", secondary: "#f87171", accent: "#f59e0b",
        background: "#fef2f2", text: "#1c1917"
    },
    "luxury": {
        primary: "#7c3aed", secondary: "#8b5cf6", accent: "#d946ef",
        background: "#faf5ff", text: "#1e1b4b"
    }
};

const fontOptions = ["Outfit", "Inter", "DM Sans", "Space Grotesk", "Plus Jakarta Sans", "Manrope"];

serve(async (req: Request) => {
    // Manejar preflight de CORS
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const { business_info, merchant_id, logo_url, regenerate_count = 0 } = await req.json();

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

        // Increase temperature if regenerating for more variety
        const baseTemp = 0.2;
        const temperature = Math.min(baseTemp + (regenerate_count * 0.25), 0.9);

        const systemPrompt = `
Eres un Experto en Marketing Digital, Diseño Web y Conversión (CRO).
Tu tarea es analizar la información de un negocio y generar **3 VARIANTES** de blueprint para una Landing Page profesional.

Cada variante debe tener:
1. **Diferente layout structure** (hero-first, features-first, catalog-first)
2. **Diferente paleta de colores** (elige entre: modern, warm, elegant, fresh, bold, luxury)
3. **Diferente tipografía** (elige entre: Outfit, Inter, DM Sans, Space Grotesk, Plus Jakarta Sans, Manrope)
4. **Un nombre descriptivo** que refleje el estilo (ej: "Minimalista Moderno", "Cálido Acogedor", "Elegante Premium")

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
- Features: 3 beneficios clave con icono sugerido (Lucide Icon name en minúsculas, ej: 'zap', 'shield', 'heart').
- About: Historia breve y humana centrada en el cliente.
- SEO: Title y Meta Description.

Responde ÚNICAMENTE con un JSON puro con esta estructura (un array de 3 variantes):
{
  "variants": [
    {
      "template_name": "...",
      "industry_type": "...",
      "brand_name": "...",
      "tone": "...",
      "layout_style": "hero-first" | "features-first" | "catalog-first",
      "theme_suggestion": {
        "palette": {"primary": "#HEX", "secondary": "#HEX", "background": "#HEX", "text": "#HEX", "accent": "#HEX"},
        "typography": "..."
      },
      "blocks_order": ["hero", "features", "about", "catalog", "location"],
      "content": {
        "hero": {"title": "...", "subtitle": "..."},
        "features": [{"icon": "...", "title": "...", "desc": "..."}],
        "about": {"title": "...", "text": "..."},
        "seo": {"title": "...", "description": "..."}
      }
    }
  ]
}

Cada variante debe ser DISTINTA en layout, colores y tipografía. No repitas combinaciones.
`;

        const userPrompt = `Información del Negocio / ADN:
${business_info}

${logo_url ? `Logo URL: ${logo_url}` : ''}

Genera 3 variantes de blueprint JSON con layouts, paletas y tipografías distintas:`;

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
                    temperature: temperature,
                    maxOutputTokens: 4096,
                    response_mime_type: "application/json",
                },
            }),
        });

        const data = await response.json();
        const rawOutput = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!rawOutput) {
            throw new Error("Gemini no devolvió una respuesta válida.");
        }

        // Parsear la respuesta
        let parsed;
        try {
            parsed = JSON.parse(rawOutput);
        } catch {
            // Si falla el parseo, intentar limpiar el output
            const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error("Gemini devolvió un formato JSON inválido.");
            }
        }

        // Si el resultado ya tiene la estructura variants, devolverlo directo
        if (parsed.variants && Array.isArray(parsed.variants)) {
            return new Response(JSON.stringify(parsed), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Fallback: si devolvió un solo blueprint, convertirlo en variants
        const fallbackVariants = [
            { ...parsed, template_name: "Clásica", layout_style: "hero-first" }
        ];

        return new Response(JSON.stringify({ variants: fallbackVariants }), {
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
