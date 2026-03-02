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
from datetime import datetime
from fastapi.responses import HTMLResponse

# Contadores para el monitor (en memoria)
STATS = {
    "total_messages": 0,
    "total_errors": 0,
    "intents": {},
    "start_time": time.time(),
    "last_message_at": None,
    "last_db_error": None
}

# Inicializar variables de estado globales para evitar NameErrors
supabase = None
PLATFORM_SETTINGS = {}
rag_skill = None
catalog_skill = None
order_skill = None
router = None
llm_service = None

# Inicializar servicios de forma única y segura
try:
    supabase = get_supabase()
    rag_skill = RAGSkill()
    catalog_skill = CatalogSkill()
    order_skill = OrderSkill()
    router = IntentRouter()
    llm_service = LLMService()
    
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

@app.get("/", response_class=HTMLResponse)
async def health_check():
    global supabase, PLATFORM_SETTINGS
    
    # Intentar reconectar si se perdió o no se inició
    if not supabase:
        try:
            client, err = get_supabase()
            if client:
                supabase = client
                STATS["last_db_error"] = None
            else:
                STATS["last_db_error"] = err
        except Exception as e:
            STATS["last_db_error"] = str(e)
    
    if supabase and not PLATFORM_SETTINGS:
        try:
            res = supabase.from_("platform_settings").select("*").eq("id", "global").single().execute()
            if res.data:
                PLATFORM_SETTINGS = res.data
                STATS["last_db_error"] = None
        except Exception as e:
            STATS["last_db_error"] = f"Error settings: {str(e)}"

    uptime = time.time() - STATS["start_time"]
    uptime_str = str(datetime.fromtimestamp(STATS["start_time"]))
    
    # Determinar estado de servicios
    db_status = "✅ Conectado" if supabase else "❌ Error"
    settings_status = "✅ Sincronizado" if PLATFORM_SETTINGS else "⚠️ Pendiente"

    # Preparar lista de intenciones
    intents_html = "".join([f"<li>{k}: {v}</li>" for k, v in STATS["intents"].items()])
    if not intents_html:
        intents_html = "<li>Esperando mensajes...</li>"

    # Depuración detallada de variables
    critical_vars = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GOOGLE_API_KEY", "AUTH_SECRET"]
    debug_info = []
    for v in critical_vars:
        val = os.environ.get(v, "")
        status = "✅" if val else "❌"
        debug_info.append(f"{status} {v}: {len(val)} caracteres")
    
    env_debug = "<br>".join(debug_info)

    html_content = f"""
    <html>
        <head>
            <title>Woox AI Monitor</title>
            <meta http-equiv="refresh" content="30">
            <style>
                body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f0f2f5; color: #1c1e21; margin: 0; padding: 20px; }}
                .container {{ max-width: 800px; margin: auto; background: white; padding: 30px; border-radius: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }}
                h1 {{ color: #0084ff; border-bottom: 2px solid #eee; padding-bottom: 10px; }}
                .status-grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px; }}
                .stat-card {{ background: #f8f9fa; padding: 15px; border-radius: 10px; border-left: 5px solid #0084ff; }}
                .stat-card h3 {{ margin: 0; font-size: 14px; text-transform: uppercase; color: #666; }}
                .stat-card p {{ margin: 10px 0 0; font-size: 24px; font-weight: bold; }}
                .badge {{ padding: 5px 10px; border-radius: 5px; font-size: 12px; font-weight: bold; }}
                .success {{ background: #e7f3ff; color: #0084ff; }}
                .debug-box {{ background: #1c1e21; color: #00ff00; padding: 15px; border-radius: 10px; margin-top: 20px; font-family: monospace; font-size: 12px; }}
                .footer {{ margin-top: 30px; font-size: 12px; color: #888; text-align: center; }}
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🚀 Woox AI Engine <span class="badge success">v1.2.0</span></h1>
                <p>Estado del sistema: <strong>ONLINE</strong></p>
                
                <div class="status-grid">
                    <div class="stat-card">
                        <h3>Mensajes Procesados</h3>
                        <p>{STATS["total_messages"]}</p>
                    </div>
                    <div class="stat-card">
                        <h3>Errores del Motor</h3>
                        <p style="color: {'#d93025' if STATS['total_errors'] > 0 else '#1e8e3e'}">{STATS["total_errors"]}</p>
                    </div>
                    <div class="stat-card">
                        <h3>Uptime</h3>
                        <p style="font-size: 14px;">Iniciado el: {uptime_str}</p>
                    </div>
                    <div class="stat-card">
                        <h3>Servicios Core</h3>
                        <p style="font-size: 14px;">DB: {db_status}<br>Settings: {settings_status}</p>
                        {f'<small style="color:#d93025; font-size:10px;">Err: {STATS["last_db_error"]}</small>' if STATS["last_db_error"] else ""}
                    </div>
                </div>

                <h2>📊 Intenciones Recientes</h2>
                <ul>
                    {intents_html}
                </ul>

                <div class="debug-box">
                    <strong>[Debug] Estado de Variables de Entorno:</strong><br>
                    {env_debug}
                </div>

                <div class="footer">
                    Woox Engine - Centralized Agent Orchestrator<br>
                    IP: {os.getenv("PORT", "8000")} | Timestamp: {datetime.now()}
                </div>
            </div>
        </body>
    </html>
    """
    return HTMLResponse(content=html_content)

@app.get("/api/health")
async def api_health():
    return {
        "status": "online",
        "stats": STATS,
        "platform_settings_loaded": True if PLATFORM_SETTINGS else False
    }

@app.post("/process-message")
async def process_message(request: MessageRequest, x_auth_token: Optional[str] = Header(None)):
    # 1. Validar Token de seguridad (AUTH_SECRET en .env)
    expected_token = os.getenv("AUTH_SECRET")
    if expected_token and x_auth_token != expected_token:
        raise HTTPException(status_code=401, detail="No autorizado")

    try:
        STATS["total_messages"] += 1
        STATS["last_message_at"] = time.time()
        print(f"[ENGINE] Recibido mensaje de {request.merchant_id} en {request.platform}")
        
        # 1. Clasificar Intención
        intent = router.classify(request.message_text)
        STATS["intents"][intent] = STATS["intents"].get(intent, 0) + 1
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
        STATS["total_errors"] += 1
        print(f"[ERROR] Engine Failure: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
