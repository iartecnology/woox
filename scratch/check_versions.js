const { createClient } = require('@supabase/supabase-js');
const url = 'https://khgegukjrtyjmonhavan.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtoZ2VndWtqcnR5am1vbmhhdmFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3OTQ4MTAsImV4cCI6MjA4NTM3MDgxMH0.V-dc1zSkU5R5hj45ihWsHR-9FWFTP4qxWyVUnTC8qdc';
const supabase = createClient(url, key);

async function check() {
  const { data: merchant } = await supabase.from('merchants').select('id').ilike('name', '%Casa Le Bistro%').single();
  if (!merchant) { console.log("Merchant not found"); return; }
  
  const { data: flows } = await supabase.from('bot_flows')
    .select('id, name, version, is_active, updated_at')
    .eq('merchant_id', merchant.id)
    .order('updated_at', { ascending: false });
    
  console.log(`Merchant ID: ${merchant.id}`);
  console.table(flows);
  
  const { data: activeFlow } = await supabase.rpc('get_active_bot_flow', { p_merchant_id: merchant.id });
  console.log(`Active Flow according to RPC:`, activeFlow?.id, "| Version:", activeFlow?.version);
}
check();
