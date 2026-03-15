from fastapi import FastAPI, HTTPException, Header, Request, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from app.skills.rag import RAGSkill
from app.skills.catalog import CatalogSkill
from app.skills.orders import OrderSkill
from app.skills.landing import LandingSkill
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
from contextlib import asynccontextmanager

# 1. MODELOS
class MessageRequest(BaseModel):
    merchant_id: str
    conversation_id: str
    customer_id: str
    message_text: str
    platform: str

class LandingRequest(BaseModel):
    merchant_id: str
    business_info: str
    logo_url: Optional[str] = None

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
landing_skill = None
PLATFORM_SETTINGS = {}

# 3. APP LIFESPAN & INITIALIZATION
def add_log(msg: str):
    ts = datetime.now().strftime("%H:%M:%S")
    STATS["connection_log"].append(f"[{ts}] {msg}")
    if len(STATS["connection_log"]) > 15: STATS["connection_log"].pop(0)

def add_activity(merchant: str, text: str, intent: str, status: str = "✅", response: str = "", error: str = None, tokens_in: int = 0, tokens_out: int = 0, full_prompt: str = ""):
    ts = datetime.now().strftime("%H:%M:%S")
    display_res = response if status == "✅" else f"❌ ERROR: {error or response}"
    clean_res = display_res.replace("\n", " ").strip()
    entry = {
        "id": int(time.time() * 1000),
        "time": ts,
        "merchant": merchant[:8] + "..." if len(merchant) > 8 else merchant,
        "text": (text[:30] + "...") if len(text) > 30 else text,
        "intent": intent,
        "status": status,
        "tokens_in": tokens_in,
        "tokens_out": tokens_out,
        "full_prompt": full_prompt,
        "response": (clean_res[:100] + "...") if len(clean_res) > 100 else clean_res
    }
    STATS["recent_activity"].insert(0, entry)
    if len(STATS["recent_activity"]) > 15: STATS["recent_activity"].pop()

def init_services():
    global supabase, rag_skill, catalog_skill, order_skill, router, llm_service, PLATFORM_SETTINGS
    add_log("⚙️ Iniciando servicios v1.6.5 (Lifespan enabled)")
    try:
        client, err, stats = get_supabase_detailed()
        if client:
            supabase = client
            add_log("✅ Supabase Conectado.")
            try:
                res = supabase.table("platform_settings").select("*").eq("id", "global").limit(1).execute()
                if res.data: PLATFORM_SETTINGS = res.data[0]
            except: pass
        
        llm_service = LLMService()
        rag_skill = RAGSkill()
        catalog_skill = CatalogSkill()
        order_skill = OrderSkill()
        router = IntentRouter()
        landing_skill = LandingSkill(llm_service)
        add_log("✅ Motor Listo.")
    except Exception as e:
        add_log(f"❌ Error en Boot: {str(e)}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Esto se ejecuta al arrancar el worker
    init_services()
    yield
    # Esto se ejecuta al cerrar

app = FastAPI(
    title="Woox AI Engine", 
    version="1.6.6",
    lifespan=lifespan
)

# 4. CORS CONFIGURATION
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 4. DASHBOARD HTML
@app.get("/", response_class=HTMLResponse)
async def dashboard():
    global supabase
    db_status = "✅ Conectado" if supabase else "❌ Desconectado"
    logs_html = "<br>".join(STATS["connection_log"])
    activity_rows = ""
    for act in STATS["recent_activity"]:
        color = "#059669" if act["status"] == "✅" else "#dc2626"
        activity_rows += f"""
        <tr id="row-{act['id']}">
            <td style="padding:10px; border-bottom:1px solid #f1f5f9;">{act['time']}</td>
            <td style="padding:10px; border-bottom:1px solid #f1f5f9; font-family:monospace;">{act['merchant']}</td>
            <td style="padding:10px; border-bottom:1px solid #f1f5f9;">{act['text']}</td>
            <td style="padding:10px; border-bottom:1px solid #f1f5f9;"><span style="font-size:10px; padding:2px 6px; background:#e0e7ff; color:#4338ca; border-radius:4px;">{act['intent']}</span></td>
            <td style="padding:10px; border-bottom:1px solid #f1f5f9; text-align:center;">
                <small>{act.get('tokens_in', 0)} / {act.get('tokens_out', 0)}</small><br>
                <button onclick='showPrompt({json.dumps(act.get("full_prompt", ""))})' style="font-size:9px; border:none; background:var(--p); color:white; padding:2px 5px; border-radius:3px; cursor:pointer; margin-top:2px;">Ver Prompt</button>
            </td>
            <td style="padding:10px; border-bottom:1px solid #f1f5f9; color:#475569;">{act['response']}</td>
            <td style="padding:10px; border-bottom:1px solid #f1f5f9; color:{color}; text-align:center;">{act['status']}</td>
        </tr>
        """
    
    html = f"""
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <title>Woox Monitor Pro v1.6.6</title>
        <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            :root {{ --p: #4f46e5; --bg: #f8fafc; }}
            body {{ font-family: 'Segoe UI', sans-serif; background: var(--bg); padding: 20px; }}
            .card {{ background: white; padding: 24px; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); margin-bottom: 24px; border: 1px solid #e2e8f0; }}
            .stats {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px; }}
            .stat-card {{ background: #f1f5f9; padding: 16px; border-radius: 12px; border-bottom: 3px solid var(--p); }}
            table {{ width: 100%; border-collapse: collapse; font-size: 13px; }}
            th {{ text-align: left; padding: 12px; background: #f8fafc; border-bottom: 2px solid #e2e8f0; font-size: 11px; text-transform: uppercase; }}
            .log-box {{ background: #0f172a; color: #4ade80; padding: 16px; border-radius: 12px; font-family: monospace; font-size: 12px; height: 100px; overflow-y: auto; }}
        </style>
    </head>
    <body>
        <div style="max-width:1100px; margin:auto;">
            <div class="card">
                <h2 style="margin:0;">🚀 Woox AI Manager <small style="opacity:0.6;">v1.6.6</small> <span style="background:#ef4444; color:white; font-size:10px; padding:2px 8px; border-radius:10px; margin-left:10px;">LIFESPAN ACTIVE</span></h2>
                <div class="stats" style="margin-top:20px;">
                    <div class="stat-card"><label style="font-size:10px; color:#64748b; font-weight:800;">TOTAL MSJS</label><br><span>{STATS['total_messages']}</span></div>
                    <div class="stat-card"><label style="font-size:10px; color:#64748b; font-weight:800;">ERRORES</label><br><span>{STATS['total_errors']}</span></div>
                    <div class="stat-card"><label style="font-size:10px; color:#64748b; font-weight:800;">DB STATUS</label><br><span>{db_status}</span></div>
                </div>
            </div>
            <div class="card">
                <h3 style="margin-top:0;">📊 Auditoría de Flujo</h3>
                <div style="overflow-x:auto;"><table><thead><tr><th>Hora</th><th>Comercio</th><th>Mensaje</th><th>Intento</th><th>Tokens (In/Out)</th><th>Respuesta</th><th>Status</th></tr></thead><tbody>{activity_rows or "<tr><td colspan='7' style='text-align:center; padding:20px;'>Sin actividad...</td></tr>"}</tbody></table></div>
            </div>
            <div class="card">
                <h3>🛠️ Logs del Sistema</h3>
                <div class="log-box">{logs_html}</div>
            </div>
        </div>

        <div id="promptModal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); z-index:1000; padding:50px;">
            <div style="background:white; max-width:900px; margin:auto; padding:30px; border-radius:15px; height:80vh; display:flex; flex-direction:column;">
                <h3 style="margin-top:0;">📄 Prompt Enviado a la IA</h3>
                <textarea id="promptContent" readonly style="flex:1; width:100%; padding:15px; font-family:monospace; font-size:12px; border:1px solid #ddd; background:#f9f9f9; resize:none;"></textarea>
                <button onclick="document.getElementById('promptModal').style.display='none'" style="margin-top:15px; padding:10px; background:#ef4444; color:white; border:none; border-radius:8px; cursor:pointer;">Cerrar</button>
            </div>
        </div>

        <script>
            function showPrompt(text) {{
                document.getElementById('promptContent').value = text;
                document.getElementById('promptModal').style.display = 'block';
            }}
        </script>
    </body>
    </html>
    """
    return HTMLResponse(content=html)

@app.post("/setup")
async def setup_engine(url: str = Form(...), key: str = Form(...), sec: str = Form(...)):
    os.environ["SUPABASE_URL"] = url.strip()
    os.environ["SUPABASE_SERVICE_ROLE_KEY"] = key.strip()
    os.environ["AUTH_SECRET"] = sec.strip()
    init_services()
    return RedirectResponse(url="/", status_code=303)

# 5. API PROCESSOR
@app.post("/process-message")
async def process_message(request: MessageRequest, x_auth_token: Optional[str] = Header(None)):
    """
    Endpoint principal para procesar mensajes de cualquier plataforma.
    """
    if not supabase:
        print("[CRITICAL] Supabase no está inicializado. Verifica tus variables de entorno.")
        return {"success": False, "error": "Engine misconfigured: Supabase not connected"}
        
    expected_token = os.getenv("AUTH_SECRET")
    if expected_token and x_auth_token != expected_token:
        raise HTTPException(status_code=401, detail="No autorizado")

    current_intent = "UNKNOWN"
    try:
        STATS["total_messages"] += 1
        
        # 1. Refrescar configuracion Global (para no hacer restart)
        try:
            glob_res = supabase.table("platform_settings").select("*").eq("id", "global").limit(1).execute()
            if glob_res.data:
                PLATFORM_SETTINGS.update(glob_res.data[0])
        except: pass

        # 2. Config de IA y Prompt
        prompt_res = supabase.rpc("get_compiled_prompt", {"p_merchant_id": request.merchant_id}).execute()
        system_prompt = prompt_res.data or "Eres un asistente de ventas."
        
        m_res = supabase.table("merchants").select("ai_provider, ai_api_key, ai_model").eq("id", request.merchant_id).limit(1).execute()
        m_ai = m_res.data[0] if m_res.data else {}
        
        ai_config = {
            "provider": m_ai.get("ai_provider") or PLATFORM_SETTINGS.get("ai_provider") or "google_gemini",
            "api_key": m_ai.get("ai_api_key") or PLATFORM_SETTINGS.get("ai_api_key") or os.getenv("GOOGLE_API_KEY"),
            "model": m_ai.get("ai_model") or PLATFORM_SETTINGS.get("ai_model") or "gemini-1.5-flash",
            "lmstudio_base_url": PLATFORM_SETTINGS.get("lmstudio_base_url"),
            "ollama_base_url": PLATFORM_SETTINGS.get("ollama_base_url")
        }

        # Override de Pruebas AI Local (Global)
        if PLATFORM_SETTINGS.get("local_ai_enabled") is True:
            ai_config["provider"] = "lmstudio"
            ai_config["model"] = PLATFORM_SETTINGS.get("local_ai_model") or "qwen/qwen3.5-9b"
            ai_config["api_key"] = "local-key"
            ai_config["lmstudio_base_url"] = PLATFORM_SETTINGS.get("local_ai_url") or "http://10.20.30.152:1234"

        # 2. Memoria (Historial) - Reducimos a 4 para ahorrar tokens
        history_context = ""
        hist_res = supabase.table("messages").select("sender_type, content").eq("conversation_id", request.conversation_id).order("created_at", desc=True).limit(4).execute()
        if hist_res.data:
            messages = list(reversed(hist_res.data))
            history_context = "\n### HISTORIAL RECIENTE:\n" + "\n".join([f"{'Cliente' if m['sender_type']=='customer' else 'Tú'}: {m['content']}" for m in messages if m['content'] != request.message_text])

        # 3. Clasificación e Intento
        current_intent = router.classify(request.message_text)
        STATS["intents"][current_intent] = STATS["intents"].get(current_intent, 0) + 1
        
        # 4. Procesamiento Inteligente Multitarea (UN SOLO LLM CALL)
        context_extra = ""
        if current_intent == "KNOWLEDGE_QUERY":
            context_extra = await rag_skill.search_context(request.merchant_id, request.message_text, config=ai_config)

        # Preparamos instrucciones especiales
        if history_context:
            system_prompt += "\nNOTA: Conversación en curso. Sé breve y ve al grano."

        # Llamada Multitarea
        llm_result = await llm_service.generate_multitask_response(
            system_prompt, 
            context_extra, 
            request.message_text, 
            history_context, 
            ai_config
        )

        ai_response = llm_result.get("response", "")
        order_data = llm_result.get("order_data")
        profile_data = llm_result.get("profile_data")

        # 5. Lógica Post-Procesamiento (Skills y CRM)
        if order_data and order_data.get("items"):
            if current_intent == "ORDER_CONFIRMATION" and order_data.get("is_complete"):
                add_log("📦 Pedido confirmado via Multitask. Registrando...")
                reg_res = await order_skill.register_order(
                    request.merchant_id, request.customer_id, request.conversation_id, order_data
                )
                ai_response += f"\n\n{reg_res}"
            
            suggestions = await order_skill.get_upsell_recommendations(request.merchant_id, order_data["items"])
            if suggestions: ai_response += suggestions

            try:
                supabase.table("conversations").update({
                    "typing_data": order_data,
                    "updated_at": datetime.now().isoformat()
                }).eq("id", request.conversation_id).execute()
            except: pass

        # 6. Perfilamiento CRM (Solo si hay datos nuevos)
        if profile_data and len(request.message_text) > 15:
            try:
                supabase.table("customers").update({
                    "preferences": profile_data.get("preferences", {}),
                    "tags": profile_data.get("tags", []),
                    "sentiment": profile_data.get("sentiment", "neutral"),
                    "updated_at": datetime.now().isoformat()
                }).eq("id", request.customer_id).execute()
            except: pass

        if order_data and order_data.get("items") and not order_data.get("is_complete"):
            if "[SHOW_SUMMARY]" not in ai_response:
                ai_response += "\n[SHOW_SUMMARY]"

        add_activity(
            request.merchant_id, 
            request.message_text, 
            current_intent, 
            "✅", 
            ai_response, 
            tokens_in=llm_result.get("input_tokens", 0), 
            tokens_out=llm_result.get("output_tokens", 0),
            full_prompt=llm_result.get("full_prompt", "")
        )
        return {"success": True, "response": ai_response}

    except Exception as e:
        STATS["total_errors"] += 1
        err_str = str(e)
        add_activity(request.merchant_id, request.message_text, current_intent, "❌", err_str, error=err_str)
        return {"success": False, "error": err_str}

@app.post("/landing/generate")
async def generate_landing(request: LandingRequest, x_auth_token: Optional[str] = Header(None)):
    expected_token = os.getenv("AUTH_SECRET")
    if expected_token and x_auth_token != expected_token:
        raise HTTPException(status_code=401, detail="No autorizado")

    try:
        # 1. Config de IA del Merchant
        m_res = supabase.table("merchants").select("ai_provider, ai_api_key, ai_model").eq("id", request.merchant_id).limit(1).execute()
        m_ai = m_res.data[0] if m_res.data else {}
        
        ai_config = {
            "provider": m_ai.get("ai_provider") or PLATFORM_SETTINGS.get("ai_provider") or "google_gemini",
            "api_key": m_ai.get("ai_api_key") or PLATFORM_SETTINGS.get("ai_api_key") or os.getenv("GOOGLE_API_KEY"),
            "model": m_ai.get("ai_model") or PLATFORM_SETTINGS.get("ai_model") or "gemini-1.5-flash",
            "lmstudio_base_url": PLATFORM_SETTINGS.get("lmstudio_base_url"),
            "ollama_base_url": PLATFORM_SETTINGS.get("ollama_base_url")
        }

        # Override de Pruebas AI Local (Global)
        if PLATFORM_SETTINGS.get("local_ai_enabled") is True:
            ai_config["provider"] = "lmstudio"
            ai_config["model"] = PLATFORM_SETTINGS.get("local_ai_model") or "qwen/qwen3.5-9b"
            ai_config["api_key"] = "local-key"
            ai_config["lmstudio_base_url"] = PLATFORM_SETTINGS.get("local_ai_url") or "http://10.20.30.152:1234"

        # 2. Generar Blueprint
        blueprint = await landing_skill.generate_blueprint(request.business_info, ai_config)
        
        add_activity(request.merchant_id, "Generación de Landing (IA)", "LANDING_GEN", "✅", f"Página generada para {blueprint.get('brand_name')}")
        
        return {"success": True, "data": blueprint}

    except Exception as e:
        err_str = f"Error generando landing: {str(e)}"
        add_activity(request.merchant_id, "Generación de Landing", "LANDING_GEN", "❌", err_str, error=err_str)
        return {"success": False, "error": err_str}
