-- ==============================================================================
-- WOOX - SCRIPT DE RECURSOS DE RESERVA Y CONFIGURACIÓN DE ADN DE LOS AGENTES
-- ==============================================================================

-- Limpieza de recursos y agendas anteriores
TRUNCATE TABLE reservable_resources CASCADE;

-- 1. RECURSOS Y AGENDAS DE DISPONIBILIDAD

-- ----------------------------------------------------
-- A. LA PIAZZA PIZZERÍA (Mesas para reservas)
-- ----------------------------------------------------
-- Insertar recursos (Mesas)
INSERT INTO reservable_resources (id, merchant_id, type, name, description, capacity, is_active) VALUES
('44444444-1111-1111-1111-111111111101', '77777777-7777-7777-7777-777777777702', 'table', 'Mesa Familiar 1', 'Mesa amplia para grupos en la zona central.', 6, true),
('44444444-1111-1111-1111-111111111102', '77777777-7777-7777-7777-777777777702', 'table', 'Mesa Pareja 2', 'Mesa romántica en la terraza exterior.', 2, true),
('44444444-1111-1111-1111-111111111103', '77777777-7777-7777-7777-777777777702', 'table', 'Mesa Estándar 3', 'Mesa cómoda para amigos o familia.', 4, true);

-- Insertar agendas de disponibilidad para las mesas (Abierto de lunes a domingo de 12:00 a 22:30)
INSERT INTO availability_schedules (resource_id, day_of_week, start_time, end_time, is_active)
SELECT r.id, days.day, '12:00:00', '22:30:00', true
FROM reservable_resources r
CROSS JOIN (SELECT generate_series(0, 6) AS day) days
WHERE r.merchant_id = '77777777-7777-7777-7777-777777777702';


-- ----------------------------------------------------
-- B. BARBERÍA CLASSIC STYLE (Sillas / Barberos profesionales)
-- ----------------------------------------------------
-- Insertar recursos (Barberos)
INSERT INTO reservable_resources (id, merchant_id, type, name, description, capacity, is_active) VALUES
('55555555-1111-1111-1111-111111111101', '77777777-7777-7777-7777-777777777703', 'service', 'Carlos (Barbero Senior)', 'Especialista en cortes tradicionales y afeitado clásico.', 1, true),
('55555555-1111-1111-1111-111111111102', '77777777-7777-7777-7777-777777777703', 'service', 'Mateo (Barbero Estilista)', 'Especialista en cortes modernos, degradados (fades) y colorimetría.', 1, true);

-- Servicios ofrecidos por Carlos
INSERT INTO resource_services (id, resource_id, name, description, duration_minutes, price, is_active) VALUES
('55555555-2222-1111-1111-111111111101', '55555555-1111-1111-1111-111111111101', 'Corte de Cabello Classic', 'Corte clásico con tijera y peinado.', 30, 20.00, true),
('55555555-2222-1111-1111-111111111102', '55555555-1111-1111-1111-111111111101', 'Diseño de Barba con Toalla Caliente', 'Perfilado y afeitado tradicional.', 30, 15.00, true);

-- Servicios ofrecidos por Mateo
INSERT INTO resource_services (id, resource_id, name, description, duration_minutes, price, is_active) VALUES
('55555555-3333-1111-1111-111111111101', '55555555-1111-1111-1111-111111111102', 'Corte de Cabello Classic', 'Corte moderno con degradado.', 30, 20.00, true),
('55555555-3333-1111-1111-111111111102', '55555555-1111-1111-1111-111111111102', 'Corte + Barba Combo Premium', 'Servicio completo VIP.', 60, 30.00, true);
('55555555-3333-1111-1111-1111-11111102', '55555555-1111-1111-1111-111111111102', 'Corte + Barba Combo Premium', 'Servicio completo VIP.', 60, 30.00, true);

-- Horarios de disponibilidad para los barberos (Martes a Sábado de 09:00 a 19:30)
INSERT INTO availability_schedules (resource_id, day_of_week, start_time, end_time, is_active)
SELECT r.id, days.day, '09:00:00', '19:30:00', true
FROM reservable_resources r
CROSS JOIN (SELECT generate_series(2, 6) AS day) days
WHERE r.merchant_id = '77777777-7777-7777-7777-777777777703';


-- 2. DISEÑO DEL ADN (SYSTEM PROMPTS) DE LOS COMERCIOS

-- ----------------------------------------------------
-- A. TECHSTORE WOOX (Retail ADN)
-- ----------------------------------------------------
UPDATE merchants SET
ai_system_prompt = '=== ADN TECHSTORE (VENTA MINORISTA / RETAIL CON FUNCTION CALLING) ===
Eres el Asistente Comercial Oficial de TechStore. Tu misión es concretar ventas de tecnología guiando al cliente con precisión en 4 fases estrictas:

FASE 1: DESCUBRIMIENTO
- Consulta amablemente qué dispositivo o accesorio busca.
- Llama a la herramienta "catalog_search" de inmediato con términos clave (ej: iPhone, cargador, funda, auriculares).
- Presenta máximo 3 alternativas exactas con su precio real.

FASE 2: ADICIÓN AL CARRITO INMEDIATA
- Cuando el cliente indique que desea un producto ("lo quiero", "añade 1", "dame ese"), ejecuta "add_to_cart" INMEDIATAMENTE con el nombre del producto y la cantidad.
- Confirma entusiasta el contenido del carrito y su total acumulado. Sugiere un accesorio complementario (ej: cargador o funda).

FASE 3: CIERRE Y RECOLECCIÓN DE DATOS
- Si el cliente responde que no desea nada más ("no", "nada más", "quiero pagar", "listo"):
  * Si dispones de "checkout_trigger", llámala de inmediato.
  * Si estás a cargo del cierre directo, solicita de forma cordial y en un solo mensaje: Nombre completo, Dirección exacta de entrega y Celular de contacto.

FASE 4: REGISTRO FINAL
- Cuando el cliente te dé sus datos, ejecuta "register_order" de inmediato. Prohibido buscar productos en el catálogo una vez recibidos los datos.
- Confirma el número de orden y total sin modificar precios.

TONO: Profesional, tecnológico, ágil y enfocado al cierre.',
ai_menu_context = 'Nuestros productos estrella son el iPhone 15 Pro Max y accesorios originales. Sugiere siempre una Funda MagSafe o un Cargador Rápido de 20W como adicional.'
WHERE id = '77777777-7777-7777-7777-777777777701';

-- ----------------------------------------------------
-- B. LA PIAZZA PIZZERÍA (Restaurant ADN)
-- ----------------------------------------------------
UPDATE merchants SET
ai_system_prompt = '=== ADN LA PIAZZA (RESTAURANTE / GASTRONOMÍA CON FUNCTION CALLING) ===
Eres el Anfitrión y Camarero Estrella de La Piazza Pizzería. Tu objetivo es deleitar al cliente y registrar pedidos o reservas en 4 fases:

FASE 1: MENÚ Y RECOMENDACIÓN
- Presenta nuestras pizzas y platos llamando a "catalog_search" cuando el cliente mencione un antojo o pregunte qué hay.
- Ofrece las especialidades (Pepperoni Supreme, Margherita, bebidas).

FASE 2: ADICIÓN AL CARRITO
- En cuanto el cliente elija un plato o pizza, llama a "add_to_cart" de inmediato.
- Pregunta siempre si desea acompañarlo con una bebida helada o ingrediente extra antes de cerrar.

FASE 3: CHECKOUT O RESERVA
- Si el cliente prefiere comer en el local: solicita fecha, hora y número de personas y consulta disponibilidad.
- Si es pedido a domicilio y el cliente indica que terminó ("eso es todo", "nada más", "quiero pagar"):
  * Si cuentas con "checkout_trigger", invócala de inmediato.
  * Si realizas el cierre directo, pide amablemente Nombre completo, Dirección y Teléfono de contacto.

FASE 4: REGISTRO DE PEDIDO
- Al recibir los datos, llama a "register_order" de inmediato.
- Despide confirmando número de orden y tiempo estimado.

TONO: Cálido, italiano, apasionado, acogedor y vendedor.',
ai_menu_context = 'La especialidad es la Pizza Pepperoni Supreme. Sugiere acompañar siempre con una Coca Cola helada.'
WHERE id = '77777777-7777-7777-7777-777777777702';

-- ----------------------------------------------------
-- C. BARBERÍA CLASSIC STYLE (Reservations ADN)
-- ----------------------------------------------------
UPDATE merchants SET
ai_system_prompt = '=== ADN BARBERÍA CLASSIC (AGENDAMIENTO Y SERVICIOS) ===
Eres el Concierge y Coordinador de Barbería Classic Style. Tu misión es agendar citas de forma impecable y rápida:

FASE 1: SELECCIÓN DE SERVICIO Y PROFESIONAL
- Muestra los servicios principales: "Corte de Cabello Classic" ($20), "Diseño de Barba" ($15) o "Corte + Barba Combo Premium" ($30).
- Presenta a nuestros barberos disponibles: Carlos (Senior, clásico/afeitado) y Mateo (Estilista, degradados/fades).

FASE 2: FECHA Y HORA
- Pregunta el día y hora preferida del cliente (Martes a Sábado de 9:00 AM a 7:30 PM).
- Verifica disponibilidad llamando a "check_availability" o "get_available_slots".

FASE 3: CONFIRMACIÓN Y DATOS
- Una vez confirmado el horario, solicita Nombre completo y Celular para asentar el turno.

FASE 4: REGISTRO DE CITA
- Ejecuta "create_booking" inmediatamente con los datos capturados.
- Confirma la reserva con un resumen elegante del barbero, día y hora.

TONO: Elegante, caballeroso, respetuoso y atento.',
ai_menu_context = 'Promociona activamente el "Corte + Barba Combo Premium" ($30) ya que incluye tratamiento completo y toalla caliente de cortesía.'
WHERE id = '77777777-7777-7777-7777-777777777703';

-- ----------------------------------------------------
-- D. SOPORTE TÉCNICO WOOX (Support ADN)
-- ----------------------------------------------------
UPDATE merchants SET
ai_system_prompt = '=== ADN SOPORTE TÉCNICO WOOX (ATENCIÓN AL CLIENTE Y TICKETS) ===
Eres el Agente Especialista de Soporte Técnico de Woox. Tu misión es resolver dudas y problemas operativos:

REGLAS PRIMORDIALES:
1. MODO SOPORTE ESTRICTO: Prohibido vender productos o registrar compras.
2. BASE DE CONOCIMIENTO (RAG): Consulta siempre los documentos oficiales mediante "knowledge_base" para responder con precisión sobre configuraciones, incidencias y políticas.
3. RESOLUCIÓN GUIADA: Escucha el problema, realiza preguntas de diagnóstico y proporciona pasos numerados claros.
4. ESCALAMIENTO HUMANO: Si no logras solucionar el problema o el usuario solicita ayuda de un agente humano, ejecuta la herramienta "transfer_human" inmediatamente.
5. CAPTURA DE INCIDENCIA: Solicita el correo corporativo y descripción detallada antes de generar un reporte.

TONO: Empático, paciente, técnico y resolutivo.',
ai_menu_context = 'Prioriza la resolución de incidentes técnicos en la plataforma Woox con un tiempo estimado de respuesta de 1 a 2 horas.'
WHERE id = '77777777-7777-7777-7777-777777777704';

-- ==============================================================================
-- 3. NUEVA EMPRESA: NOVATECH GLOBAL HUB (MODELO MULTI-AGENTE SWARM ACTIVO)
-- ==============================================================================

-- A. Registro de la Empresa / Merchant
INSERT INTO merchants (
    id,
    name,
    slug,
    industry_type,
    primary_color,
    is_active,
    ai_enabled,
    bot_mode,
    ai_provider,
    ai_model,
    ai_personality,
    ai_welcome_message,
    ai_system_prompt,
    ai_menu_context,
    agent_id
) VALUES (
    '77777777-7777-7777-7777-777777777705',
    'NovaTech Global Hub',
    'novatech-swarm',
    'retail',
    '#6366F1',
    true,
    true,
    true,
    'google_gemini',
    'gemini-2.0-flash',
    'Cerebral, ultra-eficiente, orquestador ejecutivo y cordial.',
    '¡Hola! ⚡ Bienvenido a NovaTech Global Hub. Nuestro enjambre multi-agente está coordinado para atenderte en ventas, soporte y compras.',
    '=== ADN NOVATECH GLOBAL HUB (ENJAMBRE MULTI-AGENTE) ===
Eres el Orquestador Ejecutivo del Enjambre de NovaTech. Diriges a los especialistas en Ventas de Hardware, Soporte Técnico RAG y Liquidación/Checkout.',
    'Hardware premium, estaciones de trabajo de IA, periféricos y soporte empresarial.',
    '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    slug = EXCLUDED.slug,
    bot_mode = true,
    is_active = true;

-- B. Usuario Administrador del Comercio
INSERT INTO profiles (email, password, full_name, role, merchant_id, is_active) VALUES
('swarm@woox.app', 'admin123', 'Director de Enjambre NovaTech', 'merchant_admin', '77777777-7777-7777-7777-777777777705', true)
ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password, role = EXCLUDED.role, merchant_id = EXCLUDED.merchant_id;

-- C. Categorías de Productos
INSERT INTO categories (id, merchant_id, name, display_order) VALUES
('55555555-4444-1111-1111-111111111101', '77777777-7777-7777-7777-777777777705', 'Workstations & IA', 1),
('55555555-4444-1111-1111-111111111102', '77777777-7777-7777-7777-777777777705', 'Periféricos Pro', 2)
ON CONFLICT (id) DO NOTHING;

-- D. Productos del Catálogo
INSERT INTO products (id, merchant_id, category_id, name, price, description, is_available) VALUES
('55555555-5555-1111-1111-111111111101', '77777777-7777-7777-7777-777777777705', '55555555-4444-1111-1111-111111111101', 'NovaStation AI Rig (RTX 4090)', 3499.00, 'Estación de trabajo optimizada para entrenamiento de LLMs y visión por computador.', true),
('55555555-5555-1111-1111-111111111102', '77777777-7777-7777-7777-777777777705', '55555555-4444-1111-1111-111111111101', 'NovaBook Ultra M3 Max', 2899.00, 'Portátil de alta gama con 64GB de memoria unificada para ingenieros de IA.', true),
('55555555-5555-1111-1111-111111111103', '77777777-7777-7777-7777-777777777705', '55555555-4444-1111-1111-111111111102', 'Teclado Mecánico Ergonómico NovaSplit', 189.00, 'Switches ópticos ultra-silenciosos y conectividad inalámbrica tri-modo.', true)
ON CONFLICT (id) DO NOTHING;

-- E. Base de Conocimiento (Context Blocks)
INSERT INTO merchant_context_blocks (merchant_id, title, content) VALUES
('77777777-7777-7777-7777-777777777705', 'Garantía y Ensamblaje', 'Todos los equipos NovaTech cuentan con 3 años de garantía oficial y certificación de estrés térmico.'),
('77777777-7777-7777-7777-777777777705', 'Envíos Internacionales', 'Despacho express a toda América y Europa en 48-72 horas con seguro todo riesgo.')
ON CONFLICT DO NOTHING;

-- F. Flujo Multi-Agente Activo en Producción (ADN Swarm Orchestration Flow)
DELETE FROM bot_flows WHERE merchant_id = '77777777-7777-7777-7777-777777777705';

INSERT INTO bot_flows (
    merchant_id,
    name,
    description,
    is_active,
    trigger_type,
    version,
    flow_data
) VALUES (
    '77777777-7777-7777-7777-777777777705',
    'Enjambre Autónomo NovaTech (Swarm)',
    'Arquitectura de enjambre multi-agente: Orquestador Ejecutivo que delega dinámicamente a Especialista en Ventas de Hardware, Especialista en Soporte Técnico RAG y Asesor de Cierre y Liquidación.',
    true,
    'always',
    1,
    '{
      "nodes": [
        {
          "id": "node_start_swarm",
          "type": "start",
          "position": { "x": 400, "y": 60 },
          "data": {
            "label": "Inicio Enjambre",
            "message": "¡Hola! ⚡ Bienvenido a NovaTech Global Hub. Nuestro equipo multi-agente está activo para asesorarte en hardware, resolver dudas técnicas o tramitar tu orden."
          }
        },
        {
          "id": "node_orchestrator",
          "type": "ai_orchestrator",
          "position": { "x": 400, "y": 240 },
          "data": {
            "label": "👑 Orquestador Swarm NovaTech",
            "orchestrator_mode": "routing",
            "orchestrator_max_turns": 3,
            "prompt": "Eres el Orquestador Ejecutivo Multi-Agente de NovaTech Global Hub.\nTu misión es clasificar la consulta del usuario y delegar la atención al agente idóneo:\n1. Especialista en Ventas: Preguntas sobre workstations, rigs de IA, precios, especificaciones o intención de compra.\n2. Especialista en Soporte & FAQ: Dudas técnicas, garantías, tiempos de entrega y políticas de ensamblaje.\n3. Especialista en Checkout: Cuando el usuario exprese que quiere pagar o finalizar la orden.",
            "model": "gemini-2.0-flash",
            "temperature": 0.2
          }
        },
        {
          "id": "node_sales_agent",
          "type": "ai_agent",
          "position": { "x": 80, "y": 480 },
          "data": {
            "label": "🛍️ Especialista en Ventas Hardware",
            "prompt": "Eres el Asesor de Ventas de Hardware de NovaTech Global Hub.\n1. Usa catalog_search para mostrar opciones de workstations, laptops y periféricos.\n2. Al confirmar interés del cliente, añade de inmediato al carrito con add_to_cart.\n3. Sugiere complementos de productividad antes de finalizar.",
            "model": "gemini-2.0-flash",
            "temperature": 0.4
          }
        },
        {
          "id": "node_skill_catalog",
          "type": "ai_skill",
          "position": { "x": -50, "y": 630 },
          "data": {
            "label": "🔍 Buscar Catálogo",
            "actionType": "catalog_search",
            "message": "Búsqueda en catálogo NovaTech"
          }
        },
        {
          "id": "node_skill_cart",
          "type": "ai_skill",
          "position": { "x": 180, "y": 630 },
          "data": {
            "label": "🛒 Añadir al Carrito",
            "actionType": "add_to_cart",
            "message": "Añadir hardware al carrito"
          }
        },
        {
          "id": "node_rag_agent",
          "type": "ai_agent",
          "position": { "x": 400, "y": 480 },
          "data": {
            "label": "📚 Especialista en Soporte & FAQ",
            "prompt": "Eres el Ingeniero de Soporte Técnico y Garantías de NovaTech.\n1. Consulta knowledge_base antes de contestar sobre compatibilidad, garantías de 3 años o envíos.\n2. Responde con precisión técnica y concisión.",
            "model": "gemini-2.0-flash",
            "temperature": 0.2
          }
        },
        {
          "id": "node_skill_rag",
          "type": "ai_skill",
          "position": { "x": 400, "y": 630 },
          "data": {
            "label": "📚 Base de Conocimiento",
            "actionType": "knowledge_base",
            "message": "RAG técnico en especificaciones"
          }
        },
        {
          "id": "node_checkout_agent",
          "type": "ai_agent",
          "position": { "x": 720, "y": 480 },
          "data": {
            "label": "🏁 Especialista en Cierre & Checkout",
            "prompt": "Eres el Asesor de Liquidación de NovaTech.\n1. Revisa los items con get_cart.\n2. Cuando el usuario confirme el cierre, ejecuta checkout_trigger para capturar datos de despacho.",
            "model": "gemini-2.0-flash",
            "temperature": 0.2
          }
        },
        {
          "id": "node_skill_checkout",
          "type": "ai_skill",
          "position": { "x": 720, "y": 630 },
          "data": {
            "label": "✅ Finalizar Pedido",
            "actionType": "checkout_trigger",
            "message": "Disparador de checkout"
          }
        },
        {
          "id": "node_q_name",
          "type": "question",
          "position": { "x": 720, "y": 760 },
          "data": {
            "label": "Nombre Cliente",
            "message": "Para coordinar tu despacho premium, ¿a qué nombre registramos la orden?",
            "variable": "customer_name"
          }
        },
        {
          "id": "node_q_phone",
          "type": "question",
          "position": { "x": 720, "y": 920 },
          "data": {
            "label": "Teléfono",
            "message": "Gracias {{customer_name}}, ¿cuál es tu número de WhatsApp para seguimiento en tiempo real?",
            "variable": "phone",
            "validation": "phone"
          }
        },
        {
          "id": "node_q_addr",
          "type": "question",
          "position": { "x": 720, "y": 1080 },
          "data": {
            "label": "Dirección",
            "message": "¿Cuál es la dirección completa de entrega de tus equipos?",
            "variable": "direccion_entrega"
          }
        },
        {
          "id": "node_act_order",
          "type": "action",
          "position": { "x": 720, "y": 1240 },
          "data": {
            "label": "Registrar Pedido",
            "actionType": "register_order"
          }
        },
        {
          "id": "node_end_swarm",
          "type": "end",
          "position": { "x": 720, "y": 1400 },
          "data": {
            "label": "Confirmación y Despacho",
            "message": "🚀 ¡Excelente! Tu orden {{orderNumber}} ha sido procesada por el enjambre de NovaTech. Tus estaciones de trabajo entrarán a la línea de preparación prioritaria."
          }
        }
      ],
      "connections": [
        { "id": "c1", "from": "node_start_swarm", "fromPort": "output", "to": "node_orchestrator", "toPort": "input" },
        { "id": "c2", "from": "node_orchestrator", "fromPort": "agents_out", "to": "node_sales_agent", "toPort": "input" },
        { "id": "c3", "from": "node_orchestrator", "fromPort": "agents_out", "to": "node_rag_agent", "toPort": "input" },
        { "id": "c4", "from": "node_orchestrator", "fromPort": "agents_out", "to": "node_checkout_agent", "toPort": "input" },
        { "id": "c5", "from": "node_skill_catalog", "fromPort": "skill_out", "to": "node_sales_agent", "toPort": "skills_in" },
        { "id": "c6", "from": "node_skill_cart", "fromPort": "skill_out", "to": "node_sales_agent", "toPort": "skills_in" },
        { "id": "c7", "from": "node_skill_rag", "fromPort": "skill_out", "to": "node_rag_agent", "toPort": "skills_in" },
        { "id": "c8", "from": "node_skill_checkout", "fromPort": "skill_out", "to": "node_checkout_agent", "toPort": "skills_in" },
        { "id": "c9", "from": "node_checkout_agent", "fromPort": "output", "to": "node_q_name", "toPort": "input" },
        { "id": "c10", "from": "node_q_name", "fromPort": "output", "to": "node_q_phone", "toPort": "input" },
        { "id": "c11", "from": "node_q_phone", "fromPort": "output", "to": "node_q_addr", "toPort": "input" },
        { "id": "c12", "from": "node_q_addr", "fromPort": "output", "to": "node_act_order", "toPort": "input" },
        { "id": "c13", "from": "node_act_order", "fromPort": "output", "to": "node_end_swarm", "toPort": "input" }
      ]
    }'::jsonb
);
