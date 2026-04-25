const fetch = require('node-fetch') || globalThis.fetch;

async function run() {
  const SUPABASE_URL = 'https://khgegukjrtyjmonhavan.supabase.co';
  // Usamos la service_role key para poder ejecutar DDL
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!SERVICE_KEY) {
    console.log('⚠️ No se encontró SUPABASE_SERVICE_ROLE_KEY en las variables de entorno.');
    console.log('');
    console.log('👉 Por favor ejecuta este SQL manualmente en:');
    console.log('   https://supabase.com/dashboard/project/khgegukjrtyjmonhavan/sql/new');
    console.log('');
    console.log('📋 Copia y pega el contenido de:');
    console.log('   supabase/migrations/20260424_unify_channels.sql');
    return;
  }

  const sql = require('fs').readFileSync('supabase/migrations/20260424_unify_channels.sql', 'utf8');
  
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/execute_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`
    },
    body: JSON.stringify({ sql })
  });
  
  if (resp.ok) {
    console.log('✅ Migración ejecutada con éxito');
  } else {
    const err = await resp.text();
    console.log('❌ Error:', err);
    console.log('');
    console.log('👉 Ejecuta manualmente en el SQL Editor de Supabase:');
    console.log('   https://supabase.com/dashboard/project/khgegukjrtyjmonhavan/sql/new');
  }
}
run();
