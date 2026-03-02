from fastapi import FastAPI, HTTPException, Header, Request
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from app.skills.rag import RAGSkill
from app.skills.catalog import CatalogSkill
from app.skills.orders import OrderSkill
from app.core.router import IntentRouter
from app.core.llm import LLMService
from app.db.supabase_client import get_supabase
from functools import lru_cache
import os
import time
import re
import json

# Inicializar servicios de forma única y segura
try:
    supabase = get_supabase()
    rag_skill = RAGSkill()
    catalog_skill = CatalogSkill()
    order_skill = OrderSkill()
    router = IntentRouter()
    llm_service = LLMService()
    
    # Cache global para settings de la plataforma
    PLATFORM_SETTINGS = {}

    def refresh_platform_settings():
        global PLATFORM_SETTINGS
        try:
            res = supabase.from_("platform_settings").select("*").eq("id", "global").single().execute()
            if res.data:
                PLATFORM_SETTINGS = res.data
                print("[ENGINE] Configuración global de la plataforma cargada.")
        except Exception as e:
            print(f"[ENGINE ERROR] No se pudo cargar platform_settings: {str(e)}")

    refresh_platform_settings()
    print("[ENGINE] Todos los servicios inicializados correctamente.")
except Exception as e:
    print(f"[CRITICAL ERROR] Error inicializando servicios: {str(e)}")

@lru_cache(maxsize=100)
def fetch_merchant_ai_config(merchant_id: str):
    """
    Obtiene la configuración específica de IA del comercio.
    """
    try:
        res = supabase.from_("merchants").select("ai_provider, ai_model, ai_api_key").eq("id", merchant_id).single().execute()
        if res.data:
            return {
                "provider": res.data.get("ai_provider"),
                "model": res.data.get("ai_model"),
                "api_key": res.data.get("ai_api_key")
            }
        return {}
    except Exception as e:
        print(f"[ENGINE ERROR] Failed to fetch merchant config: {str(e)}")
        return {}

app = FastAPI(
    title="Woox AI Engine",
    description="Orquestador de agentes Multi-Tenant para Woox",
    version="1.0.0"
)

# Modelo para la petición que vendrá de Supabase
class MessageRequest(BaseModel):
    merchant_id: str
    conversation_id: str
    customer_id: str
    message_text: str
    platform: str # 'whatsapp', 'telegram', etc.

@app.get("/")
async def health_check():
    return {
        "status": "online",
        "engine": "Woox AI",
        "timestamp": time.time()
    }

@app.post("/process-message")
async def process_message(request: MessageRequest, x_auth_token: Optional[str] = Header(None)):
    # 1. Validar Token de seguridad (AUTH_SECRET en .env)
    expected_token = os.getenv("AUTH_SECRET")
    if expected_token and x_auth_token != expected_token:
        raise HTTPException(status_code=401, detail="No autorizado")

    try:
        print(f"[ENGINE] Recibido mensaje de {request.merchant_id} en {request.platform}")
        
        # 1. Clasificar Intención
        intent = router.classify(request.message_text)
        print(f"[ENGINE] Intención detectada: {intent}")
        
        context = ""
        system_prompt = "Eres un asistente experto de Woox. Responde basándote solo en el contexto proporcionado."
        
        # 2. Ejecutar Skill según Intención
        if intent == "CATALOG_QUERY":
            context = await catalog_skill.get_catalog(request.merchant_id)
            system_prompt = "Eres un vendedor amable de Woox. Usa el catálogo para recomendar productos y ayudar al cliente."
        elif intent == "KNOWLEDGE_QUERY":
            context = await rag_skill.search_context(request.merchant_id, request.message_text)
            system_prompt = "Eres un asistente informativo de Woox. Responde con precisión técnica basada en los manuales."
        elif intent == "GREETING":
            system_prompt = "Eres un anfitrión amable de Woox. Saluda cálidamente y menciona que puedes ayudar con el menú o preguntas."

        # 3. Obtener Configuración de IA del Comercio (Para el token propio)
        merchant_config = fetch_merchant_ai_config(request.merchant_id)
        
        # Merge con settings globales si faltan datos en el comercio
        final_config = {
            "provider": merchant_config.get("provider") or PLATFORM_SETTINGS.get("ai_provider") or "google_gemini",
            "api_key": merchant_config.get("api_key") or PLATFORM_SETTINGS.get("ai_api_key"),
            "model": merchant_config.get("model") or PLATFORM_SETTINGS.get("ai_model") or "gemini-1.5-flash"
        }

        # 4. Generar respuesta con el LLM inyectando el contexto real filtrado
        ai_response = await llm_service.generate_response(
            system_prompt=system_prompt,
            context=context,
            user_input=request.message_text,
            config=final_config
        )
        
        # 4. Post-Procesamiento (Skills Deterministas)
        # Buscar [ORDER_CONFIRMED: {...}]
        order_match = re.search(r"\[ORDER_CONFIRMED:\s*(\{.*?})\s*\]", ai_response, re.DOTALL)
        final_confirmation = ""
        
        if order_match:
            try:
                order_json = order_match.group(1).strip()
                # Limpiar texto de la IA quitando el comando técnico
                ai_response = re.sub(r"\[ORDER_CONFIRMED:\s*\{.*?\}\s*\]", "", ai_response, flags=re.DOTALL).strip()
                
                # Ejecutar Habilidad de Pedidos
                order_data = json.loads(order_json)
                final_confirmation = await order_skill.register_order(
                    request.merchant_id, 
                    request.customer_id, 
                    request.conversation_id, 
                    order_data
                )
            except Exception as e:
                print(f"[ENGINE ERROR] Order Post-Processing failed: {str(e)}")

        return {
            "success": True,
            "response": ai_response + final_confirmation,
            "intent": intent,
            "context_retrieved": True if context else False
        }
    except Exception as e:
        print(f"[ERROR] Engine Failure: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
