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
app = FastAPI(title="Woox AI Engine", version="1.6.2")

def add_log(msg: str):
    ts = datetime.now().strftime("%H:%M:%S")
    STATS["connection_log"].append(f"[{ts}] {msg}")
    if len(STATS["connection_log"]) > 15: STATS["connection_log"].pop(0)

def add_activity(merchant: str, text: str, intent: str, status: str = "✅", response: str = "", error: str = None):
    ts = datetime.now().strftime("%H:%M:%S")
    display_res = response if status == "✅" else f"❌ ERROR: {error or response}"
    clean_res = display_res.replace("\n", " ").strip()
    
    entry = {
        "time": ts,
        "merchant": merchant[:8] + "..." if len(merchant) > 8 else merchant,
        "text": (text[:30] + "...") if len(text) > 30 else text,
        "intent": intent,
        "status": status,
        "response": (clean_res[:100] + "...") if len(clean_res) > 100 else clean_res
    }
    STATS["recent_activity"].insert(0, entry)
    if len(STATS["recent_activity"]) > 15: STATS["recent_activity"].pop()

def init_services():
    global supabase, rag_skill, catalog_skill, order_skill, router, llm_service, PLATFORM_SETTINGS
    add_log("⚙️ Iniciando servicios v1.6.2 (Safe Mode)")
    try:
        client, err, stats = get_supabase_detailed()
        if client:
            supabase = client
            add_log("✅ Supabase Conectado.")
            try:
                # Usamos limit(1) que es más seguro entre versiones de supabase-js/py
                res = supabase.table("platform_settings").select("*").eq("id", "global").limit(1).execute()
                if res.data and len(res.data) > 0:
                    PLATFORM_SETTINGS = res.data[0]
                    add_log("✅ Settings de Plataforma cargados.")
            except Exception as e:
                add_log(f"⚠️ Error cargando settings: {str(e)}")
        else:
            add_log(f"❌ Error DB: {err}")

        # Inicialización garantizada
        rag_skill = RAGSkill()
        catalog_skill = CatalogSkill()
        order_skill = OrderSkill()
        router = IntentRouter()
        llm_service = LLMService()
        add_log("✅ Motor de Servicios Listo.")
    except Exception as e:
        add_log(f"❌ Error Fatal en Boot: {str(e)}")

init_services()

# 4. DASHBOARD HTML
@app.get("/", response_class=HTMLResponse)
async def dashboard():
    global supabase, PLATFORM_SETTINGS
    db_status = "✅ Conectado" if supabase else "❌ Desconectado"
    
    logs_html = "<br>".join(STATS["connection_log"])
    activity_rows = ""
    for act in STATS["recent_activity"]:
        color = "#059669" if act["status"] == "✅" else "#dc2626"
        res_style = "color:#475569; font-style:italic;" if act["status"] == "✅" else "color:#dc2626; font-weight:bold;"
        activity_rows += f"""
        <tr>
            <td style="padding:10px; border-bottom:1px solid #f1f5f9;">{act['time']}</td>
            <td style="padding:10px; border-bottom:1px solid #f1f5f9; font-family:monospace; font-size:11px;">{act['merchant']}</td>
            <td style="padding:10px; border-bottom:1px solid #f1f5f9;">{act['text']}</td>
            <td style="padding:10px; border-bottom:1px solid #f1f5f9;"><span style="font-size:10px; padding:2px 6px; background:#e0e7ff; color:#4338ca; border-radius:4px;">{act['intent']}</span></td>
            <td style="padding:10px; border-bottom:1px solid #f1f5f9; {res_style}">{act['response']}</td>
            <td style="padding:10px; border-bottom:1px solid #f1f5f9; color:{color}; text-align:center;">{act['status']}</td>
        </tr>
        """
    if not activity_rows:
        activity_rows = "<tr><td colspan='6' style='text-align:center; padding:30px; color:#94a3b8;'>Sin actividad reciente...</td></tr>"

    html = f"""
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <title>Woox Monitor Pro v1.6.2</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            :root {{ --primary: #6366f1; --bg: #f8fafc; --text: #1e293b; }}
            body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: var(--bg); color: var(--text); padding: 20px; line-height: 1.5; }}
            .container {{ max-width: 1100px; margin: auto; }}
            .card {{ background: white; padding: 24px; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; margin-bottom: 24px; }}
            .header {{ display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }}
            .stats {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px; }}
            .stat-card {{ background: #f1f5f9; padding: 16px; border-radius: 12px; border-bottom: 3px solid var(--primary); }}
            .stat-card label {{ font-size: 11px; color: #64748b; font-weight: 800; text-transform: uppercase; display: block; }}
            .stat-card span {{ font-size: 20px; font-weight: 700; color: #0f172a; }}
            table {{ width: 100%; border-collapse: collapse; font-size: 13px; }}
            th {{ text-align: left; padding: 12px; background: #f8fafc; border-bottom: 2px solid #e2e8f0; color: #64748b; font-size: 11px; text-transform: uppercase; }}
            .log-box {{ background: #0f172a; color: #4ade80; padding: 16px; border-radius: 12px; font-family: 'Consolas', monospace; font-size: 12px; height: 120px; overflow-y: auto; }}
            .badge-live {{ background: #ef4444; color: white; padding: 4px 10px; border-radius: 20px; font-size: 10px; font-weight: bold; animation: pulse 2s infinite; }}
            @keyframes pulse {{ 0% {{ opacity: 1; }} 50% {{ opacity: 0.6; }} 100% {{ opacity: 1; }} }}
            input, select, textarea {{ padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; width: 100%; box-sizing: border-box; font-family: inherit; }}
            .btn {{ background: var(--primary); color: white; border: none; padding: 12px 24px; border-radius: 8px; font-weight: 700; cursor: pointer; }}
            .btn:hover {{ background: #4f46e5; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="card">
                <div class="header">
                    <h2 style="margin:0;">🚀 Woox AI Manager <small style="font-weight:normal; opacity:0.6;">v1.6.2</small></h2>
                    <span class="badge-live">MOTOR ACTIVO</span>
                </div>
                <div class="stats">
                    <div class="stat-card"><label>MSJS PROCESADOS</label><span>{STATS['total_messages']}</span></div>
                    <div class="stat-card"><label>ERRORES</label><span>{STATS['total_errors']}</span></div>
                    <div class="stat-card"><label>BASE DE DATOS</label><span>{db_status}</span></div>
                    <div class="stat-card"><label>ESTADO PLATAFORMA</label><span>{"✅ Sync" if PLATFORM_SETTINGS else "⚠️ Desync"}</span></div>
                </div>
            </div>

            <div class="card">
                <h3 style="margin-top:0;">📊 Auditoría de Flujo (Live)</h3>
                <div style="overflow-x:auto;">
                    <table>
                        <thead>
                            <tr>
                                <th>Hora</th>
                                <th>Comercio</th>
                                <th>Mensaje Cliente</th>
                                <th>Intento</th>
                                <th>Respuesta de la IA</th>
                                <th>Estado</th>
                            </tr>
                        </thead>
                        <tbody>{activity_rows}</tbody>
                    </table>
                </div>
            </div>

            <div class="card">
                <h3>🛠️ Consola de Configuración</h3>
                <form action="/setup" method="post">
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                        <div>
                            <label style="font-size:12px; font-weight:700;">SUPABASE URL</label>
                            <input type="text" name="url" value="{os.environ.get('SUPABASE_URL', '')}" placeholder="https://xyz.supabase.co">
                        </div>
                        <div>
                            <label style="font-size:12px; font-weight:700;">SERVICE ROLE KEY</label>
                            <input type="password" name="key" value="{os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')}" placeholder="eyJhbGciOiJIUzI1Ni...">
                        </div>
                    </div>
                    <div style="margin-bottom:20px;">
                        <label style="font-size:12px; font-weight:700;">AUTH SECRET (Motor Protection)</label>
                        <input type="text" name="sec" value="{os.environ.get('AUTH_SECRET', '')}" placeholder="Tu contraseña de seguridad">
                    </div>
                    <button type="submit" class="btn" style="width:100%;">Actualizar y Reiniciar Servicios</button>
                </form>
                <div style="margin-top:20px;">
                    <label style="font-size:12px; font-weight:700; display:block; margin-bottom:10px;">📶 Log del Sistema:</label>
                    <div class="log-box">{logs_html}</div>
                </div>
            </div>
        </div>
    </body>
    </html>
    """
    return HTMLResponse(content=html)

@app.post("/setup")
async def setup_engine(url: str = Form(...), key: str = Form(...), sec: str = Form(...)):
    STATS["connection_log"] = []
    add_log("🔄 Recibiendo configuración manual...")
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
        if not supabase: raise Exception("Motor de base de datos no inicializado")
        STATS["total_messages"] += 1
        
        # 1. Obtener el prompt compilado
        try:
            prompt_res = supabase.rpc("get_compiled_prompt", {"p_merchant_id": request.merchant_id}).execute()
            system_prompt = prompt_res.data
            
            if not system_prompt or "Error" in system_prompt:
                # Fallback seguro si el merchant_id no devuelve un prompt válido
                system_prompt = "Eres un asistente de ventas profesional. Saluda con entusiasmo y ofrece ayudar con los servicios del local."
                add_log(f"⚠️ Prompt vacío o error RPC para {request.merchant_id}. Usando genérico.")
        except Exception as e:
            add_log(f"❌ Fallo crítico RPC get_compiled_prompt: {str(e)}")
            system_prompt = "Eres un asistente de ventas profesional."

        # 2. Configuración de IA (Prioridad: Comercio > Plataforma)
        try:
            m_res = supabase.table("merchants").select("name, ai_provider, ai_api_key, ai_model").eq("id", request.merchant_id).limit(1).execute()
            if m_res.data and len(m_res.data) > 0:
                m_data = m_res.data[0]
                m_name = m_data.get("name", "Local")
                m_ai = m_data
            else:
                m_name = "Local"
                m_ai = {}
        except Exception as e:
            add_log(f"⚠️ Error cargando merchant info: {str(e)}")
            m_name = "Local"
            m_ai = {}

        # 3. Clasificación
        current_intent = router.classify(request.message_text)
        STATS["intents"][current_intent] = STATS["intents"].get(current_intent, 0) + 1
        
        # 4. Contexto Adicional (RAG)
        context_extra = ""
        if current_intent == "KNOWLEDGE_QUERY":
            try:
                context_extra = await rag_skill.search_context(request.merchant_id, request.message_text)
            except:
                add_log("⚠️ Fallo en RAG Skill")

        # 5. Merging de Configuración Final
        final_config = {
            "provider": m_ai.get("ai_provider") or PLATFORM_SETTINGS.get("ai_provider") or "google_gemini",
            "api_key": m_ai.get("ai_api_key") or PLATFORM_SETTINGS.get("ai_api_key") or os.getenv("GOOGLE_API_KEY"),
            "model": m_ai.get("ai_model") or PLATFORM_SETTINGS.get("ai_model") or "gemini-1.5-flash"
        }

        # 6. Generación
        ai_response = await llm_service.generate_response(system_prompt, context_extra, request.message_text, final_config)
        
        # Registro Exitoso
        add_activity(request.merchant_id, request.message_text, current_intent, "✅", ai_response)
        return {"success": True, "response": ai_response}

    except Exception as e:
        STATS["total_errors"] += 1
        error_msg = str(e)
        add_log(f"💀 Error procesando mensaje: {error_msg}")
        add_activity(request.merchant_id, request.message_text, current_intent, "❌", error_msg, error=error_msg)
        return {"success": False, "error": error_msg}
