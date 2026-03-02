import os
import google.generativeai as genai
from typing import List, Optional, Dict, Any
import httpx

class LLMService:
    def __init__(self):
        # La API Key global se usa como fallback para el sistema o para Embeddings
        self.global_api_key = os.getenv("GOOGLE_API_KEY")
        if self.global_api_key:
            genai.configure(api_key=self.global_api_key)

    async def get_embedding(self, text: str) -> List[float]:
        """
        Genera un embedding usando el motor global de la plataforma para asegurar
        que todos los vectores en Supabase sean compatibles semánticamente.
        """
        try:
            if not self.global_api_key:
                raise Exception("GOOGLE_API_KEY global no configurada para Embeddings")
            
            result = genai.embed_content(
                model="models/text-embedding-004",
                content=text,
                task_type="retrieval_query"
            )
            return result['embedding']
        except Exception as e:
            print(f"[LLM Error] Embedding failed: {str(e)}")
            raise e

    async def generate_response(self, system_prompt: str, context: str, user_input: str, config: Dict[str, Any]) -> str:
        """
        Genera una respuesta usando el proveedor y API Key específico del comercio.
        ESTO CONSUME TOKENS DEL COMERCIO, NO DE LA PLATAFORMA.
        """
        provider = config.get("provider", "google_gemini")
        api_key = config.get("api_key") or self.global_api_key
        model_name = config.get("model", "gemini-1.5-flash")

        if not api_key:
            return "Error: El comercio no tiene configurada una clave de IA."

        try:
            # Lógica para Gemini
            if provider == "google_gemini" or model_name.startswith("gemini"):
                # Configure temporary client for this request
                # Note: genai.configure is global, so for multi-threaded/concurrent 
                # we'd ideally use a more localized client if supported, 
                # but for simplicity we re-configure or use raw HTTP.
                # Since we are using Gemini Pro/Flash, let's use the SDK approach.
                
                # Re-config with merchant key
                genai.configure(api_key=api_key)
                model = genai.GenerativeModel(model_name)
                
                full_prompt = f"{system_prompt}\n\nCONTEXTO RELEVANTE:\n{context}\n\nPREGUNTA DEL CLIENTE: {user_input}"
                response = model.generate_content(full_prompt)
                return response.text

            # Lógica para OpenAI (Opcional, futuro)
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

            return "Proveedor de IA no soportado aún en el motor Python."

        except Exception as e:
            print(f"[LLM Error] Generation failed for provider {provider}: {str(e)}")
            return "Lo siento, tuve un problema procesando tu respuesta con tu proveedor de IA."
