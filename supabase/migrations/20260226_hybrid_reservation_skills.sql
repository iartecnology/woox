-- ============================================================
-- WOOX - Skills de Protocolos por Industria (Reservaciones)
-- Separa la lógica de "Cómo preguntar" (Protocolo) de la 
-- lógica de "Cómo ejecutar" (Motor Técnico).
-- ============================================================

-- 1. Refinar Motores Técnicos (Habilidades Universales)
INSERT INTO public.skills_catalog (slug, name, description, category, system_prompt_fragment) VALUES
(
  'engine_availability', 
  'Motor de Disponibilidad', 
  'Capa técnica para consultar huecos libres. El agente DEBE usar el comando una vez tenga fecha y recurso.', 
  'reservations_engine',
  '### MOTOR TÉCNICO: DISPONIBILIDAD
1. **PASO 1 (IDENTIFICACIÓN)**: Identifica el recurso (ID) que el usuario necesita. Si no especifica una mesa/doctor, muéstrale las opciones y sus IDs.
2. **PASO 2 (CONSULTA TÉCNICA)**: Una vez tengas fecha y hora, USA:
   `[CHECK_AVAILABILITY: {"resource_id": "UUID", "start": "YYYY-MM-DD HH:MM", "pax": 1}]`
3. **PASO 3 (MOSTRAR OPCIONES)**: Si el sistema dice "available: false" o si el usuario pregunta "qué hay libre", consulta el bloque del día y muéstrale una lista clara de al menos 3 horarios disponibles con sus respectivos IDs de recurso para que el usuario escoja.'
),
(
  'engine_booking', 
  'Motor de Reservas', 
  'Capa técnica para insertar reservas. Se dispara SOLO tras confirmar disponibilidad y obtener datos del cliente.', 
  'reservations_engine',
  '### MOTOR TÉCNICO: REGISTRO
- Cuando el cliente confirme y tengas su Nombre/Teléfono, USA:
  `[CREATE_BOOKING: {"resource_id": "UUID", "start": "YYYY-MM-DD HH:MM", "pax": 1, "name": "...", "phone": "..."}]`
- Al recibir confirmación, da un número de reserva (si existe) o confirma éxito.'
)
ON CONFLICT (slug) DO UPDATE SET 
    system_prompt_fragment = EXCLUDED.system_prompt_fragment;

-- 2. Crear Protocolos de Diálogo por Industria
INSERT INTO public.skills_catalog (slug, name, description, category, system_prompt_fragment) VALUES
(
  'proto_restaurant', 
  'Protocolo de Restaurante', 
  'Lógica de atención para mesas y gastronomía.', 
  'reservations_protocol',
  '### PROTOCOLO: RESTAURANTE
- **FLUJO**: Saluda -> Pregunta cuántas personas (Pax) -> Pregunta preferencia (Interior/Terraza) -> **Pregunta Fecha y Hora exacta** -> Valida disponibilidad.
- **DETALLE**: Si son más de 8 personas, advierte que la mesa está sujeta a confirmación manual del gerente.
- **COMUNICA**: Menciona que el tiempo de espera máximo es de 15 minutos.'
),
(
  'proto_hotel', 
  'Protocolo de Hotel / Hosting', 
  'Lógica de atención para alojamiento y check-in.', 
  'reservations_protocol',
  '### PROTOCOLO: ALOJAMIENTO
- **FLUJO**: Pregunta fecha de entrada (Check-in) y salida (Check-out) -> Pregunta número de adultos y niños -> Muestra opciones de habitación.
- **VALIDACIÓN**: Asegura que la reserva sea de al menos 1 noche.
- **SERVICIOS**: Menciona si incluye desayuno y pregunta si requieren parqueadero.'
),
(
  'proto_medical', 
  'Protocolo de Salud / Médico', 
  'Lógica para consultorios y especialistas.', 
  'reservations_protocol',
  '### PROTOCOLO: SALUD
- **IMPORTANTE**: No des consejos médicos. Solo agendas.
- **FLUJO**: Pregunta motivo de la consulta -> Pregunta si es primera vez o control -> Verifica si usa seguro médico o es particular.
- **PREPARACIÓN**: Informa al paciente si debe llegar 15 minutos antes para trámites administrativos.'
),
(
  'proto_sports', 
  'Protocolo de Canchas / Deporte', 
  'Lógica para alquiler de espacios deportivos.', 
  'reservations_protocol',
  '### PROTOCOLO: DEPORTES
- **REGLA**: El alquiler es por bloques de 1 hora mínima.
- **FLUJO**: Pregunta tipo de cancha -> Pregunta si necesitan alquiler de equipo (balones, raquetas) -> Valida horario.
- **PAGO**: Informa que la reserva se mantiene por 10 minutos sin pago previo.'
),
(
  'proto_coworking', 
  'Protocolo de Coworking', 
  'Lógica para oficinas y puestos de trabajo.', 
  'reservations_protocol',
  '### PROTOCOLO: COWORKING
- **OPCIONES**: Diferencia entre Hot Desk (puesto libre), Oficina Privada y Sala de Juntas.
- **FLUJO**: Pregunta duración (Horas o Día completo) -> Pregunta si requieren servicios extra (Video beam, café, impresión).
- **ACCESO**: Informa que el acceso es con código digital enviado al agendar.'
)
ON CONFLICT (slug) DO UPDATE SET 
    system_prompt_fragment = EXCLUDED.system_prompt_fragment;
