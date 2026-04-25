const { createClient } = require('@supabase/supabase-js');
const url = 'https://khgegukjrtyjmonhavan.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtoZ2VndWtqcnR5am1vbmhhdmFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3OTQ4MTAsImV4cCI6MjA4NTM3MDgxMH0.V-dc1zSkU5R5hj45ihWsHR-9FWFTP4qxWyVUnTC8qdc';
const supabase = createClient(url, key);

async function read() {
  const { data: merchant } = await supabase.from('merchants').select('id').ilike('name', '%Casa Le Bistro%').single();
  if (!merchant) { console.log("Merchant not found"); return; }
  
  const { data: convs } = await supabase.from('conversations')
    .select('id, metadata, customers(full_name)')
    .eq('merchant_id', merchant.id)
    .order('last_message_at', { ascending: false })
    .limit(1);
    
  if (convs && convs.length > 0) {
    const c = convs[0];
    console.log(`Conv: ${c.id} | Customer: ${c.customers?.full_name}`);
    console.log(`Debug Logs:`, c.metadata?.bot_debug || "No debug logs found");
    
    const { data: session } = await supabase.from('bot_flow_sessions')
      .select('*')
      .eq('conversation_id', c.id)
      .maybeSingle();
    console.log(`Session:`, session);
  }
}
read();
