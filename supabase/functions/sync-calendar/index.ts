import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import ical from "https://esm.sh/ical.js@1.5.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  try {
    console.log("[SYNC-CALENDAR] Iniciando sincronización iCal...");

    // 1. Obtener recursos con URL de sincronización externa
    const { data: resources, error: resError } = await supabase
      .from("reservable_resources")
      .select("id, merchant_id, external_sync_url")
      .not("external_sync_url", "is", null);

    if (resError) throw resError;
    if (!resources || resources.length === 0) {
      return new Response(JSON.stringify({ message: "No hay recursos para sincronizar." }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const syncSummary = [];

    for (const resource of resources) {
      console.log(`[SYNC-CALENDAR] Sincronizando Recurso: ${resource.id} | URL: ${resource.external_sync_url}`);
      
      try {
        const res = await fetch(resource.external_sync_url!);
        const icsData = await res.text();
        
        const jcalData = ical.parse(icsData);
        const vcalendar = new ical.Component(jcalData);
        const vevents = vcalendar.getAllSubcomponents("vevent");

        const exceptions = [];

        for (const event of vevents) {
          const summary = event.getFirstPropertyValue("summary");
          const dtstart = event.getFirstPropertyValue("dtstart").toJSDate();
          const dtend = event.getFirstPropertyValue("dtend").toJSDate();

          // Solo sincronizar bloqueos futuros o recientes (ej: 7 días atrás y 365 días adelante)
          const now = new Date();
          const horizon = new Date();
          horizon.setDate(now.getDate() - 7);

          if (dtend > horizon) {
            exceptions.push({
              resource_id: resource.id,
              merchant_id: resource.merchant_id,
              start_datetime: dtstart.toISOString(),
              end_datetime: dtend.toISOString(),
              reason: `Sincronización Externa: ${summary || "Ocupado"}`,
              is_block: true,
              metadata: { source: "ical_sync", event_id: event.getFirstPropertyValue("uid") }
            });
          }
        }

        // 2. Limpiar bloqueos previos de sincronización para este recurso
        // (Nota: Esto evita duplicados pero debe ser cuidadoso)
        await supabase
          .from("availability_exceptions")
          .delete()
          .eq("resource_id", resource.id)
          .eq("metadata->>source", "ical_sync");

        // 3. Insertar nuevos bloqueos
        if (exceptions.length > 0) {
          const { error: insError } = await supabase.from("availability_exceptions").insert(exceptions);
          if (insError) throw insError;
        }

        syncSummary.push({ resource_id: resource.id, events_synced: exceptions.length });

      } catch (err: any) {
        console.error(`[SYNC-CALENDAR] Error sincronizando recurso ${resource.id}:`, err.message);
        syncSummary.push({ resource_id: resource.id, error: err.message });
      }
    }

    return new Response(JSON.stringify({ success: true, summary: syncSummary }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[SYNC-CALENDAR] Error Global:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
