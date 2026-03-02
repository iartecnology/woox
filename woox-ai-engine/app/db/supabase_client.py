import os
from supabase import create_client, Client
from dotenv import load_dotenv

# Solo cargamos el entorno una vez
load_dotenv()

def get_supabase() -> Client:
    """
    Retorna un cliente de Supabase autenticado como Service Role.
    Retorna None si la configuración es incompleta o falla, pero no lanza excepciones.
    """
    url = (os.environ.get("SUPABASE_URL") or "").strip()
    key = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    
    if not url or not key:
        return None
    
    try:
        # Intentar inicializar el cliente
        client = create_client(url, key)
        return client
    except Exception as e:
        # Capturamos fallos de red/DNS/formatos
        print(f"[Supabase Client Error] {str(e)}")
        return None
