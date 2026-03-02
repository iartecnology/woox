from app.db.supabase_client import get_supabase
from typing import Optional, List, Dict, Any

class CatalogSkill:
    def __init__(self):
        self.supabase = get_supabase()

    async def get_catalog(self, merchant_id: str) -> str:
        """
        Obtiene productos y categorías directamente desde Supabase.
        Filtra por disponibilidad y formatea en Markdown.
        """
        try:
            # 1. Obtener datos combinados directamente de Supabase
            response = self.supabase.from_("products").select("name, price, description, is_available, categories(name)")\
                .eq("merchant_id", merchant_id)\
                .eq("is_available", True)\
                .order("category_id")\
                .execute()
            
            if not response.data:
                return "No tenemos productos en el catálogo en este momento."

            # 2. Agrupar por categorías
            catalog_text = "CATÁLOGO OFICIAL (Productos Disponibles):\n\n"
            current_category = ""
            
            for p in response.data:
                category_name = p['categories']['name'] if p['categories'] else "Otros"
                if category_name != current_category:
                    catalog_text += f"➔ [{category_name}]\n"
                    current_category = category_name
                
                catalog_text += f"- {p['name']} | Precio: ${p['price']}\n"
                if p['description']:
                    catalog_text += f"  ({p['description']})\n"
            
            return catalog_text

        except Exception as e:
            print(f"[Catalog Skill Error] {str(e)}")
            return "Error técnico consultando el catálogo de productos."
