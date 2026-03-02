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
app = FastAPI(title="Woox AI Engine", version="1.4.0")

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
                    STATS["last_db_error"] = None
            except Exception as e:
                STATS["last_db_error"] = f"Settings: {str(e)}"
    except Exception as e:
        STATS["last_db_error"] = f"Boot: {str(e)}"

init_services()

# 3. ENDPOINTS DE INTERFAZ
@app.get("/", response_class=HTMLResponse)
async def dashboard():
    global supabase, PLATFORM_SETTINGS
    
    # Re-verificar conexión
    if not supabase:
        supabase = get_supabase()
    
    db_status = "✅ Conectado" if supabase else "❌ Desconectado"
    settings_status = "✅ Sincronizado" if PLATFORM_SETTINGS else "⚠️ Pendiente"
    
    cvars = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GOOGLE_API_KEY", "AUTH_SECRET"]
    env_debug = "".join([f"<li>{'✅' if os.environ.get(v) else '❌'} <b>{v}:</b> {len(os.environ.get(v, ''))} ch</li>" for v in cvars])

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
            .card {{ background: white; padding: 25px; border-radius: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); margin-bottom: 20px; }}
            .badge {{ padding: 4px 8px; border-radius: 5px; font-size: 11px; font-weight: bold; background: #e7f3ff; color: var(--primary); }}
            .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; }}
            .stat {{ background: #f8f9fa; padding: 15px; border-radius: 10px; border-left: 4px solid var(--primary); }}
            .stat label {{ display: block; font-size: 11px; color: #666; text-transform: uppercase; }}
            .stat value {{ font-size: 18px; font-weight: bold; color: var(--dark); }}
            input, select {{ width: 100%; padding: 10px; margin: 8px 0; border: 1px solid #ddd; border-radius: 8px; box-sizing: border-box; }}
            button {{ background: var(--primary); color: white; border: none; padding: 12px 20px; border-radius: 8px; cursor: pointer; font-weight: bold; width: 100%; }}
            button:hover {{ opacity: 0.9; }}
            .error {{ color: #d93025; background: #fff5f5; padding: 10px; border-radius: 8px; font-size: 13px; border: 1px solid #fed7d7; }}
            .debug {{ background: #1c1e21; color: #00ff00; padding: 15px; border-radius: 10px; font-family: monospace; font-size: 12px; }}
            h2 {{ color: var(--primary); margin-top: 0; }}
            .tab-btn {{ padding: 10px 20px; cursor: pointer; border: none; background: none; font-weight: bold; color: #666; }}
            .tab-btn.active {{ color: var(--primary); border-bottom: 2px solid var(--primary); }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="card">
                <h2>🚀 Woox AI Manager <span class="badge">v1.4.0</span></h2>
                <div class="grid">
                    <div class="stat"><label>Mensajes</label><value>{STATS['total_messages']}</value></div>
                    <div class="stat"><label>Errores</label><value style="color:{'#d93025' if STATS['total_errors'] > 0 else '#1e8e3e'}">{STATS['total_errors']}</value></div>
                    <div class="stat"><label>Database</label><value>{db_status}</value></div>
                    <div class="stat"><label>Config</label><value>{settings_status}</value></div>
                </div>
            </div>

            <div class="card">
                <h3>⚙️ Configuración del Motor</h3>
                <form action="/setup" method="post">
                    <label>Supabase URL</label>
                    <input type="text" name="supabase_url" value="{os.environ.get('SUPABASE_URL', '')}" placeholder="https://xxx.supabase.co">
                    
                    <label>Supabase Service Role Key</label>
                    <input type="password" name="supabase_key" value="{os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')}" placeholder="eyJhbGciOiJIUzI1Ni...">
                    
                    <label>Auth Secret (Tu clave de seguridad)</label>
                    <input type="text" name="auth_secret" value="{os.environ.get('AUTH_SECRET', '')}" placeholder="Escribe un secreto inventado">
                    
                    <button type="submit">Guardar y Reiniciar Conexión</button>
                </form>
                {f'<p class="error"><b>Error:</b> {STATS["last_db_error"]}</p>' if STATS["last_db_error"] else ""}
            </div>

            <div class="card debug">
                <strong>🛠️ Estado de Variables (Entorno):</strong>
                <ul style="margin: 10px 0; padding-left: 20px;">{env_debug}</ul>
                <p style="font-size: 10px; color: #888;">Nota: Los cambios manuales se aplicarán de inmediato a esta sesión.</p>
            </div>
        </div>
    </body>
    </html>
    """
    return HTMLResponse(content=html)

@app.post("/setup")
async def setup_engine(supabase_url: str = Form(...), supabase_key: str = Form(...), auth_secret: str = Form(...)):
    """Guarda la configuración en el entorno actual y re-inicializa."""
    os.environ["SUPABASE_URL"] = supabase_url.strip()
    os.environ["SUPABASE_SERVICE_ROLE_KEY"] = supabase_key.strip()
    os.environ["AUTH_SECRET"] = auth_secret.strip()
    
    # Re-inicializar
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
        if not supabase: raise Exception("Motor no conectado a base de datos")
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
        
        return {"success": True, "response": ai_response}
    except Exception as e:
        STATS["total_errors"] += 1
        print(f"[ERROR] {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
