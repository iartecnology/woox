import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

def get_supabase_detailed():
    """
    Retorna (cliente, error_msg, stats)
    stats: dict con info de las variables detectadas
    """
    url = (os.environ.get("SUPABASE_URL") or "").strip().replace("\r", "").replace("\n", "")
    key = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip().replace("\r", "").replace("\n", "")
    
    stats = {
        "url_len": len(url),
        "key_len": len(key),
        "has_url": bool(url),
        "has_key": bool(key)
    }

    if not url or not key:
        return None, "Faltan variables SUPABASE_URL o KEY.", stats
    
    try:
        client = create_client(url, key)
        return client, None, stats
    except Exception as e:
        return None, f"Error libreria Supabase: {str(e)}", stats

def get_supabase() -> Client:
    """Mantenemos compatibilidad con el resto del código."""
    client, _, _ = get_supabase_detailed()
    return client
