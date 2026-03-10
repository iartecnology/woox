from typing import Literal

IntentType = Literal["CATALOG_QUERY", "KNOWLEDGE_QUERY", "GREETING", "GENERAL_CHAT", "ORDER_CONFIRMATION"]

class IntentRouter:
    def __init__(self):
        # Palabras clave simplificadas
        self.catalog_keywords = ["cuanto", "vale", "precio", "carta", "menu", "hamburguesa", "combo", "promo", "venden", "comprar", "costo", "pedido", "orden"]
        self.greeting_keywords = ["hola", "buenas", "buen dia", "tardes", "noches", "hey", "saludos"]
        self.order_confirm_keywords = ["si", "correcto", "confirmar", "proceder", "confirmado", "listo", "dale", "no", "nada", "ya", "ninguno"]

    def classify(self, text: str) -> IntentType:
        """
        Clasifica la intención del usuario.
        """
        text = text.lower().strip()
        
        # 1. Detectar Saludos
        if any(word in text for word in self.greeting_keywords) and len(text) < 20:
            return "GREETING"
            
        # 2. Detectar Confirmación de Pedido (Muy importante para cerrar ventas)
        # Solo lo detectamos si es una palabra corta y positiva
        if any(word == text for word in self.order_confirm_keywords) or (len(text) < 15 and any(word in text for word in self.order_confirm_keywords)):
            return "ORDER_CONFIRMATION"

        # 3. Detectar Intención de catálogo
        if any(word in text for word in self.catalog_keywords):
            return "CATALOG_QUERY"
            
        # 4. Por defecto, RAG
        return "KNOWLEDGE_QUERY"
