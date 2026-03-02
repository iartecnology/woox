import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

def get_supabase() -> Client:
    """
    Retorna un cliente de Supabase autenticado como Service Role.
    Lanza una excepción descriptiva si la configuración es inválida o falla.
    """
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    
    if not url:
        raise ValueError("SUPABASE_URL no configurada en el entorno.")
    if not key:
        raise ValueError("SUPABASE_SERVICE_ROLE_KEY no configurada en el entorno.")
    
    try:
        # Intentar inicializar el cliente
        client = create_client(url, key)
        return client
    except Exception as e:
        # Probablemente error de formato de URL o red
        raise ConnectionError(f"Fallo al conectar con Supabase: {str(e)}")
