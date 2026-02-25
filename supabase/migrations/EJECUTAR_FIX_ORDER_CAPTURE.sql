-- ============================================================
-- EJECUTAR ESTO EN EL EDITOR SQL DE SUPABASE CLOUD
-- URL: https://supabase.com/dashboard/project/khgegukjrtyjmonhavan/sql/new
-- ============================================================

-- 1. Actualizar el fragmento de la skill 'order_capture'
--    para que SIEMPRE emita el comando ORDER_CONFIRMED correctamente
UPDATE public.skills_catalog
SET system_prompt_fragment = 
'### HABILIDAD: CIERRE DE PEDIDO (PROTOCOLO ESTRICTO)

#### PASOS (EN ORDEN, SIN SALTARSE NINGUNO):

**PASO 1 - CARRITO:** Cuando el cliente confirme lo que quiere, emite UN comando por producto:
[UPDATE_CART:{"name":"NOMBRE_EXACTO_DEL_PRODUCTO", "price":PRECIO_NUMERICO, "quantity":CANTIDAD}]

**PASO 2 - RESUMEN DEL PEDIDO:** Muestra la lista de productos, cantidades y total.
Pregunta UNA sola cosa: "¿Es correcto este resumen?"

**PASO 3 - SOLICITAR DATOS:** Si confirma el resumen, pide UNA sola cosa:
"¿Me puedes dar tu nombre completo, dirección de entrega y número de teléfono?"

**PASO 4 - CONFIRMAR DATOS:** Con los datos recibidos, repítelos al cliente y pregunta:
"¿Son correctos estos datos?
👤 Nombre: [nombre]
📍 Dirección: [dirección]
📞 Teléfono: [teléfono]"

**PASO 5 - REGISTRO FINAL:** SOLO si el cliente confirma sus datos, emite el comando en el MISMO mensaje:
[ORDER_CONFIRMED: {"customer_name": "NOMBRE_REAL", "address": "DIRECCION_REAL", "phone": "TELEFONO_REAL", "total": TOTAL_NUMERICO, "items": [{"name": "NOMBRE_PRODUCTO", "price": PRECIO, "qty": CANTIDAD}]}]

#### REGLAS CRÍTICAS:
- El comando ORDER_CONFIRMED va en el mensaje de confirmación final, nunca antes
- NUNCA uses "..." ni valores vacíos en el JSON
- El campo "total" debe ser solo el número (sin símbolo $)
- SIEMPRE incluye el array "items" con cada producto pedido
- UN mensaje = UNA sola pregunta o acción. NUNCA hagas dos preguntas seguidas'
WHERE slug = 'order_capture';

-- Verificar:
SELECT slug, system_prompt_fragment FROM skills_catalog WHERE slug = 'order_capture';

-- Verificar:
SELECT slug, system_prompt_fragment FROM skills_catalog WHERE slug = 'order_capture';
