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

# 1. MODELOS
class MessageRequest(BaseModel):
    merchant_id: str
    conversation_id: str
    customer_id: str
    message_text: str
    platform: str

# 2. ESTADO GLOBAL (MEJORADO PARA VERIFICACIÓN)
STATS = {
    "total_messages": 0,
    "total_errors": 0,
    "intents": {},
    "start_time": time.time(),
    "last_db_error": None,
    "connection_log": [],
    "recent_activity": []  # Nueva lista para auditoría en tiempo real
}

supabase = None
rag_skill = None
catalog_skill = None
order_skill = None
router = None
llm_service = None
PLATFORM_SETTINGS = {}

# 3. APP INITIALIZATION
app = FastAPI(title="Woox AI Engine", version="1.6.0")

def add_log(msg: str):
    ts = datetime.now().strftime("%H:%M:%S")
    STATS["connection_log"].append(f"[{ts}] {msg}")
    if len(STATS["connection_log"]) > 10: STATS["connection_log"].pop(0)

def add_activity(merchant: str, text: str, intent: str, status: str = "✅"):
    ts = datetime.now().strftime("%H:%M:%S")
    entry = {
        "time": ts,
        "merchant": merchant[:8] + "..." if len(merchant) > 8 else merchant,
        "text": (text[:40] + "...") if len(text) > 40 else text,
        "intent": intent,
        "status": status
    }
    STATS["recent_activity"].insert(0, entry)
    if len(STATS["recent_activity"]) > 15: STATS["recent_activity"].pop()

def init_services():
    global supabase, rag_skill, catalog_skill, order_skill, router, llm_service, PLATFORM_SETTINGS
    add_log("⚙️ Iniciando servicios v1.6.0...")
    try:
        client, err, stats = get_supabase_detailed()
        add_log(f"🔎 Audit Env: URL {stats.get('url_len',0)}ch | KEY {stats.get('key_len',0)}ch")
        
        if client:
            supabase = client
            add_log("✅ Supabase Conectado.")
            try:
                res = supabase.from_("platform_settings").select("*").eq("id", "global").single().execute()
                if res.data:
                    PLATFORM_SETTINGS = res.data
                    add_log("✅ Settings cargados correctamente.")
                    STATS["last_db_error"] = None
            except:
                add_log("⚠️ No se pudieron cargar Platform Settings.")
        else:
            add_log(f"❌ Error Supabase: {err}")
            STATS["last_db_error"] = err

        rag_skill = RAGSkill()
        catalog_skill = CatalogSkill()
        order_skill = OrderSkill()
        router = IntentRouter()
        llm_service = LLMService()
        add_log("✅ Servios del motor listos.")
    except Exception as e:
        add_log(f"❌ Error en Boot: {str(e)}")

init_services()

# 4. INTERFAZ WEB (MEJORADA CON TABLA DE ACTIVIDAD)
@app.get("/", response_class=HTMLResponse)
async def dashboard():
    global supabase, PLATFORM_SETTINGS
    db_status = "✅ Conectado" if supabase else "❌ Desconectado"
    settings_status = "✅ Sincronizado" if PLATFORM_SETTINGS else "⚠️ Pendiente"
    
    cvars = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GOOGLE_API_KEY", "AUTH_SECRET"]
    env_debug = "".join([f"<li>{'✅' if os.environ.get(v) else '❌'} <b>{v}:</b> {len(os.environ.get(v, ''))} ch</li>" for v in cvars])
    logs_html = "<br>".join(STATS["connection_log"])
    
    # Generar tabla de actividad reciente
    activity_rows = ""
    for act in STATS["recent_activity"]:
        color = "#059669" if act["status"] == "✅" else "#dc2626"
        activity_rows += f"""
        <tr>
            <td style="padding:8px; border-bottom:1px solid #eee;">{act['time']}</td>
            <td style="padding:8px; border-bottom:1px solid #eee;"><code>{act['merchant']}</code></td>
            <td style="padding:8px; border-bottom:1px solid #eee;">{act['text']}</td>
            <td style="padding:8px; border-bottom:1px solid #eee;"><span style="font-size:10px; padding:2px 6px; background:#f0f7ff; color:#0056b3; border-radius:4px;">{act['intent']}</span></td>
            <td style="padding:8px; border-bottom:1px solid #eee; color:{color}; font-weight:bold;">{act['status']}</td>
        </tr>
        """
    if not activity_rows:
        activity_rows = "<tr><td colspan='5' style='text-align:center; padding:20px; color:#999;'>Sin mensajes procesados aún.</td></tr>"

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>Woox Monitor PRO</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            :root {{ --p: #0084ff; --bg: #f5f7fa; }}
            body {{ font-family: 'Segoe UI', sans-serif; background: var(--bg); padding: 20px; color: #333; }}
            .card {{ background: white; padding: 25px; border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); margin-bottom: 20px; }}
            .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin: 15px 0; }}
            .stat {{ background: #fafafa; padding: 12px; border-radius: 8px; border-left: 4px solid var(--p); }}
            .stat label {{ display: block; font-size: 10px; color: #888; text-transform: uppercase; }}
            .stat v {{ font-size: 18px; font-weight: bold; }}
            input {{ width: 100%; padding: 12px; margin: 8px 0; border: 1px solid #ddd; border-radius: 8px; box-sizing: border-box; font-family: monospace; }}
            button {{ background: var(--p); color: white; border: none; padding: 14px; border-radius: 8px; cursor: pointer; font-weight: bold; width: 100%; }}
            .log {{ background: #1c1e21; color: #0f0; padding: 15px; border-radius: 10px; font-family: monospace; font-size: 11px; height: 100px; overflow-y: auto; border: 1px solid #333; }}
            table {{ width: 100%; border-collapse: collapse; font-size: 12px; text-align: left; }}
            th {{ background: #f8fafc; padding: 10px 8px; font-weight: bold; color: #64748b; text-transform: uppercase; font-size: 10px; }}
            h2, h3 {{ color: var(--p); margin: 0 0 10px 0; }}
            .badge-live {{ padding: 3px 8px; background: #ff4757; color: white; border-radius: 4px; font-size: 10px; animation: blink 1.5s infinite; }}
            @keyframes blink {{ 0% {{ opacity: 1; }} 50% {{ opacity: 0.5; }} 100% {{ opacity: 1; }} }}
        </style>
    </head>
    <body>
        <div class="container" style="max-width:900px; margin:auto;">
            <div class="card">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h2>🚀 Woox AI Manager <span style="font-size: 11px; background: #e7f3ff; font-weight:normal; border-radius: 10px; padding: 2px 8px;">v1.6.0</span></h2>
                    <span class="badge-live">LIVE MONITORING</span>
                </div>
                <div class="grid">
                    <div class="stat"><label>Mensajes</label><v>{STATS['total_messages']}</v></div>
                    <div class="stat"><label>Errores</label><v>{STATS['total_errors']}</v></div>
                    <div class="stat"><label>Database</label><v>{db_status}</v></div>
                    <div class="stat"><label>Settings</label><v>{settings_status}</v></div>
                </div>
            </div>

            <div class="card">
                <h3>🔍 Auditoría de Verificación (Mensajes de Comercios)</h3>
                <div style="overflow-x:auto;">
                    <table>
                        <thead>
                            <tr>
                                <th>Hora</th>
                                <th>Comercio</th>
                                <th>Mensaje</th>
                                <th>Intención</th>
                                <th>Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {activity_rows}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="card">
                <h3>⚙️ Configuración del Motor</h3>
                <form action="/setup" method="post">
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px;">
                        <div><label>SUPABASE_URL</label><input type="text" name="url" value="{os.environ.get('SUPABASE_URL', '')}"></div>
                        <div><label>SERVICE_KEY</label><input type="password" name="key" value="{os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')}"></div>
                    </div>
                    <label>AUTH_SECRET (Contraseña del Motor)</label><input type="text" name="sec" value="{os.environ.get('AUTH_SECRET', '')}">
                    <button type="submit">Actualizar y Reiniciar Servicios</button>
                    <div style="margin-top:15px;"><label>📶 Log de Conexión:</label><div class="log">{logs_html}</div></div>
                </form>
            </div>

            <div class="card" style="background:transparent; border:1px dashed #ccc; font-size:11px; color:#666;">
                <strong>🛠️ Diagnóstico del Contenedor:</strong>
                <ul style="margin:5px 0;">{env_debug}</ul>
            </div>
        </div>
    </body>
    </html>
    """
    return HTMLResponse(content=html)

@app.post("/setup")
async def setup_engine(url: str = Form(...), key: str = Form(...), sec: str = Form(...)):
    STATS["connection_log"] = []
    add_log("🔄 Configuración recibida...")
    os.environ["SUPABASE_URL"] = url.strip()
    os.environ["SUPABASE_SERVICE_ROLE_KEY"] = key.strip()
    os.environ["AUTH_SECRET"] = sec.strip()
    init_services()
    return RedirectResponse(url="/", status_code=303)

# 5. API ENDPOINTS
@app.post("/process-message")
async def process_message(request: MessageRequest, x_auth_token: Optional[str] = Header(None)):
    expected_token = os.getenv("AUTH_SECRET")
    if expected_token and x_auth_token != expected_token:
        raise HTTPException(status_code=401, detail="No autorizado")

    current_intent = "UNKNOWN"
    try:
        if not supabase: raise Exception("Base de datos no conectada")
        STATS["total_messages"] += 1
        
        # 1. Clasificación
        current_intent = router.classify(request.message_text)
        STATS["intents"][current_intent] = STATS["intents"].get(current_intent, 0) + 1
        
        # 2. Contexto
        context = ""
        if current_intent == "CATALOG_QUERY": context = await catalog_skill.get_catalog(request.merchant_id)
        elif current_intent == "KNOWLEDGE_QUERY": context = await rag_skill.search_context(request.merchant_id, request.message_text)

        # 3. LLM Gen
        ai_config = {
            "provider": PLATFORM_SETTINGS.get("ai_provider") or "google_gemini",
            "api_key": PLATFORM_SETTINGS.get("ai_api_key") or os.getenv("GOOGLE_API_KEY"),
            "model": PLATFORM_SETTINGS.get("ai_model") or "gemini-1.5-flash"
        }

        response = await llm_service.generate_response("Eres Woox AI", context, request.message_text, ai_config)
        
        # Auditoría Exitosa
        add_activity(request.merchant_id, request.message_text, current_intent, "✅")
        
        return {"success": True, "response": response}
    except Exception as e:
        STATS["total_errors"] += 1
        add_activity(request.merchant_id, request.message_text, current_intent, "❌")
        return {"success": False, "error": str(e)}
