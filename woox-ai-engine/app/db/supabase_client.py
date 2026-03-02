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
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    
    if not url or not key:
        return None  # Retornar None para que el monitor lo marque como error sin crashear el motor
    return create_client(url, key)
