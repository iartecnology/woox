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

# 1. ESTADO GLOBAL
STATS = {
    "total_messages": 0,
    "total_errors": 0,
    "intents": {},
    "start_time": time.time(),
    "last_message_at": None,
    "last_db_error": None
}

supabase = None
rag_skill = None
catalog_skill = None
order_skill = None
router = None
llm_service = None
PLATFORM_SETTINGS = {}

# 2. APP INITIALIZATION
app = FastAPI(title="Woox AI Engine", version="1.3.1")

def init_services():
    global supabase, rag_skill, catalog_skill, order_skill, router, llm_service, PLATFORM_SETTINGS
    try:
        supabase = get_supabase()
        rag_skill = RAGSkill()
        catalog_skill = CatalogSkill()
        order_skill = OrderSkill()
        router = IntentRouter()
        llm_service = LLMService()

        if supabase:
            try:
                res = supabase.from_("platform_settings").select("*").eq("id", "global").single().execute()
                if res.data:
                    PLATFORM_SETTINGS = res.data
                    STATS["last_db_error"] = None # Limpiar error si todo salió bien
            except Exception as e:
                STATS["last_db_error"] = f"Settings: {str(e)}"
    except Exception as e:
        STATS["last_db_error"] = f"Boot: {str(e)}"

init_services()

# 3. MODELOS
class MessageRequest(BaseModel):
    merchant_id: str
    conversation_id: str
    customer_id: str
    message_text: str
    platform: str

# 4. ENDPOINTS
@app.get("/", response_class=HTMLResponse)
async def health_check():
    global supabase, PLATFORM_SETTINGS
    
    # RE-VERIFICACIÓN EN TIEMPO REAL
    if not supabase:
        supabase = get_supabase()
    
    if supabase:
        STATS["last_db_error"] = None # Si hay supabase, ya no hay error de llave
        if not PLATFORM_SETTINGS:
            try:
                res = supabase.from_("platform_settings").select("*").eq("id", "global").single().execute()
                if res.data:
                    PLATFORM_SETTINGS = res.data
            except Exception as e:
                STATS["last_db_error"] = f"Fetch Settings: {str(e)}"

    uptime_str = str(datetime.fromtimestamp(STATS["start_time"]))
    db_status = "✅ Conectado" if supabase else "❌ Error"
    settings_status = "✅ Sincronizado" if PLATFORM_SETTINGS else "⚠️ Pendiente"

    # Diagnóstico
    cvars = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GOOGLE_API_KEY", "AUTH_SECRET"]
    env_debug = " | ".join([f"{'✅' if os.environ.get(v) else '❌'} {v}: {len(os.environ.get(v, ''))}ch" for v in cvars])
    intents_list = "".join([f"<li>{k}: {v}</li>" for k, v in STATS["intents"].items()]) or "<li>Sin mensajes</li>"

    html = f"""
    <html>
        <head><title>Woox Monitor</title><meta http-equiv="refresh" content="30">
        <style>
            body {{ font-family: 'Segoe UI', sans-serif; background: #f0f2f5; padding: 20px; }}
            .card {{ background: white; padding: 30px; border-radius: 15px; max-width: 700px; margin: auto; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }}
            .grid {{ display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin: 20px 0; }}
            .stat {{ background: #f8f9fa; padding: 15px; border-radius: 10px; border-left: 5px solid #0084ff; }}
            .stat b {{ display: block; font-size: 12px; color: #666; text-transform: uppercase; }}
            .stat span {{ font-size: 20px; font-weight: bold; }}
            .err {{ background: #fff5f5; color: #d93025; padding: 10px; border-radius: 5px; font-size: 12px; border: 1px solid #feb2b2; }}
            .debug {{ background: #1c1e21; color: #00ff00; padding: 15px; border-radius: 10px; font-family: monospace; font-size: 11px; margin-top: 20px; }}
            h2 {{ color: #0084ff; margin-top: 0; }}
        </style>
        </head>
        <body>
            <div class="card">
                <h2>🚀 Woox AI Engine <span style="font-size: 14px; background: #e7f3ff; padding: 4px 8px; border-radius: 5px;">v1.3.1</span></h2>
                <div class="grid">
                    <div class="stat"><b>Mensajes</b><span>{STATS['total_messages']}</span></div>
                    <div class="stat"><b>Errores</b><span style="color: {'#d93025' if STATS['total_errors'] > 0 else '#1e8e3e'}">{STATS['total_errors']}</span></div>
                    <div class="stat"><b>Base de Datos</b><span>{db_status}</span></div>
                    <div class="stat"><b>Configuración</b><span>{settings_status}</span></div>
                </div>
                {f'<div class="err"><b>⚠️ Error Detectado:</b> {STATS["last_db_error"]}</div>' if STATS["last_db_error"] else ""}
                <p><small>Sistema iniciado el: {uptime_str}</small></p>
                <hr>
                <b>📊 Análisis de Intenciones:</b><ul>{intents_list}</ul>
                <div class="debug"><b>🛠️ Diagnóstico de Entorno (Docker):</b><br>{env_debug}</div>
            </div>
        </body>
    </html>
    """
    return HTMLResponse(content=html)

@app.get("/api/health")
async def api_health():
    return {"status": "online", "stats": STATS, "db": bool(supabase)}

@app.post("/process-message")
async def process_message(request: MessageRequest, x_auth_token: Optional[str] = Header(None)):
    expected_token = os.getenv("AUTH_SECRET")
    if expected_token and x_auth_token != expected_token:
        raise HTTPException(status_code=401, detail="No autorizado")

    try:
        STATS["total_messages"] += 1
        intent = router.classify(request.message_text)
        STATS["intents"][intent] = STATS["intents"].get(intent, 0) + 1
        
        context = ""
        system_prompt = "Eres un asistente experto de Woox."
        
        if intent == "CATALOG_QUERY":
            context = await catalog_skill.get_catalog(request.merchant_id)
        elif intent == "KNOWLEDGE_QUERY":
            context = await rag_skill.search_context(request.merchant_id, request.message_text)

        # Configuración IA
        merchant_res = supabase.from_("merchants").select("ai_provider, ai_model, ai_api_key").eq("id", request.merchant_id).single().execute()
        m_config = merchant_res.data if merchant_res.data else {}
        
        final_config = {
            "provider": m_config.get("ai_provider") or PLATFORM_SETTINGS.get("ai_provider") or "google_gemini",
            "api_key": m_config.get("ai_api_key") or PLATFORM_SETTINGS.get("ai_api_key"),
            "model": m_config.get("ai_model") or PLATFORM_SETTINGS.get("ai_model") or "gemini-1.5-flash"
        }

        ai_response = await llm_service.generate_response(system_prompt, context, request.message_text, final_config)
        
        order_match = re.search(r"\[ORDER_CONFIRMED:\s*(\{.*?})\s*\]", ai_response, re.DOTALL)
        if order_match:
            try:
                order_data = json.loads(order_match.group(1).strip())
                ai_response = re.sub(r"\[ORDER_CONFIRMED:.*?\]", "", ai_response, flags=re.DOTALL).strip()
                await order_skill.register_order(request.merchant_id, request.customer_id, request.conversation_id, order_data)
            except: pass

        return {"success": True, "response": ai_response}
    except Exception as e:
        STATS["total_errors"] += 1
        raise HTTPException(status_code=500, detail=str(e))
