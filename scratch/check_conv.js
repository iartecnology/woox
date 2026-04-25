const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: merchant } = await supabase.from('merchants').select('id').ilike('name', '%Casa Le Bistro%').single();
  if (!merchant) { console.log("Merchant not found"); return; }
  
  const { data: convs } = await supabase.from('conversations')
    .select('*, customers(*)')
    .eq('merchant_id', merchant.id)
    .order('last_message_at', { ascending: false })
    .limit(5);
    
  if (!convs || convs.length === 0) { console.log("No conversations found"); return; }
  
  for (const conv of convs) {
    console.log(`--- Conv ID: ${conv.id} | Customer: ${conv.customers?.full_name} | Channel: ${conv.channel} ---`);
    const { data: msgs } = await supabase.from('messages')
      .select('*')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: true });
    
    msgs.forEach(m => {
      console.log(`[${m.sender_type}] ${m.content}`);
    });
    
    const { data: session } = await supabase.from('bot_flow_sessions')
      .select('*')
      .eq('conversation_id', conv.id)
      .maybeSingle();
    
    console.log(`Session:`, session ? { node: session.current_node_id, waiting: session.waiting_for, status: session.status } : 'NONE');
  }
}
check();
