/**
 * Utility to notify merchant agents via FCM
 */
export async function notifyMerchantAgents(supabase: any, merchantId: string, title: string, body: string, data?: any) {
  try {
    console.log(`[Notification Shared] Intentando notificar a agentes del comercio: ${merchantId}`);
    
    // 1. Obtener todos los perfiles asociados a este comercio
    const { data: profiles, error: pErr } = await supabase
      .from('profiles')
      .select('id')
      .eq('merchant_id', merchantId);

    if (pErr) throw pErr;
    if (!profiles || profiles.length === 0) {
      console.log("[Notification Shared] No se encontraron agentes activos para este comercio.");
      return;
    }

    // 2. Para cada agente, invocar la función de push-notifications
    // Lo hacemos en paralelo para mayor velocidad
    const notificationPromises = profiles.map((profile: any) => {
      return supabase.functions.invoke('push-notifications', {
        body: {
          user_id: profile.id,
          title: title,
          body: body,
          data: data
        }
      });
    });

    const results = await Promise.all(notificationPromises);
    const successCount = results.filter(r => !r.error).length;
    console.log(`[Notification Shared] Resultado de notificaciones: ${successCount}/${profiles.length} enviadas con éxito.`);
    
  } catch (err: any) {
    console.error(`[Notification Shared] Error crítico enviando notificaciones:`, err.message);
  }
}
