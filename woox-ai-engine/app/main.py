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
from contextlib import asynccontextmanager

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

# 3. APP LIFESPAN & INITIALIZATION
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
        
        rag_skill = RAGSkill()
        catalog_skill = CatalogSkill()
        order_skill = OrderSkill()
        router = IntentRouter()
        llm_service = LLMService()
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
        <tr>
            <td style="padding:10px; border-bottom:1px solid #f1f5f9;">{act['time']}</td>
            <td style="padding:10px; border-bottom:1px solid #f1f5f9; font-family:monospace;">{act['merchant']}</td>
            <td style="padding:10px; border-bottom:1px solid #f1f5f9;">{act['text']}</td>
            <td style="padding:10px; border-bottom:1px solid #f1f5f9;"><span style="font-size:10px; padding:2px 6px; background:#e0e7ff; color:#4338ca; border-radius:4px;">{act['intent']}</span></td>
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
                <div style="overflow-x:auto;"><table><thead><tr><th>Hora</th><th>Comercio</th><th>Mensaje</th><th>Intento</th><th>Respuesta</th><th>Status</th></tr></thead><tbody>{activity_rows or "<tr><td colspan='6' style='text-align:center; padding:20px;'>Sin actividad...</td></tr>"}</tbody></table></div>
            </div>
            <div class="card">
                <h3>🛠️ Logs del Sistema</h3>
                <div class="log-box">{logs_html}</div>
            </div>
        </div>
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
    expected_token = os.getenv("AUTH_SECRET")
    if expected_token and x_auth_token != expected_token:
        raise HTTPException(status_code=401, detail="No autorizado")

    current_intent = "UNKNOWN"
    try:
        if not supabase: raise Exception("Base de datos no conectada")
        STATS["total_messages"] += 1
        
        # 1. Config de IA y Prompt
        prompt_res = supabase.rpc("get_compiled_prompt", {"p_merchant_id": request.merchant_id}).execute()
        system_prompt = prompt_res.data or "Eres un asistente de ventas."
        
        m_res = supabase.table("merchants").select("ai_provider, ai_api_key, ai_model").eq("id", request.merchant_id).limit(1).execute()
        m_ai = m_res.data[0] if m_res.data else {}
        
        ai_config = {
            "provider": m_ai.get("ai_provider") or PLATFORM_SETTINGS.get("ai_provider") or "google_gemini",
            "api_key": m_ai.get("ai_api_key") or PLATFORM_SETTINGS.get("ai_api_key") or os.getenv("GOOGLE_API_KEY"),
            "model": m_ai.get("ai_model") or PLATFORM_SETTINGS.get("ai_model") or "gemini-1.5-flash"
        }

        # 2. Memoria (Historial)
        history_context = ""
        hist_res = supabase.table("messages").select("sender_type, content").eq("conversation_id", request.conversation_id).order("created_at", desc=True).limit(10).execute()
        if hist_res.data:
            messages = list(reversed(hist_res.data))
            history_context = "\n### HISTORIAL RECIENTE:\n" + "\n".join([f"{'Cliente' if m['sender_type']=='customer' else 'Tú'}: {m['content']}" for m in messages if m['content'] != request.message_text])

        # 3. Clasificación
        current_intent = router.classify(request.message_text)
        STATS["intents"][current_intent] = STATS["intents"].get(current_intent, 0) + 1
        
        # 4. Lógica de Contexto y Acciones
        context_extra = ""
        
        if current_intent == "ORDER_CONFIRMATION":
            add_log(f"🛒 Confirmación en proceso para {request.merchant_id}")
            order_data = await llm_service.extract_order_data(history_context + f"\nCliente: {request.message_text}", ai_config)
            
            if order_data and order_data.get("items"):
                if order_data.get("is_complete"):
                    add_log("📦 Pedido completo. Registrando...")
                    order_result = await order_skill.register_order(
                        request.merchant_id, 
                        request.customer_id, 
                        request.conversation_id, 
                        order_data
                    )
                    context_extra = f"\n### ACCIÓN REALIZADA: PEDIDO REGISTRADO ###\n{order_result}\nInstrucción: Confirma al cliente que su pedido procesado con éxito y menciónale su número de orden."
                else:
                    add_log("💬 Faltan datos del cliente.")
                    missing = []
                    if not order_data.get("customer_name"): missing.append("nombre completo")
                    if not order_data.get("address"): missing.append("dirección de entrega")
                    if not order_data.get("phone"): missing.append("teléfono")
                    
                    context_extra = f"\n### NOTA: PEDIDO NO CERRADO ###\nFaltan datos obligatorios: {', '.join(missing)}. \nInstrucción: Agradece la confirmación pero pide amablemente los datos que faltan para poder generar el pedido. NO inventes un número de orden."
            else:
                add_log("⚠️ Intento de confirmación sin carrito claro.")
                context_extra = "\n### NOTA ### El cliente quiere confirmar pero el historial no muestra qué productos quiere. Pídele que elija algo del menú primero."

        elif current_intent == "KNOWLEDGE_QUERY":
            context_extra = await rag_skill.search_context(request.merchant_id, request.message_text, config=ai_config)

        # 5. Generación Final (Evitar saludos repetidos)
        if history_context:
            system_prompt += "\nNOTA: Es una conversación en curso. NO saludes de nuevo ni digas '¡Hola!', ve directo a lo que pide el cliente de forma amable."

        full_context = (history_context + "\n" + context_extra).strip()
        ai_response = await llm_service.generate_response(system_prompt, full_context, request.message_text, ai_config)
        
        # Registro
        add_activity(request.merchant_id, request.message_text, current_intent, "✅", ai_response)
        return {"success": True, "response": ai_response}

    except Exception as e:
        STATS["total_errors"] += 1
        err_str = str(e)
        add_activity(request.merchant_id, request.message_text, current_intent, "❌", err_str, error=err_str)
        return {"success": False, "error": err_str}
