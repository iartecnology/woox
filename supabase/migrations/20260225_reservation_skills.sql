-- ============================================================
-- WOOX - Skills de Reservaciones e IA
-- Habilita la capacidad de agendar citas, mesas y recursos.
-- ============================================================

INSERT INTO public.skills_catalog (slug, name, description, category, system_prompt_fragment) VALUES
(
  'availability_check', 
  'Consulta de Disponibilidad', 
  'Habilita la capacidad de consultar horarios y recursos disponibles en tiempo real.', 
  'reservations',
  '### HABILIDAD: CONSULTA DE DISPONIBILIDAD
1. **PASO 1**: Identifica el recurso (ID) que el usuario quiere (si es global, pide por un servicio o doctor específico).
2. **PASO 2**: Pide la fecha y HORA deseada si no la tienes.
3. **COMANDO TÉCNICO**: Inmediatamente pide verificación usando:
   `[CHECK_AVAILABILITY: {"resource_id": "UUID", "start": "YYYY-MM-DD HH:MM", "pax": 1}]`
4. **RESPUESTA**: Si el sistema dice "available: true", dile al usuario que sí hay cupo y procede al agendamiento.'
),
(
  'booking_management', 
  'Gestión de Reservas', 
  'Habilita la capacidad de crear y confirmar reservas en la base de datos.', 
  'reservations',
  '### HABILIDAD: GESTIÓN DE RESERVAS
1. **REQUISITOS**: Necesitas Nombre y Teléfono.
2. **REGISTRO**: Genera el comando:
   `[CREATE_BOOKING: {"resource_id": "UUID", "start": "YYYY-MM-DD HH:MM", "pax": 1, "name": "...", "phone": "..."}]`
3. **FINALIZACIÓN**: Una vez emitido el comando, confirma al cliente que su cita ha sido agendada con éxito.'
)
ON CONFLICT (slug) DO UPDATE SET 
    system_prompt_fragment = EXCLUDED.system_prompt_fragment,
    name = EXCLUDED.name,
    description = EXCLUDED.description;
