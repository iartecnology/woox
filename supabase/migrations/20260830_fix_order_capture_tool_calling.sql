-- ============================================================
-- FIX: La skill 'order_capture' instruía a la IA a emitir texto
-- libre "[ORDER_CONFIRMED: {...}]", pero el nodo ai_agent de
-- bot-engine.ts SOLO procesa pedidos vía tool-calling (función
-- register_order). Esa contradicción en el prompt compilado
-- (get_compiled_prompt) hacía que el LLM alternara entre ambos
-- mecanismos: cuando emitía el texto, el pedido nunca se creaba
-- (y en WhatsApp/Evolution/Facebook el JSON crudo se enviaba tal
-- cual al cliente, porque esos webhooks no lo filtran).
--
-- Este fix alinea el fragmento de la skill con el único mecanismo
-- que bot-engine.ts realmente ejecuta: la tool 'register_order'.
-- ============================================================

UPDATE public.skills_catalog
SET system_prompt_fragment =
'### HABILIDAD: CIERRE DE PEDIDO (PROTOCOLO ESTRICTO)

#### PASOS (EN ORDEN, SIN SALTARSE NINGUNO):

**PASO 1 - CARRITO:** Usa la herramienta "add_to_cart" para cada producto que el cliente confirme. Nunca escribas comandos de texto para el carrito, usa siempre la herramienta.

**PASO 2 - RESUMEN DEL PEDIDO:** Muestra la lista de productos, cantidades y total. Pregunta UNA sola cosa: "¿Es correcto este resumen?"

**PASO 3 - SOLICITAR DATOS:** Si confirma el resumen, pide UNA sola cosa: "¿Me puedes dar tu nombre completo, dirección de entrega y número de teléfono?"

**PASO 4 - CONFIRMAR DATOS:** Con los datos recibidos, repítelos al cliente y pregunta:
"¿Son correctos estos datos?
👤 Nombre: [nombre]
📍 Dirección: [dirección]
📞 Teléfono: [teléfono]"

**PASO 5 - REGISTRO FINAL:** SOLO si el cliente confirma sus datos reales, llama a la herramienta técnica "register_order" con los parámetros customer_name, customer_phone y address. NUNCA escribas el pedido como texto ni uses comandos entre corchetes como [ORDER_CONFIRMED]; el único registro válido es a través de esa herramienta.

#### REGLAS CRÍTICAS:
- El registro del pedido se hace EXCLUSIVAMENTE llamando a la herramienta register_order, nunca escribiendo texto o JSON en el mensaje.
- NUNCA uses "...", "no disponible" ni valores vacíos como nombre, teléfono o dirección. Si falta un dato real, vuelve a pedirlo.
- UN mensaje = UNA sola pregunta o acción. NUNCA hagas dos preguntas seguidas.'
WHERE slug = 'order_capture';

-- Verificar:
-- SELECT slug, system_prompt_fragment FROM skills_catalog WHERE slug = 'order_capture';
