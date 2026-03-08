from app.db.supabase_client import get_supabase
from typing import Dict, Any, List

class OrderSkill:
    def __init__(self):
        self.supabase = get_supabase()

    async def register_order(self, merchant_id: str, customer_id: str, conversation_id: str, order_data: Dict[str, Any]) -> str:
        """
        Registra una orden en la base de datos de Supabase.
        """
        try:
            # 1. Actualizar datos del cliente si vienen
            customer_updates = {}
            if order_data.get("customer_name"): customer_updates["full_name"] = order_data["customer_name"]
            if order_data.get("phone"): customer_updates["phone"] = order_data["phone"]
            
            if customer_updates:
                self.supabase.from_("customers").update(customer_updates).eq("id", customer_id).execute()

            # 2. Crear la orden
            order_payload = {
                "merchant_id": merchant_id,
                "customer_id": customer_id,
                "conversation_id": conversation_id,
                "total": float(order_data.get("total", 0)),
                "delivery_address": order_data.get("address", "No proporcionada"),
                "status": "pending",
                "closing_agent_type": "ai"
            }
            
            order_res = self.supabase.from_("orders").insert(order_payload).execute()
            
            if not order_res.data:
                return "Error registrando la orden."
            
            order = order_res.data[0]
            order_id = order["id"]
            order_num = order.get("order_number", "N/A")

            # 3. Registrar items si vienen
            items = order_data.get("items", [])
            if items and isinstance(items, list):
                # Obtener productos para matchear IDs
                prods_res = self.supabase.from_("products").select("id, name").eq("merchant_id", merchant_id).execute()
                products = prods_res.data or []
                
                items_payload = []
                for it in items:
                    matched = next((p for p in products if p["name"].lower() == str(it.get("name", "")).lower()), None)
                    items_payload.append({
                        "order_id": order_id,
                        "product_id": matched["id"] if matched else None,
                        "product_name": str(it.get("name", "Producto desconocido")),
                        "quantity": int(it.get("qty", 1)),
                        "unit_price": float(it.get("price", 0)),
                        "subtotal": float(it.get("qty", 1)) * float(it.get("price", 0))
                    })
                
                if items_payload:
                    self.supabase.from_("order_items").insert(items_payload).execute()

            return f"\n\n🚀 *¡Pedido registrado!*\n🆔 *Orden #{order_num}*"

        except Exception as e:
            print(f"[Order Skill Error] {str(e)}")
            return "\n\n⚠️ Tu pedido no pudo ser registrado automáticamente."

    async def get_upsell_recommendations(self, merchant_id: str, current_items: List[Dict[str, Any]]) -> str:
        """
        Basado en los items actuales, sugiere productos complementarios (cross-selling).
        Usa los cross_sell_ids extraídos de WooCommerce en el metadata.
        """
        try:
            if not current_items: return ""

            # 1. Obtener todos los productos del comercio para tener la referencia cruzada
            res = self.supabase.from_("products").select("id, name, price, remote_id, metadata")\
                .eq("merchant_id", merchant_id)\
                .eq("is_available", True)\
                .execute()
            
            if not res.data: return ""
            all_products = res.data

            # 2. Identificar qué productos en el carrito tienen sugerencias
            suggested_ids = set()
            current_names = [it.get("name", "").lower() for it in current_items]

            for it in current_items:
                matched = next((p for p in all_products if p["name"].lower() == it.get("name", "").lower()), None)
                if matched and matched.get("metadata"):
                    cross_ids = matched["metadata"].get("cross_sell_ids", [])
                    suggested_ids.update([str(cid) for cid in cross_ids])
            
            if not suggested_ids: return ""

            # 3. Filtrar productos sugeridos que NO estén ya en el carrito
            final_suggestions = []
            for p in all_products:
                if p.get("remote_id") in suggested_ids and p["name"].lower() not in current_names:
                    final_suggestions.append(f"- {p['name']} (${p['price']})")
            
            if not final_suggestions: return ""

            # 4. Formatear la sugerencia
            header = "\n\n💡 *Te podría interesar añadir:* \n"
            return header + "\n".join(final_suggestions[:3]) # Sugerir máximo 3

        except Exception as e:
            print(f"[Upsell Error] {str(e)}")
            return ""
