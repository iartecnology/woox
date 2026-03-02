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
