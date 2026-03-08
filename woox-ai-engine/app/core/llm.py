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
                # Intentar con el modelo configurado
                target_model = f"models/{model}" if not model.startswith("models/") else model
                try:
                    result = genai.embed_content(
                        model=target_model,
                        content=text,
                        task_type="retrieval_query"
                    )
                    return result['embedding']
                except Exception as e:
                    if "404" in str(e) or "not found" in str(e).lower():
                        # Fallback a un modelo más universal si el 004 falla
                        print(f"[LLM Warning] {target_model} not found, falling back to models/embedding-001")
                        result = genai.embed_content(
                            model="models/embedding-001",
                            content=text,
                            task_type="retrieval_query"
                        )
                        return result['embedding']
                    raise e
            
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

    async def generate_response(self, system_prompt: str, context: str, user_input: str, config: Dict[str, Any]) -> str:
        """
        Genera una respuesta. 
        - Si el comercio tiene API Key, usa esa (Paga el comercio).
        - Si no, usa la 'Master API Key (Chat)' de la plataforma (Pagas tú).
        """
        provider = config.get("provider", "google_gemini")
        api_key = config.get("api_key")
        model_name = config.get("model", "gemini-1.5-flash")

        if not api_key:
            return "Error: No hay una clave de IA configurada (comercio ni plataforma)."

        # Lógica de Reintentos
        max_retries = 2
        for attempt in range(max_retries + 1):
            try:
                if provider == "google_gemini" or model_name.startswith("gemini"):
                    genai.configure(api_key=api_key)
                    model = genai.GenerativeModel(model_name)
                    
                    full_prompt = f"{system_prompt}\n\nCONTEXTO RELEVANTE:\n{context}\n\nPREGUNTA DEL CLIENTE: {user_input}"
                    
                    # Generar con parámetros de seguridad más relajados para evitar falsos positivos
                    response = model.generate_content(
                        full_prompt,
                        safety_settings=[
                            {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
                            {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
                            {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
                            {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
                        ]
                    )
                    
                    if not response.text:
                        raise Exception("Respuesta vacía del modelo (posible filtro de seguridad)")
                        
                    return response.text

                elif provider == "openai" or model_name.startswith("gpt"):
                    async with httpx.AsyncClient() as client:
                        headers = {
                            "Authorization": f"Bearer {api_key}",
                            "Content-Type": "application/json"
                        }
                        payload = {
                            "model": model_name,
                            "messages": [
                                {"role": "system", "content": system_prompt},
                                {"role": "user", "content": f"Contexto:\n{context}\n\nPregunta: {user_input}"}
                            ]
                        }
                        res = await client.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload, timeout=30.0)
                        if res.status_code == 200:
                            data = res.json()
                            return data['choices'][0]['message']['content']
                        raise Exception(f"Error de OpenAI: {res.status_code} - {res.text}")

                return f"Proveedor '{provider}' no soportado."

            except Exception as e:
                # Si es el último intento, dejar que explote para que el monitor lo registre
                if attempt == max_retries:
                    err_msg = str(e)
                    if "FinishReason.SAFETY" in err_msg or "safety" in err_msg.lower():
                        return "Lo siento, la política de seguridad bloqueó esta respuesta. Intentemos hablar de otro tema relacionado con el catálogo. 🛡️"
                    raise e
                
                # Esperar un poco antes de reintentar (backoff simple)
                await asyncio.sleep(1 * (attempt + 1))
                print(f"[LLM Retry] Intento {attempt + 1} fallido: {str(e)}")

    async def extract_order_data(self, history: str, config: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Extrae datos de la orden desde el historial usando el LLM.
        Retorna un dict con: items, total, customer_name, address, phone.
        """
        api_key = config.get("api_key")
        model_name = config.get("model", "gemini-1.5-flash")
        
        if not api_key: return None

        extraction_prompt = f"""
        Analiza el historial de chat y extrae los datos del pedido en formato JSON.
        IMPORTANTE: Solo incluye valores si el cliente los ha proporcionado claramente. 
        Si no hay dirección o teléfono, deja el campo como null o string vacío.

        Esquema JSON:
        {{
            "items": [{{ "name": str, "qty": int, "price": float }}],
            "total": float,
            "customer_name": str,
            "address": str,
            "phone": str,
            "is_complete": bool  // true solo si tiene items, nombre, dirección y teléfono
        }}

        HISTORIAL:
        {history}

        JSON:
        """

        try:
            target_model = config.get("model", "gemini-1.5-flash")
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel(target_model)
            response = model.generate_content(extraction_prompt)
            
            raw_text = response.text
            json_match = re.search(r'\{.*\}', raw_text, re.DOTALL)
            if json_match:
                data = json.loads(json_match.group())
                # Validación extra de completitud
                required = ["customer_name", "address", "phone"]
                data["is_complete"] = all(data.get(f) and len(str(data.get(f))) > 3 for f in required) and len(data.get("items", [])) > 0
                return data
            return None
        except Exception as e:
            print(f"[LLM Extraction Error] {str(e)}")
            return None
    async def profile_customer(self, history: str, config: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Analiza el historial para extraer preferencias, sentimiento y perfil del cliente.
        """
        api_key = config.get("api_key")
        model_name = config.get("model", "gemini-1.5-flash")
        if not api_key: return None

        profile_prompt = f"""
        Analiza el historial de chat y extrae un perfil del cliente para el CRM.
        Busca: preferencias (sin cebolla, picante, etc), alergias, sentimiento predominante y etiquetas útiles.

        Responde SOLO el JSON:
        {{
            "sentiment": "happy" | "neutral" | "frustrated",
            "preferences": {{ "dietary": str, "interests": str, "notes": str }},
            "tags": [str]
        }}

        HISTORIAL:
        {history}

        JSON:
        """
        try:
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel(model_name)
            response = model.generate_content(profile_prompt)
            json_match = re.search(r'\{.*\}', response.text, re.DOTALL)
            return json.loads(json_match.group()) if json_match else None
        except: return None
