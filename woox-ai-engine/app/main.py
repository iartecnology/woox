from fastapi import FastAPI, HTTPException, Header, Request, Form
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
from fastapi.responses import HTMLResponse, RedirectResponse

# 1. ESTADO GLOBAL
STATS = {
    "total_messages": 0,
    "total_errors": 0,
    "intents": {},
    "start_time": time.time(),
    "last_db_error": None,
    "connection_log": [] # Logs de la prueba de conexión
}

supabase = None
rag_skill = None
catalog_skill = None
order_skill = None
router = None
llm_service = None
PLATFORM_SETTINGS = {}

# 2. APP INITIALIZATION
app = FastAPI(title="Woox AI Engine", version="1.4.1")

def add_log(msg: str):
    """Añade un mensaje al log de conexión."""
    ts = datetime.now().strftime("%H:%M:%S")
    STATS["connection_log"].append(f"[{ts}] {msg}")
    if len(STATS["connection_log"]) > 10: STATS["connection_log"].pop(0)

def init_services():
    global supabase, rag_skill, catalog_skill, order_skill, router, llm_service, PLATFORM_SETTINGS
    add_log("Iniciando servicios...")
    try:
        supabase = get_supabase()
        if supabase:
            add_log("✅ Cliente Supabase creado correctamente.")
            try:
                res = supabase.from_("platform_settings").select("*").eq("id", "global").single().execute()
                if res.data:
                    PLATFORM_SETTINGS = res.data
                    add_log("✅ Configuraciones globales (Settings) cargadas.")
                    STATS["last_db_error"] = None
                else:
                    add_log("⚠️ No se encontraron configuraciones globales en la DB.")
            except Exception as e:
                add_log(f"❌ Error al consultar settings: {str(e)}")
                STATS["last_db_error"] = f"Settings: {str(e)}"
        else:
            add_log("❌ Error fatal: SUPABASE_URL o KEY no configurados.")

        rag_skill = RAGSkill()
        catalog_skill = CatalogSkill()
        order_skill = OrderSkill()
        router = IntentRouter()
        llm_service = LLMService()
        add_log("✅ Skills inicializados correctamente.")
    except Exception as e:
        add_log(f"❌ Fallo crítico de BOOT: {str(e)}")
        STATS["last_db_error"] = f"Boot: {str(e)}"

init_services()

# 3. INTERFAZ
@app.get("/", response_class=HTMLResponse)
async def dashboard():
    global supabase, PLATFORM_SETTINGS
    db_status = "✅ Conectado" if supabase else "❌ Desconectado"
    settings_status = "✅ Sincronizado" if PLATFORM_SETTINGS else "⚠️ Pendiente"
    
    cvars = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GOOGLE_API_KEY", "AUTH_SECRET"]
    env_debug = "".join([f"<li>{'✅' if os.environ.get(v) else '❌'} <b>{v}:</b> {len(os.environ.get(v, ''))} ch</li>" for v in cvars])
    logs_html = "<br>".join(STATS["connection_log"]) or "Esperando pruebas..."

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>Woox AI Admin</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            :root {{ --primary: #0084ff; --dark: #1c1e21; --bg: #f0f2f5; }}
            body {{ font-family: 'Segoe UI', Tahoma, sans-serif; background: var(--bg); margin: 0; padding: 20px; }}
            .container {{ max-width: 800px; margin: auto; }}
            .card {{ background: white; padding: 25px; border-radius: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); margin-bottom: 20px; }}
            .badge {{ padding: 4px 8px; border-radius: 5px; font-size: 11px; font-weight: bold; background: #e7f3ff; color: var(--primary); }}
            .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; }}
            .stat {{ background: #f8f9fa; padding: 15px; border-radius: 10px; border-left: 4px solid var(--primary); }}
            .stat label {{ display: block; font-size: 11px; color: #666; text-transform: uppercase; }}
            .stat value {{ font-size: 18px; font-weight: bold; color: var(--dark); }}
            .form-group {{ margin-bottom: 15px; }}
            input {{ width: 100%; padding: 12px; margin: 8px 0; border: 1px solid #ddd; border-radius: 8px; box-sizing: border-box; font-family: monospace; }}
            button {{ background: var(--primary); color: white; border: none; padding: 12px 20px; border-radius: 8px; cursor: pointer; font-weight: bold; width: 100%; transition: 0.2s; }}
            button:hover {{ opacity: 0.9; transform: translateY(-1px); }}
            .log-box {{ background: #1c1e21; color: #00ff00; padding: 15px; border-radius: 10px; font-family: 'Courier New', monospace; font-size: 11px; height: 120px; overflow-y: auto; margin-top: 10px; border: 2px solid #333; }}
            .debug {{ font-size: 12px; color: #666; list-style: none; padding: 0; margin: 10px 0; }}
            h2, h3 {{ color: var(--primary); margin: 0 0 15px 0; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="card">
                <h2>🚀 Woox AI Manager <span class="badge">v1.4.1</span></h2>
                <div class="grid">
                    <div class="stat"><label>Mensajes</label><value>{STATS['total_messages']}</value></div>
                    <div class="stat"><label>Errores</label><value style="color:{'#d93025' if STATS['total_errors'] > 0 else '#1e8e3e'}">{STATS['total_errors']}</value></div>
                    <div class="stat"><label>Database</label><value>{db_status}</value></div>
                    <div class="stat"><label>Config</label><value>{settings_status}</value></div>
                </div>
            </div>

            <div class="card">
                <h3>⚙️ Configuración y Prueba</h3>
                <form action="/setup" method="post">
                    <div class="form-group">
                        <label><b>Supabase URL:</b></label>
                        <input type="text" name="supabase_url" value="{os.environ.get('SUPABASE_URL', '')}">
                    </div>
                    <div class="form-group">
                        <label><b>Supabase Service Key:</b></label>
                        <input type="password" name="supabase_key" value="{os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')}">
                    </div>
                    <div class="form-group">
                        <label><b>Auth Secret:</b></label>
                        <input type="text" name="auth_secret" value="{os.environ.get('AUTH_SECRET', '')}">
                    </div>
                    <button type="submit">Actualizar y Probar Conexión</button>
                </form>
                
                <div style="margin-top:20px;">
                    <label><b>📶 Logs de Conexión en Tiempo Real:</b></label>
                    <div class="log-box">{logs_html}</div>
                </div>
            </div>

            <div class="card" style="background: #f8f9fa; border: 1px dashed #ccc;">
                <strong>🛠️ Detalle de Entorno (Docker):</strong>
                <ul class="debug">{env_debug}</ul>
                <p style="font-size: 10px; color: #888; margin:0;">Refresh automático cada 30 segundos.</p>
            </div>
        </div>
    </body>
    </html>
    """
    return HTMLResponse(content=html)

@app.post("/setup")
async def setup_engine(supabase_url: str = Form(...), supabase_key: str = Form(...), auth_secret: str = Form(...)):
    STATS["connection_log"] = []
    add_log("🔄 Recibida nueva configuración...")
    os.environ["SUPABASE_URL"] = supabase_url.strip()
    os.environ["SUPABASE_SERVICE_ROLE_KEY"] = supabase_key.strip()
    os.environ["AUTH_SECRET"] = auth_secret.strip()
    
    init_services()
    return RedirectResponse(url="/", status_code=303)

# --- BACKEND API ---
class MessageRequest(BaseModel):
    merchant_id: str
    conversation_id: str
    customer_id: str
    message_text: str
    platform: str

@app.post("/process-message")
async def process_message(request: MessageRequest, x_auth_token: Optional[str] = Header(None)):
    expected_token = os.getenv("AUTH_SECRET")
    if expected_token and x_auth_token != expected_token:
        raise HTTPException(status_code=401, detail="No autorizado")

    try:
        if not supabase: raise Exception("Base de datos no conectada")
        STATS["total_messages"] += 1
        intent = router.classify(request.message_text)
        STATS["intents"][intent] = STATS["intents"].get(intent, 0) + 1
        
        context = ""
        system_prompt = "Eres un asistente experto de Woox."
        
        if intent == "CATALOG_QUERY":
            context = await catalog_skill.get_catalog(request.merchant_id)
        elif intent == "KNOWLEDGE_QUERY":
            context = await rag_skill.search_context(request.merchant_id, request.message_text)

        merchant_res = supabase.from_("merchants").select("ai_provider, ai_model, ai_api_key").eq("id", request.merchant_id).single().execute()
        m_config = merchant_res.data if merchant_res.data else {}
        
        final_config = {
            "provider": m_config.get("ai_provider") or PLATFORM_SETTINGS.get("ai_provider") or "google_gemini",
            "api_key": m_config.get("ai_api_key") or PLATFORM_SETTINGS.get("ai_api_key"),
            "model": m_config.get("ai_model") or PLATFORM_SETTINGS.get("ai_model") or "gemini-1.5-flash"
        }

        ai_response = await llm_service.generate_response(system_prompt, context, request.message_text, final_config)
        return {"success": True, "response": ai_response}
    except Exception as e:
        STATS["total_errors"] += 1
        raise HTTPException(status_code=500, detail=str(e))
