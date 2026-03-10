from typing import Optional, Dict, Any, List
from app.core.llm import LLMService

class LandingSkill:
    def __init__(self, llm_service: LLMService):
        self.llm_service = llm_service

    async def generate_blueprint(self, business_info: str, config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Analiza la información del negocio y genera un blueprint estructurado para la landing page.
        """
        system_prompt = """
        Eres un Experto en Marketing Digital y Conversión Web (CRO).
        Tu tarea es analizar la información de un negocio y generar un 'Blueprint' (mapa estructural) para su Landing Page profesional.
        
        PASO 1: Clasificar la industria en una de estas categorías:
        - 'restaurant': Foco en comida, menú, fotos apetitosas y pedidos rápidos.
        - 'hotel': Foco en hospitalidad, descanso, galería de fotos y reservas.
        - 'services': Foco en confianza, autoridad, beneficios claros y agendamiento.
        - 'ecommerce': Foco en producto físico, catálogo, descuentos y compra.
        - 'health': Foco en bienestar, profesionalismo, antes/después y turnos.

        PASO 2: Extraer/Generar Identidad:
        - Brand Name (Nombre de marca)
        - Propuesta de Valor (Slogan impactante)
        - Tono de voz (Elegante, Cercano, Profesional, Dinámico)

        PASO 3: Generar contenido por bloques (Redactar copies persuasivos):
        - Hero: Título y Subtítulo que conviertan.
        - Features: 3 beneficios clave con un icono sugerido (Lucide Icon name).
        - About: Historia breve y humana centrada en el cliente.
        - SEO: Title y Meta Description.

        Responde ÚNICAMENTE con un JSON puro con esta estructura:
        {
          "industry_type": "...",
          "brand_name": "...",
          "tone": "...",
          "theme_suggestion": {
            "palette": {"primary": "#HEX", "secondary": "#HEX", "background": "#HEX", "text": "#HEX", "accent": "#HEX"},
            "typography": "Nombre de Google Font"
          },
          "blocks_order": ["hero", "features", "about", "catalog", "location"],
          "content": {
            "hero": {"title": "...", "subtitle": "..."},
            "features": [{"icon": "...", "title": "...", "desc": "..."}, ...],
            "about": {"title": "...", "text": "..."},
            "seo": {"title": "...", "description": "..."}
          }
        }
        """

        user_input = f"Información del Negocio / ADN:\n{business_info}\n\nGenera el blueprint JSON:"
        
        try:
            # Reutilizamos el servicio LLM existente de Woox
            raw_response = await self.llm_service.generate_response(system_prompt, "", user_input, config)
            
            # Limpiar posibles marcas de markdown en la respuesta
            clean_json = raw_response.replace("```json", "").replace("```", "").strip()
            
            import json
            blueprint = json.loads(clean_json)
            return blueprint
            
        except Exception as e:
            print(f"[Landing Skill Error] {str(e)}")
            return {
                "error": True,
                "message": f"No se pudo generar el plano de la web: {str(e)}"
            }
