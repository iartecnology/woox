import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

supabase_url = os.environ.get("SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

print(f"[DB] Buscando configuración en el entorno...")
if not supabase_url: print("[DB] ❌ SUPABASE_URL no detectada.")
if not supabase_key: print("[DB] ❌ SUPABASE_SERVICE_ROLE_KEY no detectada.")

def get_supabase() -> Client:
    """Retorna un cliente de Supabase autenticado como Service Role."""
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    
    if not url or not key:
        print("[DB] ❌ Error: SUPABASE_URL o KEY están vacíos después de limpiar espacios.")
        return None
    
    try:
        return create_client(url, key)
    except Exception as e:
        print(f"[DB] ❌ Error crítico al crear el cliente: {str(e)}")
        return None
