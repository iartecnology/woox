import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

supabase_url = os.environ.get("SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

print(f"[DB] Buscando configuración en el entorno...")
if not supabase_url: print("[DB] ❌ SUPABASE_URL no detectada.")
if not supabase_key: print("[DB] ❌ SUPABASE_SERVICE_ROLE_KEY no detectada.")

def get_supabase():
    """Retorna (cliente, error_str)"""
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    
    if not url or not key:
        return None, "URL o KEY vacíos en entorno"
    
    try:
        client = create_client(url, key)
        return client, None
    except Exception as e:
        return None, f"Excepción create_client: {str(e)}"
