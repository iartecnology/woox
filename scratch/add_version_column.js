const { createClient } = require('@supabase/supabase-js');
const url = 'https://khgegukjrtyjmonhavan.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtoZ2VndWtqcnR5am1vbmhhdmFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3OTQ4MTAsImV4cCI6MjA4NTM3MDgxMH0.V-dc1zSkU5R5hj45ihWsHR-9FWFTP4qxWyVUnTC8qdc';
const supabase = createClient(url, key);

async function run() {
  console.log("Intentando crear columna 'version'...");
  // Como no podemos ejecutar SQL directo fácilmente, intentamos una inserción que obligue a la DB a decirnos qué pasa o usamos una técnica de parcheo.
  // Pero lo más profesional es usar el RPC que ya tenemos o crear uno.
  
  // Vamos a intentar ejecutar el SQL de la migración mediante un truco de DDL si el usuario tiene permisos.
  const { error } = await supabase.rpc('execute_sql_internal', { 
    sql: "ALTER TABLE bot_flows ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;" 
  }).catch(e => ({ error: e }));

  if (error) {
    console.log("No se pudo ejecutar vía RPC interno. Por favor, ejecuta el SQL manualmente en el Dashboard de Supabase.");
    console.log("SQL a ejecutar:");
    console.log("ALTER TABLE bot_flows ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;");
    console.log("ALTER TABLE bot_flows DROP CONSTRAINT IF EXISTS bot_flows_merchant_id_name_key;");
    console.log("ALTER TABLE bot_flows ADD CONSTRAINT bot_flows_merchant_name_version_key UNIQUE (merchant_id, name, version);");
  } else {
    console.log("✅ Columna creada con éxito!");
  }
}
run();
