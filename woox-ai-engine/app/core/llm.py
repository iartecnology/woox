import os
import google.generativeai as genai
from typing import List, Optional

class LLMService:
    def __init__(self):
        self.api_key = os.getenv("GOOGLE_API_KEY")
        if self.api_key:
            genai.configure(api_key=self.api_key)
            self.model = genai.GenerativeModel('gemini-1.5-flash')
        
    async def get_embedding(self, text: str) -> List[float]:
        """Genera un embedding usando text-embedding-004."""
        try:
            result = genai.embed_content(
                model="models/text-embedding-004",
                content=text,
                task_type="retrieval_query"
            )
            return result['embedding']
        except Exception as e:
            print(f"[LLM Error] Embedding failed: {str(e)}")
            raise e

    async def generate_response(self, system_prompt: str, context: str, user_input: str) -> str:
        """Genera una respuesta final basada en contexto inyectado."""
        try:
            full_prompt = f"{system_prompt}\n\nCONTEXTO RELEVANTE:\n{context}\n\nPREGUNTA DEL CLIENTE: {user_input}"
            response = self.model.generate_content(full_prompt)
            return response.text
        except Exception as e:
            print(f"[LLM Error] Generation failed: {str(e)}")
            return "Lo siento, tuve un problema procesando tu respuesta."
