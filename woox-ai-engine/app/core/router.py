from typing import Literal

IntentType = Literal["CATALOG_QUERY", "KNOWLEDGE_QUERY", "GREETING", "GENERAL_CHAT"]

class IntentRouter:
    def __init__(self):
        # Palabras clave simplificadas para evitar llamadas innecesarias al LLM en el ruteo
        self.catalog_keywords = ["cuanto", "vale", "precio", "carta", "menu", "hamburguesa", "combo", "promo", "venden", "comprar", "costo", "pedido", "orden"]
        self.greeting_keywords = ["hola", "buenas", "buen dia", "tardes", "noches", "hey", "saludos"]

    def classify(self, text: str) -> IntentType:
        """
        Clasifica la intención del usuario de forma determinista para ahorrar tokens.
        En el futuro, esto puede usar un modelo de clasificación ligero (FastText/BERT).
        """
        text = text.lower().strip()
        
        # 1. Detectar Saludos
        if any(word in text for word in self.greeting_keywords) and len(text) < 20:
            return "GREETING"
            
        # 2. Detectar Intención de compra/catálogo
        if any(word in text for word in self.catalog_keywords):
            return "CATALOG_QUERY"
            
        # 3. Por defecto, buscar en Base de Conocimiento (RAG)
        return "KNOWLEDGE_QUERY"
