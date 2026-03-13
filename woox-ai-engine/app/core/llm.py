import os
import google.generativeai as genai
from typing import List, Optional, Dict, Any
import httpx
import re
import json
import asyncio

class LLMService:
    def __init__(self):
        # We'll use a lazy loading pattern for genai to avoid issues with concurrent re-configs
        pass

    async def get_embedding(self, text: str, config: Optional[Dict[str, Any]] = None) -> List[float]:
        """
        Genera un embedding usando el motor de la PLATAFORMA (Master Embedding Key).
        Garantiza consistencia en toda la base de datos de vectores.
        """
        config = config or {}
        provider = config.get("embed_provider") or "google_gemini"
        api_key = config.get("embed_api_key") or config.get("ai_api_key")
        model = config.get("embed_model") or "text-embedding-004"

        if not api_key:
            # Fallback a env var si la DB está vacía temporalmente
            api_key = os.getenv("GOOGLE_API_KEY")

        try:
            if provider == "google_gemini":
                genai.configure(api_key=api_key)
                if not text or len(text.strip()) == 0: return [0.0] * 768
                
                target_model = f"models/{model}" if not model.startswith("models/") else model
                
                # Intentamos con varios modelos comunes si el principal falla
                models_to_try = [target_model, "models/embedding-001", "models/text-embedding-004"]
                
                last_err = None
                for m in models_to_try:
                    try:
                        result = genai.embed_content(
                            model=m,
                            content=text,
                            task_type="retrieval_query"
                        )
                        return result['embedding']
                    except Exception as e:
                        last_err = e
                        if "404" in str(e) or "not found" in str(e).lower():
                            continue
                        raise e
                raise last_err
            
            elif provider == "openai":
                async with httpx.AsyncClient() as client:
                    headers = {"Authorization": f"Bearer {api_key}"}
                    payload = {"input": text, "model": model}
                    res = await client.post("https://api.openai.com/v1/embeddings", headers=headers, json=payload)
                    if res.status_code == 200:
                        return res.json()['data'][0]['embedding']
            
            raise Exception(f"Proveedor de embedding '{provider}' no soportado.")
            
        except Exception as e:
            print(f"[LLM Error] Embedding failed: {str(e)}")
            raise e

    async def _safe_generate(self, model, prompt: str, safety_settings: List[Dict[str, str]], max_retries: int = 3) -> str:
        """Helper for retrying Gemini calls with exponential backoff on 429 errors."""
        for attempt in range(max_retries):
            try:
                response = model.generate_content(prompt, safety_settings=safety_settings)
                if not response.text:
                    raise Exception("Empty response from AI")
                return response.text
            except Exception as e:
                err_msg = str(e).lower()
                if "429" in err_msg or "quota" in err_msg or "resource_exhausted" in err_msg:
                    wait_time = (2 ** attempt) + (0.1 * attempt) # Exponential backoff: 1, 2, 4 seconds
                    print(f"[LLM Quota] Rate limited (429). Waiting {wait_time}s before retry {attempt+1}/{max_retries}")
                    await asyncio.sleep(wait_time)
                    continue
                raise e
        raise Exception("Max retries exceeded for AI quota")

    async def generate_multitask_response(self, system_prompt: str, context: str, user_input: str, history: str, config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Genera una respuesta, extrae datos de pedido y perfila al cliente en UN SOLO LLM CALL.
        Retorna: { "response": str, "order_data": dict|None, "profile_data": dict|None }
        """
        api_key = config.get("api_key")
        model_name = config.get("model", "gemini-1.5-flash")
        
        if not api_key:
            return {"response": "Error: Clave de IA no configurada.", "order_data": None, "profile_data": None}

        # Nudge para multifunción
        multitask_instruction = """
        IMPORTANTE: Al final de tu respuesta, DEBES incluir obligatoriamente dos bloques de datos en formato JSON encerrados en etiquetas especiales.
        
        [DATA]
        {
            "items": [{"name": "nombre", "qty": 1, "price": 10.0}],
            "total": 0.0,
            "customer_name": "nombre",
            "address": "dirección",
            "phone": "teléfono",
            "is_complete": bool
        }
        [/DATA]

        [PROFILE]
        {
            "sentiment": "happy" | "neutral" | "frustrated",
            "preferences": { "dietary": "...", "interests": "...", "notes": "..." },
            "tags": ["tag1", "tag2"]
        }
        [/PROFILE]
        
        Si no hay datos para extraer, deja los campos vacíos o null, pero envía siempre las etiquetas.
        """

        full_prompt = f"{system_prompt}\n{multitask_instruction}\n\nCONTEXTO:\n{context}\n\nHISTORIAL RECIENTE:\n{history}\n\nCLIENTE: {user_input}"

        try:
            # Seleccionar Proveedor
            if model_name.startswith("gemini") or config.get("provider") == "google_gemini":
                genai.configure(api_key=api_key)
                model = genai.GenerativeModel(model_name)
                
                safety = [
                    {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
                    {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
                    {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
                    {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
                ]
                
                raw_text = await self._safe_generate(model, full_prompt, safety)
            else:
                # Fallback simple a OpenAI logic (puedes mejorar este bloque luego)
                async with httpx.AsyncClient() as client:
                    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
                    payload = {
                        "model": model_name,
                        "messages": [{"role": "system", "content": full_prompt}]
                    }
                    res = await client.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload, timeout=30.0)
                    raw_text = res.json()['choices'][0]['message']['content'] if res.status_code == 200 else ""

            # Parsers de bloques
            response_text = raw_text
            order_data = None
            profile_data = None

            # 1. Extraer Data Pedido
            data_match = re.search(r'\[DATA\](.*?)\[/DATA\]', raw_text, re.DOTALL)
            if data_match:
                try:
                    order_data = json.loads(data_match.group(1).strip())
                    response_text = response_text.replace(data_match.group(0), "")
                except: pass

            # 2. Extraer Perfil
            profile_match = re.search(r'\[PROFILE\](.*?)\[/PROFILE\]', raw_text, re.DOTALL)
            if profile_match:
                try:
                    profile_data = json.loads(profile_match.group(1).strip())
                    response_text = response_text.replace(profile_match.group(0), "")
                except: pass

            # Estimación simple de tokens (aprox 4 caracteres por token)
            input_tokens = len(full_prompt) // 4
            output_tokens = len(raw_text) // 4

            return {
                "response": response_text.strip(),
                "order_data": order_data,
                "profile_data": profile_data,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "full_prompt": full_prompt # Enviamos el texto completo para auditoría
            }

        except Exception as e:
            print(f"[Multitask LLM Error] {str(e)}")
            return {"response": "Lo siento, tuve un problema técnico temporal con la IA. 😅", "order_data": None, "profile_data": None}

    async def generate_response(self, system_prompt: str, context: str, user_input: str, config: Dict[str, Any]) -> str:
        # Mantenemos por compatibilidad, pero lo ideal es usar multitask
        provider = config.get("provider", "google_gemini")
        api_key = config.get("api_key")
        model_name = config.get("model", "gemini-1.5-flash")
        if not api_key: return "Error: No API key."
        try:
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel(model_name)
            full_prompt = f"{system_prompt}\n\nCONTEXTO:\n{context}\n\nCLIENTE: {user_input}"
            return await self._safe_generate(model, full_prompt, safety_settings=[])
        except Exception as e: return str(e)

    async def extract_order_data(self, history: str, config: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        # Mantenemos por compatibilidad
        api_key = config.get("api_key")
        model_name = config.get("model", "gemini-1.5-flash")
        if not api_key: return None
        try:
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel(model_name)
            prompt = f"Analiza y responde SOLO JSON con los datos del pedido:\n{history}"
            raw = await self._safe_generate(model, prompt, safety_settings=[])
            match = re.search(r'\{.*\}', raw, re.DOTALL)
            return json.loads(match.group()) if match else None
        except: return None

    async def profile_customer(self, history: str, config: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        # Mantenemos por compatibilidad
        return None
