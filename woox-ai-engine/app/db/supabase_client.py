import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not supabase_url or not supabase_key:
    # Si no están cargadas, intentamos buscarlas en el entorno sin load_dotenv (Docker)
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

def get_supabase() -> Client:
    """Retorna un cliente de Supabase autenticado como Service Role."""
    if not supabase_url or not supabase_key:
        raise ValueError("SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY deben estar configurados.")
    return create_client(supabase_url, supabase_key)
