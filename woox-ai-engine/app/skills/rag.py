from app.db.supabase_client import get_supabase
from app.core.llm import LLMService
import json

class RAGSkill:
    def __init__(self):
        self.supabase = get_supabase()
        self.llm = LLMService()

    async def search_context(self, merchant_id: str, query: str, limit: int = 3, config: Optional[dict] = None) -> str:
        """
        Realiza búsqueda semántica en Supabase.
        1. Genera embedding de la query.
        2. Llama a la función match_context en la DB.
        """
        try:
            # 1. Obtener Vector
            embedding = await self.llm.get_embedding(query, config)
            
            # 2. RPC Call (Búsqueda vectorial)
            # Nota: Usamos la función SQL 'match_semantic_context' que creamos en el plan
            rpc_params = {
                'p_merchant_id': merchant_id,
                'p_embedding': embedding,
                'p_match_threshold': 0.70,
                'p_match_count': limit
            }
            
            response = self.supabase.rpc('match_semantic_context', rpc_params).execute()
            
            if not response.data:
                return "No se encontró información relevante en la base de conocimiento."

            # 3. Formatear resultados para el LLM
            context_text = "INFORMACIÓN EXTRAÍDA DE LA BASE DE CONOCIMIENTO:\n"
            for item in response.data:
                context_text += f"--- {item['title']} ---\n{item['content']}\n\n"
            
            return context_text

        except Exception as e:
            print(f"[RAG Skill Error] {str(e)}")
            return "Error técnico consultando la base de conocimiento."
