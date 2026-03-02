from fastapi import FastAPI, HTTPException, Header, Request, Form
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from app.skills.rag import RAGSkill
from app.skills.catalog import CatalogSkill
from app.skills.orders import OrderSkill
from app.core.router import IntentRouter
from app.core.llm import LLMService
from app.db.supabase_client import get_supabase_detailed
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
    "connection_log": []
}

supabase = None
rag_skill = None
catalog_skill = None
order_skill = None
router = None
llm_service = None
PLATFORM_SETTINGS = {}

# 2. APP INITIALIZATION
app = FastAPI(title="Woox AI Engine", version="1.4.2")

def add_log(msg: str):
    ts = datetime.now().strftime("%H:%M:%S")
    STATS["connection_log"].append(f"[{ts}] {msg}")
    if len(STATS["connection_log"]) > 10: STATS["connection_log"].pop(0)

def init_services():
    global supabase, rag_skill, catalog_skill, order_skill, router, llm_service, PLATFORM_SETTINGS
    add_log("⚙️ Iniciando servicios v1.4.2...")
    try:
        # Llamada detallada
        client, err, stats = get_supabase_detailed()
        add_log(f"🔎 Audit: URL detectada ({stats['url_len']} ch) | KEY detectada ({stats['key_len']} ch)")
        
        if client:
            supabase = client
            add_log("✅ Cliente Supabase CONECTADO.")
            try:
                res = supabase.from_("platform_settings").select("*").eq("id", "global").single().execute()
                if res.data:
                    PLATFORM_SETTINGS = res.data
                    add_log("✅ Settings de plataforma cargados.")
                    STATS["last_db_error"] = None
                else:
                    add_log("⚠️ Settings no encontrados en 'platform_settings' (id: global).")
            except Exception as e_res:
                add_log(f"❌ Error al consultar settings en DB: {str(e_res)}")
                STATS["last_db_error"] = f"Settings Error: {str(e_res)}"
        else:
            add_log(f"❌ Error al inicializar: {err}")
            STATS["last_db_error"] = err

        # Inicializar Skills
        rag_skill = RAGSkill()
        catalog_skill = CatalogSkill()
        order_skill = OrderSkill()
        router = IntentRouter()
        llm_service = LLMService()
        add_log("✅ Skills cargados y listos.")
    except Exception as e:
        add_log(f"❌ Fallo crítico Boot: {str(e)}")
        STATS["last_db_error"] = str(e)

init_services()

# 3. INTERFAZ
@app.get("/", response_class=HTMLResponse)
async def dashboard():
    global supabase, PLATFORM_SETTINGS
    db_status = "✅ Conectado" if supabase else "❌ Desconectado"
    settings_status = "✅ Sincronizado" if PLATFORM_SETTINGS else "⚠️ Pendiente"
    
    cvars = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GOOGLE_API_KEY", "AUTH_SECRET"]
    env_debug = "".join([f"<li>{'✅' if os.environ.get(v) else '❌'} <b>{v}:</b> {len(os.environ.get(v, ''))} ch</li>" for v in cvars])
    logs_html = "<br>".join(STATS["connection_log"])

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>Woox AI Manager</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            :root {{ --primary: #0084ff; --bg: #f5f7fa; }}
            body {{ font-family: 'Segoe UI', sans-serif; background: var(--bg); margin: 0; padding: 20px; color: #1c1e21; }}
            .container {{ max-width: 800px; margin: auto; }}
            .card {{ background: white; padding: 25px; border-radius: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); margin-bottom: 20px; border: 1px solid #e1e4e8; }}
            .stat-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }}
            .stat {{ background: #fbfbfc; padding: 15px; border-radius: 10px; border-left: 4px solid var(--primary); }}
            .stat label {{ display: block; font-size: 10px; color: #777; text-transform: uppercase; letter-spacing: 0.5px; }}
            .stat span {{ font-size: 18px; font-weight: bold; }}
            .form-group {{ margin-bottom: 20px; }}
            label {{ font-size: 13px; font-weight: bold; color: #444; }}
            input {{ width: 100%; padding: 12px; margin-top: 5px; border: 1px solid #ccc; border-radius: 8px; font-family: monospace; font-size: 12px; }}
            button {{ background: var(--primary); color: white; border: none; padding: 14px; border-radius: 8px; cursor: pointer; font-weight: bold; width: 100%; transition: 0.2s; }}
            button:hover {{ background: #0073e6; }}
            .log-box {{ background: #1c1e21; color: #32ff32; padding: 15px; border-radius: 10px; font-family: monospace; font-size: 11px; height: 140px; overflow-y: scroll; margin-top: 10px; border: 1px solid #333; }}
            .debug {{ font-size: 11px; color: #888; list-style: none; padding: 0; }}
            h2, h3 {{ color: var(--primary); margin: 0 0 15px 0; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="card">
                <h2>🚀 Woox AI Manager <span style="font-size: 12px; background: #e7f3ff; padding: 4px 10px; border-radius: 20px;">v1.4.2</span></h2>
                <div class="stat-grid">
                    <div class="stat"><label>Mensajes</label><span>{STATS['total_messages']}</span></div>
                    <div class="stat"><label>Errores</label><span style="color: {'#d93025' if STATS['total_errors'] > 0 else '#1e8e3e'}">{STATS['total_errors']}</span></div>
                    <div class="stat"><label>Database</label><span>{db_status}</span></div>
                    <div class="stat"><label>Settings</label><span>{settings_status}</span></div>
                </div>
            </div>

            <div class="card">
                <h3>⚙️ Configuración y Diagnóstico</h3>
                <form action="/setup" method="post">
                    <div class="form-group">
                        <label>SUPABASE_URL</label>
                        <input type="text" name="supabase_url" value="{os.environ.get('SUPABASE_URL', '')}" placeholder="https://xxx.supabase.co">
                    </div>
                    <div class="form-group">
                        <label>SUPABASE_SERVICE_ROLE_KEY</label>
                        <input type="password" name="supabase_key" value="{os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')}" placeholder="El Token oculto de Supabase">
                    </div>
                    <div class="form-group">
                        <label>AUTH_SECRET (Clave de Seguridad)</label>
                        <input type="password" name="auth_secret" value="{os.environ.get('AUTH_SECRET', '')}" placeholder="Clave para Supabase Functions">
                    </div>
                    <button type="submit">Guardar y Ejecutar Diagnóstico</button>
                </form>
                
                <div style="margin-top:20px;">
                    <label>📶 Consola Técnica de Conexión:</label>
                    <div class="log-box">{logs_html}</div>
                </div>
            </div>

            <div class="card" style="background: #fafafa; border: 1px dashed #d1d1d1;">
                <strong>🛠️ Detalle del Sistema (Docker Env):</strong>
                <ul class="debug">{env_debug}</ul>
            </div>
        </div>
    </body>
    </html>
    """
    return HTMLResponse(content=html)

@app.post("/setup")
async def setup_engine(supabase_url: str = Form(...), supabase_key: str = Form(...), auth_secret: str = Form(...)):
    STATS["connection_log"] = [] # Nueva sesión de logs
    add_log("🔄 Recibida nueva configuración...")
    os.environ["SUPABASE_URL"] = supabase_url.strip()
    os.environ["SUPABASE_SERVICE_ROLE_KEY"] = supabase_key.strip()
    os.environ["AUTH_SECRET"] = auth_secret.strip()
    
    init_services()
    return RedirectResponse(url="/", status_code=303)

@app.post("/process-message")
async def process_message(request: MessageRequest, x_auth_token: Optional[str] = Header(None)):
    expected_token = os.getenv("AUTH_SECRET")
    if expected_token and x_auth_token != expected_token:
        raise HTTPException(status_code=401, detail="No autorizado")
    try:
        STATS["total_messages"] += 1
        intent = router.classify(request.message_text)
        STATS["intents"][intent] = STATS["intents"].get(intent, 0) + 1
        ai_response = await llm_service.generate_response("Eres Woox AI", "", request.message_text, PLATFORM_SETTINGS)
        return {"success": True, "response": ai_response}
    except Exception as e:
        STATS["total_errors"] += 1
        return {"success": False, "error": str(e)}
