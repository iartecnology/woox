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

# 2. ESTADO GLOBAL
STATS = {
    "total_messages": 0,
    "total_errors": 0,
    "intents": {},
    "start_time": time.time(),
    "last_db_error": None,
    "connection_log": [],
    "recent_activity": []
}

supabase = None
rag_skill = None
catalog_skill = None
order_skill = None
router = None
llm_service = None
PLATFORM_SETTINGS = {}

# 3. APP INITIALIZATION
app = FastAPI(title="Woox AI Engine", version="1.6.1")

def add_log(msg: str):
    ts = datetime.now().strftime("%H:%M:%S")
    STATS["connection_log"].append(f"[{ts}] {msg}")
    if len(STATS["connection_log"]) > 10: STATS["connection_log"].pop(0)

def add_activity(merchant: str, text: str, intent: str, status: str = "✅", response: str = ""):
    ts = datetime.now().strftime("%H:%M:%S")
    # Limpiamos el texto de la respuesta para el log (sin markdowns pesados)
    clean_res = response.replace("\n", " ").strip()
    entry = {
        "time": ts,
        "merchant": merchant[:8] + "..." if len(merchant) > 8 else merchant,
        "text": (text[:40] + "...") if len(text) > 40 else text,
        "intent": intent,
        "status": status,
        "response": (clean_res[:60] + "...") if len(clean_res) > 60 else clean_res
    }
    STATS["recent_activity"].insert(0, entry)
    if len(STATS["recent_activity"]) > 15: STATS["recent_activity"].pop()

def init_services():
    global supabase, rag_skill, catalog_skill, order_skill, router, llm_service, PLATFORM_SETTINGS
    add_log("⚙️ Iniciando servicios v1.6.1...")
    try:
        client, err, stats = get_supabase_detailed()
        if client:
            supabase = client
            add_log("✅ Supabase Conectado.")
            try:
                res = supabase.from_("platform_settings").select("*").eq("id", "global").maybe_single().execute()
                if res.data:
                    PLATFORM_SETTINGS = res.data
                    add_log("✅ Plataforma sincronizada.")
            except:
                add_log("⚠️ Error cargando plataforma.")
        else:
            add_log(f"❌ Error DB: {err}")

        rag_skill = RAGSkill()
        catalog_skill = CatalogSkill()
        order_skill = OrderSkill()
        router = IntentRouter()
        llm_service = LLMService()
        add_log("✅ Motor listo.")
    except Exception as e:
        add_log(f"❌ Error en Boot: {str(e)}")

init_services()

# 4. DASHBOARD
@app.get("/", response_class=HTMLResponse)
async def dashboard():
    global supabase, PLATFORM_SETTINGS
    db_status = "✅ Conectado" if supabase else "❌ Desconectado"
    
    logs_html = "<br>".join(STATS["connection_log"])
    activity_rows = ""
    for act in STATS["recent_activity"]:
        color = "#059669" if act["status"] == "✅" else "#dc2626"
        res_style = "color:#666; font-style:italic;" if act["status"] == "✅" else "color:#dc2626;"
        activity_rows += f"""
        <tr>
            <td style="padding:10px; border-bottom:1px solid #eee;">{act['time']}</td>
            <td style="padding:10px; border-bottom:1px solid #eee; font-family:monospace;">{act['merchant']}</td>
            <td style="padding:10px; border-bottom:1px solid #eee;">{act['text']}</td>
            <td style="padding:10px; border-bottom:1px solid #eee;"><span style="font-size:10px; padding:2px 6px; background:#e0f2fe; color:#0369a1; border-radius:4px;">{act['intent']}</span></td>
            <td style="padding:10px; border-bottom:1px solid #eee; {res_style}">{act['response']}</td>
            <td style="padding:10px; border-bottom:1px solid #eee; color:{color}; text-align:center;">{act['status']}</td>
        </tr>
        """
    if not activity_rows:
        activity_rows = "<tr><td colspan='6' style='text-align:center; padding:30px; color:#94a3b8;'>Esperando mensajes...</td></tr>"

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>Woox Monitor</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            :root {{ --p: #4f46e5; --bg: #f8fafc; }}
            body {{ font-family: 'Inter', sans-serif; background: var(--bg); padding: 20px; }}
            .card {{ background: white; padding: 25px; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); margin-bottom: 20px; border: 1px solid #e2e8f0; }}
            .stat-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; }}
            .stat-box {{ background: #f1f5f9; padding: 15px; border-radius: 12px; border-left: 4px solid var(--p); }}
            .stat-box label {{ display: block; font-size: 10px; color: #64748b; font-weight: bold; text-transform: uppercase; }}
            .stat-box span {{ font-size: 18px; font-weight: 800; color: #1e293b; }}
            table {{ width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 10px; }}
            th {{ text-align: left; padding: 12px 10px; background: #f8fafc; color: #64748b; border-bottom: 2px solid #e2e8f0; text-transform: uppercase; font-size: 10px; }}
            .log {{ background: #0f172a; color: #4ade80; padding: 15px; border-radius: 12px; font-family: 'Fira Code', monospace; font-size: 11px; height: 100px; overflow-y: auto; }}
        </style>
    </head>
    <body style="margin:0;">
        <div style="max-width:1000px; margin:auto;">
            <div class="card">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                    <h2 style="margin:0; color:#1e293b;">🚀 Woox AI Engine <span style="font-size:12px; font-weight:normal; background:#e0e7ff; color:#4338ca; padding:4px 10px; border-radius:20px;">v1.6.1</span></h2>
                    <span style="font-size:10px; font-weight:bold; color:#ef4444; border:1px solid #ef4444; padding:2px 8px; border-radius:4px;">LIVE</span>
                </div>
                <div class="stat-grid">
                    <div class="stat-box"><label>Mensajes</label><span>{STATS['total_messages']}</span></div>
                    <div class="stat-box"><label>Errores</label><span>{STATS['total_errors']}</span></div>
                    <div class="stat-box"><label>Supabase</label><span>{db_status}</span></div>
                </div>
            </div>

            <div class="card">
                <h3 style="margin-top:0;">📊 Auditoría de Mensajes (Input & Output)</h3>
                <div style="overflow-x:auto;">
                    <table>
                        <thead>
                            <tr>
                                <th>Hora</th>
                                <th>Comercio</th>
                                <th>Input</th>
                                <th>Intento</th>
                                <th>Respuesta IA</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>{activity_rows}</tbody>
                    </table>
                </div>
            </div>

            <div class="card">
                <h3>⚙️ Configuración del Servidor</h3>
                <form action="/setup" method="post">
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px; margin-bottom:15px;">
                        <div><label style="font-size:11px; font-weight:bold;">SUPABASE_URL</label><input type="text" name="url" value="{os.environ.get('SUPABASE_URL', '')}" style="width:100%; padding:10px; border-radius:8px; border:1px solid #cbd5e1;"></div>
                        <div><label style="font-size:11px; font-weight:bold;">SERVICE_KEY</label><input type="password" name="key" value="{os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')}" style="width:100%; padding:10px; border-radius:8px; border:1px solid #cbd5e1;"></div>
                    </div>
                    <label style="font-size:11px; font-weight:bold;">AUTH_SECRET</label><input type="text" name="sec" value="{os.environ.get('AUTH_SECRET', '')}" style="width:100%; padding:10px; border-radius:8px; border:1px solid #cbd5e1; margin-bottom:15px;">
                    <button type="submit" style="width:100%; background:#4f46e5; color:white; border:none; padding:12px; border-radius:8px; font-weight:bold; cursor:pointer;">Reiniciar y Sincronizar</button>
                </form>
                <div style="margin-top:20px;"><label style="font-size:11px; font-weight:bold; display:block; margin-bottom:8px;">📶 Log de Conexión:</label><div class="log">{logs_html}</div></div>
            </div>
        </div>
    </body>
    </html>
    """
    return HTMLResponse(content=html)

@app.post("/setup")
async def setup_engine(url: str = Form(...), key: str = Form(...), sec: str = Form(...)):
    STATS["connection_log"] = []
    add_log("🔄 Recibiendo nueva configuración...")
    os.environ["SUPABASE_URL"] = url.strip()
    os.environ["SUPABASE_SERVICE_ROLE_KEY"] = key.strip()
    os.environ["AUTH_SECRET"] = sec.strip()
    init_services()
    return RedirectResponse(url="/", status_code=303)

# 5. API PROCESSOR
@app.post("/process-message")
async def process_message(request: MessageRequest, x_auth_token: Optional[str] = Header(None)):
    expected_token = os.getenv("AUTH_SECRET")
    if expected_token and x_auth_token != expected_token:
        raise HTTPException(status_code=401, detail="No autorizado")

    current_intent = "UNKNOWN"
    try:
        if not supabase: raise Exception("Base de datos no conectada")
        STATS["total_messages"] += 1
        
        # 1. Obtener el prompt compilado del agente (RPC)
        # Esto incluye: Personalidad, Saludo, Reglas y Skills (Catalog/Context Blocks)
        try:
            prompt_res = supabase.rpc("get_compiled_prompt", {"p_merchant_id": request.merchant_id}).execute()
            system_prompt = prompt_res.data or "Eres un asistente de ventas de Woox."
        except:
            add_log(f"⚠️ Fallo RPC get_compiled_prompt para {request.merchant_id}")
            system_prompt = "Eres un asistente de ventas de Woox."

        # 2. Obtener config de IA específica del comercio
        try:
            m_res = supabase.from_("merchants").select("ai_provider, ai_api_key, ai_model").eq("id", request.merchant_id).maybe_single().execute()
            m_ai = m_res.data or {}
        except:
            m_ai = {}

        # 3. Clasificación de Intención
        current_intent = router.classify(request.message_text)
        STATS["intents"][current_intent] = STATS["intents"].get(current_intent, 0) + 1
        
        # 4. Contexto Extra (RAG) si es necesario
        # El catálogo estático ya viene en el system_prompt vÍa el RPC, 
        # pero para Knowledge Base completa usamos el skill de RAG (Vectores).
        context_extra = ""
        if current_intent == "KNOWLEDGE_QUERY":
            context_extra = await rag_skill.search_context(request.merchant_id, request.message_text)

        # 5. Merging de Configuración de IA (Comercio > Plataforma)
        ai_config = {
            "provider": m_ai.get("ai_provider") or PLATFORM_SETTINGS.get("ai_provider") or "google_gemini",
            "api_key": m_ai.get("ai_api_key") or PLATFORM_SETTINGS.get("ai_api_key") or os.getenv("GOOGLE_API_KEY"),
            "model": m_ai.get("ai_model") or PLATFORM_SETTINGS.get("ai_model") or "gemini-1.5-flash"
        }

        # 6. Generación de Respuesta
        ai_response = await llm_service.generate_response(system_prompt, context_extra, request.message_text, ai_config)
        
        # Auditoría en Monitor
        add_activity(request.merchant_id, request.message_text, current_intent, "✅", ai_response)
        
        return {"success": True, "response": ai_response}
    except Exception as e:
        STATS["total_errors"] += 1
        add_activity(request.merchant_id, request.message_text, current_intent, "❌", str(e))
        return {"success": False, "error": str(e)}
