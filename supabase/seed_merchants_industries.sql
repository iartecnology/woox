-- ==============================================================================
-- WOOX - SCRIPT DE SEMILLA DE COMERCIOS DEMO POR INDUSTRIA
-- ==============================================================================

-- 1. Limpieza de datos existentes de comercios (CASCADE elimina categorías, productos, bloques de conocimiento, etc.)
TRUNCATE TABLE merchants CASCADE;

-- 2. Insertar los 4 Comercios Demo (TechStore, La Piazza, Barbería, Soporte)
INSERT INTO merchants (id, name, slug, industry_type, primary_color, is_active, ai_enabled, ai_personality, ai_welcome_message, agent_id) VALUES
(
  '77777777-7777-7777-7777-777777777701',
  'TechStore Woox',
  'techstore-demo',
  'retail',
  '#0EA5E9',
  true,
  true,
  'Profesional, tecnológico y resolutivo.',
  '¡Bienvenido a TechStore! 📱 ¿Buscas algún dispositivo o accesorio tecnológico hoy?',
  '00000000-0000-0000-0000-000000000001'
),
(
  '77777777-7777-7777-7777-777777777702',
  'La Piazza Pizzería',
  'lapiazza-demo',
  'restaurant',
  '#EF4444',
  true,
  true,
  'Alegre, apasionado por la comida italiana y muy servicial.',
  '¡Hola! 🍕 Bienvenidos a La Piazza. ¿Estás listo para ordenar una deliciosa pizza hecha en horno de piedra?',
  '00000000-0000-0000-0000-000000000001'
),
(
  '77777777-7777-7777-7777-777777777703',
  'Barbería Classic Style',
  'barberia-demo',
  'reservations',
  '#F59E0B',
  true,
  true,
  'Estiloso, carismático, educado y cortés.',
  '¡Qué tal! 💈 Bienvenido a Barbería Classic. ¿Te gustaría agendar una cita para un corte de cabello o perfilado de barba hoy?',
  '00000000-0000-0000-0000-000000000001'
),
(
  '77777777-7777-7777-7777-777777777704',
  'Soporte Técnico Woox',
  'soporte-demo',
  'support',
  '#10B981',
  true,
  true,
  'Metódico, paciente, analítico y sumamente servicial.',
  '¡Hola! 🔧 Bienvenido al canal de soporte oficial. Por favor indícame tu inconveniente técnico para poder ayudarte.',
  '00000000-0000-0000-0000-000000000001'
);

-- 3. Categorías de productos/servicios
INSERT INTO categories (id, merchant_id, name, display_order) VALUES
-- TechStore
('11111111-1111-1111-1111-111111111101', '77777777-7777-7777-7777-777777777701', 'Smartphones', 1),
('11111111-1111-1111-1111-111111111102', '77777777-7777-7777-7777-777777777701', 'Accesorios', 2),
-- La Piazza
('22222222-2222-2222-2222-222222222201', '77777777-7777-7777-7777-777777777702', 'Pizzas Especiales', 1),
('22222222-2222-2222-2222-222222222202', '77777777-7777-7777-7777-777777777702', 'Bebidas', 2),
-- Barbería
('33333333-3333-3333-3333-333333333301', '77777777-7777-7777-7777-777777777703', 'Cortes de Cabello', 1),
('33333333-3333-3333-3333-333333333302', '77777777-7777-7777-7777-777777777703', 'Tratamientos de Barba', 2);

-- 4. Productos y servicios
INSERT INTO products (id, merchant_id, category_id, name, price, description, is_available) VALUES
-- TechStore
('11111111-2222-3333-4444-555555555501', '77777777-7777-7777-7777-777777777701', '11111111-1111-1111-1111-111111111101', 'iPhone 15 Pro Max', 1200.00, 'De 256GB en color Titanio Natural.', true),
('11111111-2222-3333-4444-555555555502', '77777777-7777-7777-7777-777777777701', '11111111-1111-1111-1111-111111111102', 'Funda MagSafe Silicón', 59.00, 'Funda protectora con imanes MagSafe integrados.', true),
('11111111-2222-3333-4444-555555555503', '77777777-7777-7777-7777-777777777701', '11111111-1111-1111-1111-111111111102', 'Cargador Rápido 20W', 29.00, 'Adaptador de corriente USB-C de 20W de carga rápida.', true),
-- La Piazza
('22222222-2222-3333-4444-555555555501', '77777777-7777-7777-7777-777777777702', '22222222-2222-2222-2222-222222222201', 'Pizza Pepperoni Supreme', 14.99, 'Salsa de tomate casera, queso mozzarella premium, pepperoni abundante y orégano.', true),
('22222222-2222-3333-4444-555555555502', '77777777-7777-7777-7777-777777777702', '22222222-2222-2222-2222-222222222201', 'Pizza Margherita', 12.99, 'Salsa de tomate, rodajas de tomate fresco, queso mozzarella fresco y hojas de albahaca.', true),
('22222222-2222-3333-4444-555555555503', '77777777-7777-7777-7777-777777777702', '22222222-2222-2222-2222-222222222202', 'Coca Cola Lata', 2.50, 'Coca Cola original helada de 350ml.', true),
-- Barbería
('33333333-2222-3333-4444-555555555501', '77777777-7777-7777-7777-777777777703', '33333333-3333-3333-3333-333333333301', 'Corte de Cabello Classic', 20.00, 'Corte clásico a tijera y máquina con lavado y peinado incluido.', true),
('33333333-2222-3333-4444-555555555502', '77777777-7777-7777-7777-777777777703', '33333333-3333-3333-3333-333333333302', 'Diseño de Barba con Toalla Caliente', 15.00, 'Perfilado de barba con navaja libre, hidratación y ritual de toalla caliente.', true),
('33333333-2222-3333-4444-555555555503', '77777777-7777-7777-7777-777777777703', '33333333-3333-3333-3333-333333333301', 'Corte + Barba Combo Premium', 30.00, 'El servicio completo definitivo para el cuidado masculino.', true);

-- 5. Bloques de conocimiento específicos (merchant_context_blocks)
INSERT INTO merchant_context_blocks (merchant_id, title, content) VALUES
-- TechStore
('77777777-7777-7777-7777-777777777701', 'Horario de Atención', 'Lunes a Sábado de 10:00 AM a 8:00 PM. Domingos cerrado.'),
('77777777-7777-7777-7777-777777777701', 'Ubicación y Contacto', 'Centro Comercial TechPlaza, Local 45. Teléfono: +57 300 123 4567.'),
('77777777-7777-7777-7777-777777777701', 'Políticas de Garantía', 'Todos nuestros dispositivos tienen 1 año de garantía directamente con el fabricante por defectos de fábrica.'),
-- La Piazza
('77777777-7777-7777-7777-777777777702', 'Horarios de Servicio', 'Abierto todos los días de 12:00 PM a 10:30 PM.'),
('77777777-7777-7777-7777-777777777702', 'Ubicación de la Pizzería', 'Calle de la Salsa #22-10, Zona Gastronómica. Domicilios al +57 301 987 6543.'),
('77777777-7777-7777-7777-777777777702', 'Reservas de Mesas', 'Puedes reservar mesas directamente indicándome la fecha, hora y número de comensales.'),
-- Barbería
('77777777-7777-7777-7777-777777777703', 'Horarios de Turnos', 'Martes a Sábado de 9:00 AM a 7:30 PM. Domingos y Lunes cerrado.'),
('77777777-7777-7777-7777-777777777703', 'Dirección del Local', 'Avenida Central #45-12, Piso 1. Citas al WhatsApp +57 302 456 7890.'),
-- Soporte
('77777777-7777-7777-7777-777777777704', 'Tiempos de Respuesta', 'Nivel de respuesta estándar: 1 a 2 horas para tickets prioritarios.'),
('77777777-7777-7777-7777-777777777704', 'Contacto y Horario', 'Atención de incidentes técnicos 24/7 para clientes corporativos.');

-- 6. Usuarios Administradores para cada Comercio (email, password=admin123, role=merchant_admin)
INSERT INTO profiles (email, password, full_name, role, merchant_id, is_active) VALUES
('retail@woox.app', 'admin123', 'Administrador TechStore', 'merchant_admin', '77777777-7777-7777-7777-777777777701', true),
('restaurant@woox.app', 'admin123', 'Administrador La Piazza', 'merchant_admin', '77777777-7777-7777-7777-777777777702', true),
('reservations@woox.app', 'admin123', 'Administrador Barbería', 'merchant_admin', '77777777-7777-7777-7777-777777777703', true),
('support@woox.app', 'admin123', 'Administrador Soporte', 'merchant_admin', '77777777-7777-7777-7777-777777777704', true)
ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password, role = EXCLUDED.role, merchant_id = EXCLUDED.merchant_id;
