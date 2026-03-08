import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const { merchant_id } = await req.json();
        if (!merchant_id) throw new Error("merchant_id is required");

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        );

        // 1. Obtener credenciales de WooCommerce
        const { data: m, error: mErr } = await supabase
            .from('merchants')
            .select('woocommerce_url, woocommerce_consumer_key, woocommerce_consumer_secret')
            .eq('id', merchant_id)
            .single();

        if (mErr || !m?.woocommerce_url) throw new Error("WooCommerce integration not configured for this merchant");

        const wcUrl = m.woocommerce_url.replace(/\/$/, "");
        const auth = btoa(`${m.woocommerce_consumer_key}:${m.woocommerce_consumer_secret}`);

        // 2. Sincronizar Categorías primero
        const catRes = await fetch(`${wcUrl}/wp-json/wc/v3/products/categories?per_page=100`, {
            headers: { "Authorization": `Basic ${auth}` }
        });
        const wcCategories = await catRes.json();

        const categoryMap: Record<string, string> = {};
        for (const cat of wcCategories) {
            const { data: newCat } = await supabase
                .from('categories')
                .upsert({
                    merchant_id,
                    name: cat.name,
                    display_order: cat.menu_order || 0
                }, { onConflict: 'merchant_id, name' })
                .select()
                .single();

            if (newCat) categoryMap[cat.id] = newCat.id;
        }

        // 3. Sincronizar Productos
        const prodRes = await fetch(`${wcUrl}/wp-json/wc/v3/products?per_page=100`, {
            headers: { "Authorization": `Basic ${auth}` }
        });
        const wcProducts = await prodRes.json();

        let syncCount = 0;
        for (const p of wcProducts) {
            const categoryId = p.categories?.[0] ? categoryMap[p.categories[0].id] : null;

            await supabase.from('products').upsert({
                merchant_id,
                category_id: categoryId,
                name: p.name,
                description: p.description?.replace(/<[^>]*>?/gm, '') || "", // Limpiar HTML
                price: parseFloat(p.price) || 0,
                image_url: p.images?.[0]?.src || null,
                is_available: p.stock_status === "instock",
                remote_id: String(p.id),
                tags: p.tags?.map((t: any) => t.name) || [],
                metadata: {
                    wc_url: p.permalink,
                    attributes: p.attributes,
                    variations: p.variations,
                    short_description: p.short_description,
                    all_images: p.images?.map((img: any) => img.src) || [],
                    upsell_ids: p.upsell_ids || [],
                    cross_sell_ids: p.cross_sell_ids || []
                }
            }, { onConflict: 'merchant_id, remote_id' });

            syncCount++;
        }

        return new Response(JSON.stringify({
            success: true,
            message: `Sincronización completada: ${syncCount} productos actualizados.`
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

    } catch (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }
});
