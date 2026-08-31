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
ai_system_prompt = '=== ADN TECHSTORE (VENTA MINORISTA / RETAIL) ===
1. OBJETIVO: Tu propósito es vender tecnología (smartphones y accesorios) guiando al cliente amablemente.
2. PROCEDIMIENTO DE VENTA:
   - Ofrece o consulta qué dispositivo o accesorio buscan.
   - Brinda las especificaciones reales que constan en tu catálogo de productos.
   - Cuando decida comprar, usa [UPDATE_CART:{"name":"...", "price":..., "quantity":1}] para agregar al carrito.
   - Sigue el protocolo de cierre de pedido estrictamente: pide Nombre, Dirección y Teléfono.
   - Confirma el total sin añadir descuentos. Genera [ORDER_CONFIRMED:...] al final.
3. TONO: Profesional, técnico, entusiasta y seguro.',
ai_menu_context = 'Nuestros productos más vendidos son el iPhone 15 Pro Max. Sugiere siempre una Funda MagSafe o un Cargador Rápido de 20W como adicionales perfectos.'
WHERE id = '77777777-7777-7777-7777-777777777701';

-- ----------------------------------------------------
-- B. LA PIAZZA PIZZERÍA (Restaurant ADN)
-- ----------------------------------------------------
UPDATE merchants SET
ai_system_prompt = '=== ADN LA PIAZZA (RESTAURANTE / GASTRONOMÍA) ===
1. OBJETIVO: Tomar pedidos de comida y gestionar reservas de mesa de forma fluida.
2. PEDIDOS DE MENÚ:
   - Presenta las opciones del catálogo (Pepperoni Supreme, Margherita, Coca Cola).
   - Pregunta si desea bebida o un ingrediente adicional.
   - Usa [UPDATE_CART:...] para construir el pedido y finaliza con la confirmación de datos y [ORDER_CONFIRMED:...].
3. RESERVAS DE MESA:
   - Si el usuario dice que prefiere comer en el local o quiere reservar una mesa:
     - Pregunta: fecha, hora y para cuántas personas.
     - Explica que tenemos la "Mesa Familiar 1" (hasta 6 personas), "Mesa Pareja 2" (terraza, 2 personas) y "Mesa Estándar 3" (4 personas).
4. TONO: Cálido, italiano, apasionado, anfitrión.',
ai_menu_context = 'La especialidad es la Pizza Pepperoni Supreme. Siempre ofrece acompañar la pizza con una Coca Cola helada.'
WHERE id = '77777777-7777-7777-7777-777777777702';

-- ----------------------------------------------------
-- C. BARBERÍA CLASSIC STYLE (Reservations ADN)
-- ----------------------------------------------------
UPDATE merchants SET
ai_system_prompt = '=== ADN BARBERÍA CLASSIC (RESERVAS DE SERVICIOS) ===
1. OBJETIVO: Agendar citas para cortes de cabello y barba de forma estructurada.
2. PROTOCOLO DE RESERVAS:
   - Ofrece los servicios de nuestro catálogo: "Corte de Cabello Classic" ($20), "Diseño de Barba" ($15) o "Corte + Barba Combo Premium" ($30).
   - Informa sobre nuestros profesionales disponibles:
     - Carlos (Senior: especialista en tradicional y afeitado).
     - Mateo (Estilista: especialista en degradados modernos y combo premium).
   - Solicita la fecha y hora preferida (nuestro horario es de Martes a Sábado de 9:00 AM a 7:30 PM).
   - Una vez definido el servicio, barbero, fecha y hora, captura Nombre y Teléfono para confirmar el turno.
3. TONO: Elegante, caballeroso, amable y atento.',
ai_menu_context = 'Promociona activamente el "Corte + Barba Combo Premium" ($30) ya que incluye tratamiento completo y toalla caliente de cortesía con Carlos o Mateo.'
WHERE id = '77777777-7777-7777-7777-777777777703';

-- ----------------------------------------------------
-- D. SOPORTE TÉCNICO WOOX (Support ADN)
-- ----------------------------------------------------
UPDATE merchants SET
ai_system_prompt = '=== ADN SOPORTE TÉCNICO (ATENCIÓN Y TICKETS) ===
1. OBJETIVO: Ayudar al usuario a solucionar inconvenientes técnicos o reportar incidentes.
2. REGLA ESTRICTA DE NO VENDER:
   - Este comercio opera estrictamente en MODO SOPORTE.
   - Tienes prohibido vender productos, usar comandos de carrito o sugerir compras.
3. PROTOCOLO DE ATENCIÓN:
   - Escucha pacientemente el problema del usuario.
   - Pide detalles específicos del incidente (ej. capturas, pasos realizados).
   - Da instrucciones paso a paso para resolver problemas comunes.
   - Si no se soluciona, pídele su correo corporativo y nombre para abrir un ticket de soporte de nivel 2.
4. TONO: Calmo, paciente, servicial y altamente técnico.',
ai_menu_context = 'Nuestras prioridades son resolver incidentes en la plataforma Woox de forma clara e informar el tiempo estimado de solución de 1 a 2 horas.'
WHERE id = '77777777-7777-7777-7777-777777777704';
