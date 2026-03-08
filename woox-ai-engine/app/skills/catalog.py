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
            response = self.supabase.from_("products").select("name, price, description, is_available, tags, metadata, categories(name)")\
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
                    catalog_text += f"\n➔ [{category_name}]\n"
                    current_category = category_name
                
                price_text = f"${p['price']}" if p['price'] > 0 else "Consultar"
                catalog_text += f"- *{p['name']}* | {price_text}\n"
                
                # Descripción resumida
                if p['description']:
                    desc = p['description'][:80] + "..." if len(p['description']) > 80 else p['description']
                    catalog_text += f"  _{desc}_\n"
                
                # Etiquetas (Dieta, Alérgenos, etc.)
                if p.get('tags'):
                    catalog_text += f"  🏷️ [{', '.join(p['tags'])}]\n"
                
                # Soporte para variantes (WooCommerce Stage 1)
                meta = p.get('metadata') or {}
                if meta.get('attributes'):
                    attrs = [f"{a['name']}: {', '.join(a['options'])}" for a in meta['attributes']]
                    catalog_text += f"  (Opciones: {'; '.join(attrs)})\n"
                
                if meta.get('all_images') and len(meta['all_images']) > 1:
                    catalog_text += f"  📸 {len(meta['all_images'])} fotos disponibles.\n"
            
            return catalog_text

        except Exception as e:
            print(f"[Catalog Skill Error] {str(e)}")
            return "Error técnico consultando el catálogo de productos."
