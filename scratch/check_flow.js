const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: merchant } = await supabase.from('merchants').select('id').ilike('name', '%Casa Le Bistro%').single();
  if (!merchant) { console.log("Merchant not found"); return; }
  
  const { data: flows } = await supabase.from('bot_flows').select('*').eq('merchant_id', merchant.id).eq('is_active', true);
  if (!flows || flows.length === 0) { console.log("No active flows"); return; }
  
  const flow = flows[0];
  const nodes = flow.flow_data.nodes;
  const ids = nodes.map(n => n.id);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  
  console.log(`Flow ID: ${flow.id}`);
  console.log(`Total nodes: ${nodes.length}`);
  console.log(`Duplicate IDs:`, duplicates);
  
  if (duplicates.length > 0) {
    console.log("CRITICAL: Found duplicate IDs!");
    duplicates.forEach(id => {
      const matching = nodes.filter(n => n.id === id);
      console.log(`- ID ${id} is shared by:`, matching.map(n => n.data.label || n.type));
    });
  }
}
check();
