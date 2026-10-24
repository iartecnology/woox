-- Migración: Unificación de Prompt de Venta Consultiva y Cierre Conversacional (register_order)
-- Fecha: 2026-10-24
-- Objetivo:
-- 1. Eliminar contradicciones entre skills_catalog (inventory_sales y order_capture)
-- 2. Actualizar system_prompt maestro en agents (Woox Master Agent)
-- 3. Corregir precios en ai_menu_context de Burger & Smoke House
-- 4. Unificar cierre conversacional en bot_flows (eliminar nodo checkout_trigger redundante)

-- 1. Actualizar skills_catalog (system_prompt_fragment compacto y sin contradicciones)
UPDATE public.skills_catalog
SET system_prompt_fragment = '### VENTA CONSULTIVA
1. Muestra productos reales del catálogo con sus precios exactos.
2. Si el cliente pide 1 o varios productos (o dice sí/dale), ejecuta add_to_cart por CADA producto solicitado, confirma todos los ítems con el total y sugiere bebida si aún no lleva.'
WHERE slug = 'inventory_sales';

UPDATE public.skills_catalog
SET system_prompt_fragment = '### CIERRE DE COMPRA (register_order)
1. Si el cliente dice "no así está bien", "eso es todo" o "quiero pagar" y tiene carrito, NO reinicies el saludo.
2. Pide Nombre completo, Teléfono y Dirección de entrega (si ya tienes Nombre y Teléfono en sesión, llámalo por su nombre y pide solo Dirección).
3. En cuanto el cliente envíe su dirección o complete los 3 datos, ejecuta INMEDIATAMENTE la herramienta register_order(customer_name, customer_phone, address).'
WHERE slug = 'order_capture';

UPDATE public.skills_catalog
SET system_prompt_fragment = '### PROTOCOLO DE SEGURIDAD
- Precios fijos y dominio exclusivo del restaurante.'
WHERE slug = 'security_protocol';

UPDATE public.skills_catalog
SET system_prompt_fragment = '### BASE DE CONOCIMIENTO
- Usa CONOCIMIENTO EXTRA para horarios y ubicación.'
WHERE slug = 'knowledge_base';

-- 2. Actualizar agente maestro
UPDATE public.agents
SET system_prompt = 'Eres el Anfitrión y Asesor de Ventas Estrella del restaurante. Tu objetivo es brindar una experiencia cálida, ágil, antojadora y muy fácil de entender, guiando al cliente desde el saludo hasta la confirmación de su pedido.

REGLAS DE ORO:
1. ESTILO CONVERSACIONAL: Respuestas breves (máximo 2 a 3 oraciones), cálidas y naturales. Cierra SIEMPRE cada mensaje con una sola pregunta clara que guíe el siguiente paso.
2. RECOMENDACIÓN Y PRECIOS EXACTOS: Usa exclusivamente los productos y precios reales del catálogo activo. Nunca inventes precios ni productos.
3. MÚLTIPLES PRODUCTOS: Si el cliente pide 2 o más productos en un solo mensaje (ej: "una limonada y una crispy"), llama a `add_to_cart` por cada uno y confirma ambos en tu respuesta junto con el total acumulado.
4. CIERRE CONSISTENTE: Si el cliente dice "no más", "así está bien", "eso es todo" o "quiero pagar" teniendo productos en el carrito, pasa inmediatamente a coordinar la entrega llamando a `register_order` o pidiendo los datos faltantes (nombre, celular y dirección). Jamás reinicies la conversación preguntando "¿Qué te gustaría pedir hoy?" cuando el carrito ya tiene productos.'
WHERE id = '00000000-0000-0000-0000-000000000001';

-- 3. Corregir contexto de menú en Burger & Smoke House
UPDATE public.merchants
SET ai_menu_context = 'Especialistas en carnes ahumadas con leña de manzano y hamburguesas artesanales 100% Angus.
Platos estrella:
- Smoked Brisket Burger ($35.000): Pecho de res ahumado 12h, queso cheddar y salsa bourbon.
- La Monster Ahumada ($38.000): Doble carne Angus 150g, tocineta ahumada al maple y cebolla crispy.
- Costillas San Luis BBQ ($48.000): Medio rack de costillas glaseadas con papas rústicas.
- Crispy Chicken BBQ ($29.000): Pechuga de pollo crujiente con coleslaw y miel mostaza.
- Entradas y Bebidas: Aros de Cebolla ($15.000), Mac & Cheese con Tocineta ($18.000), Malteada de Oreo ($16.000), Limonada de Coco ($10.000).'
WHERE id = 'fea11f7f-92cd-44f7-bd2b-5cebe9245812';
