import os
import google.generativeai as genai
from typing import List, Optional, Dict, Any
import httpx

class LLMService:
    def __init__(self):
        # We'll use a lazy loading pattern for genai to avoid issues with concurrent re-configs
        pass

    async def get_embedding(self, text: str) -> List[float]:
        """
        Genera un embedding usando el motor de la PLATAFORMA (Master Embedding Key).
        Garantiza consistencia en toda la base de datos de vectores.
        """
        from app.main import PLATFORM_SETTINGS
        
        provider = PLATFORM_SETTINGS.get("embed_provider") or "google_gemini"
        api_key = PLATFORM_SETTINGS.get("embed_api_key") or PLATFORM_SETTINGS.get("ai_api_key")
        model = PLATFORM_SETTINGS.get("embed_model") or "text-embedding-004"

        if not api_key:
            # Fallback a env var si la DB está vacía temporalmente
            api_key = os.getenv("GOOGLE_API_KEY")

        try:
            if provider == "google_gemini":
                genai.configure(api_key=api_key)
                result = genai.embed_content(
                    model=f"models/{model}" if not model.startswith("models/") else model,
                    content=text,
                    task_type="retrieval_query"
                )
                return result['embedding']
            
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

        try:
            if provider == "google_gemini" or model_name.startswith("gemini"):
                genai.configure(api_key=api_key)
                model = genai.GenerativeModel(model_name)
                
                full_prompt = f"{system_prompt}\n\nCONTEXTO RELEVANTE:\n{context}\n\nPREGUNTA DEL CLIENTE: {user_input}"
                response = model.generate_content(full_prompt)
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
                    return f"Error de OpenAI: {res.status_code}"

            return f"Proveedor '{provider}' no soportado."

        except Exception as e:
            print(f"[LLM Error] Generation failed: {str(e)}")
            return "Lo siento, tuve un problema procesando tu respuesta con el proveedor de IA."
