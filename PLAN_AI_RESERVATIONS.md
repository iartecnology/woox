# 📅 Plan de Implementación Maestro: Woox AI Reservation Engine

Un motor de reservas omnicanal gestionado 100% por agentes de IA, capaz de manejar desde una cita médica hasta la reserva de un hotel boutique, directamente a través de WhatsApp, Telegram o Web.

---

## 🧐 1. Análisis Profundo de los Tipos de Reservas (Core Models)

Para que el modelo de base de datos y la IA funcionen perfectamente, debemos agrupar las reservas según su "Física de Tiempo y Espacio". Has mencionado 4 excelentes tipos, y **hemos identificado 2 modelos adicionales que completan el 100% del mercado**.

### 🕐 Modelo A: Reservas por Citas / Bloques de Tiempo (Time-Slot Booking)
* **Casos de uso:** Odontólogos, Barberías, Spa, Abogados, Asesorías.
* **Dinámica:** Un cliente agenda a un `profesional` o `recurso` en un horario específico (ej. Martes 3:00 PM por 45 minutos).
* **Parámetros Críticos:** 
  * Duración del servicio.
  * Horarios de atención (Business hours).
  * Tiempo de colchón (buffer time) entre citas.
* **El Rol de la IA:** "Hola, tenemos cupo con el Dr. Pérez el martes a las 3pm o 4pm. ¿Cuál prefieres?" -> La IA valida colisiones en tiempo real.

### 🍽️ Modelo B: Reservas por Capacidad y Mesas (Table / Site Booking)
* **Casos de uso:** Restaurantes, Discotecas, Eventos VIP, Zonas de Coworking.
* **Dinámica:** Un cliente reserva un "espacio físico" en una ventana de tiempo, pero el sistema debe validar si la *capacidad total* del lugar o la disposición de camas/mesas puede aguantar el número de `pax` (personas).
* **Parámetros Críticos:** 
  * Tamaño del grupo (Party size).
  * Distribución de mesas/espacios (Floor plan).
  * Turnos (ej: Cena de 7pm a 9pm o de 9pm a 11pm).
* **El Rol de la IA:** "Para 6 personas este viernes solo nos queda mesa en la terraza a las 8:00 PM. ¿Te la separo?"

### 🏘️ Modelo C: Reservas Únicas de Espacios (Estilo Airbnb / Rentas Cortas)
* **Casos de uso:** Alquiler de cabañas, apartamentos vacacionales, casas campestres.
* **Dinámica:** Es una reserva por días o noches de un activo que es "Único" (Inventario = 1). Si la Cabaña VIP está ocupada el 15 de marzo, nadie más puede tomarla.
* **Parámetros Críticos:** 
  * Tarifa dinámica por temporada/fin de semana.
  * Restricción de noches mínimas (ej. mínimo 2 noches).
  * Check-in / Check-out gaps.
* **El Rol de la IA:** "La Cabaña VIP está disponible del 14 al 17 de marzo por $300. Te envío el link de pago para bloquear tus fechas."

### 🏨 Modelo D: Reservas por Categorías con Múltiple Inventario (Estilo Booking.com / Hoteles)
* **Casos de uso:** Hoteles tradicionales, Hostales, Glampings con múltiples domos iguales.
* **Dinámica:** A diferencia de Airbnb, aquí el inventario no es de 1. El hotel tiene 15 "Habitaciones Standard" y 5 "Suites". Mientras el inventario de la fecha consultada sea > 0, se pueden aceptar reservas.
* **Parámetros Críticos:** 
  * Tipos de habitación (Room types).
  * Control de inventario diario.
  * Overbooking (opcional) y cancelaciones.
* **El Rol de la IA:** "Tenemos 3 habitaciones Standard y 1 Suite disponibles para este puente festivo. ¿Cuántas habitaciones necesitas?"

### 🚀 (NUEVO) Modelo E: Alquiler de Recursos / Inventario Tangible
* **Casos de uso:** Rent a Car, Alquiler de Maquinaria, Alquiler de Vestidos.
* **Dinámica:** Reservas cruzando fechas pero atadas al stock físico.

### 🧘‍♀️ (NUEVO) Modelo F: Clases Grupales / Eventos (One-to-Many)
* **Casos de uso:** Clases de Yoga, Webinars, Eventos presenciales, Talleres.
* **Dinámica:** Ya existe una franja horaria pre-creada (Sábado 10 AM) y tiene un inventario de "X cupos". Los usuarios reservan "asientos", no crean la franja.

---

## ⚙️ 2. Arquitectura de Base de Datos para el Motor Omnicanal

Para no construir 6 sistemas diferentes, necesitamos hacer una base de datos maestra muy abstracta. 

**Tablas Core Propuestas en Supabase:**

1. **`reservable_resources` (Lo que se alquila):**
   * Tipos: `service` (Corte de pelo), `table` (Mesa de 4), `property` (Cabaña), `room_type` (Suite), `class` (Yoga).
   * Contiene duración, capacidad máxima, precio base, y merchant_id.

2. **`availability_schedules` (Las Reglas):**
   * Define cuándo el recurso está disponible (L-V, 8am-5pm) y fechas bloqueadas por vacaciones o mantenimiento.

3. **`bookings` (La Reserva Central):**
   * `id`
   * `merchant_id` & `customer_id`
   * `resource_id` (Lo que se reservó)
   * `start_time` (Fecha/hora inicio)
   * `end_time` (Fecha/hora fin)
   * `status` (pending, confirmed, cancelled, completed)
   * `pax` (Cantidad de personas)
   * `channel` (whatsapp, telegram, landing_page) -> ¡Omnicanalidad!

---

## 🤖 3. Integración con Agentes de IA (El Flujo de la Conversación)

Para que el bot gestione esto nativamente en WhatsApp o Telegram sin herramientas lentas, implementaremos un sistema de habilidades (Skills) en la IA llamado **`[CHECK_AVAILABILITY]`** y **`[CREATE_BOOKING]`**.

### Flujo IA Paso a Paso (Ejemplo: Restaurante Modelo B):

1. **Intención:** Cliente dice: *"Quiero una mesa para 4 personas el viernes por la noche."*
2. **Acción Oculta IA (Paso 1):** El LLM emite un comando oculto: `[CHECK_AVAILABILITY: {"type": "table", "pax": 4, "date": "2026-02-27", "time_preference": "evening"}]`.
3. **Respuesta del Webhook:** El código en Node.js consulta Supabase y le devuelve a la IA (en formato sistema): `[SYSTEM: Quedan mesas a las 19:00 y 21:00]`.
4. **Respuesta IA al Usuario:** *"Tengo disponibilidad el viernes a las 7:00 PM o a las 9:00 PM. ¿Cuál horario prefieres?"*
5. **Confirmación:** Cliente: *"A las 7pm está perfecto."*
6. **Acción Oculta IA (Paso 2):** Pide los datos (Nombre, Tel, requerimientos especiales).
7. **Acción Oculta IA (Paso Final):** El LLM emite: `[CREATE_BOOKING: {"resource_id": "uuid", "pax": 4, "start": "2026-02-27T19:00:00", "end": "2026-02-27T21:00:00"}]`.
8. **Respuesta Final:** *"¡Listo! Tu reserva está confirmada. Nos vemos el viernes."*

---

## 📝 4. Plan de Tareas de Implementación (Roadmap)

### Fase 1: Motor Core en Supabase (✅ COMPLETADO)
- [x] Diseñar el esquema de base de datos (`reservable_resources`, `availability_schedules`, `bookings`).
- [x] Crear funciones RPC (SQL) para cálculo de disponibilidad de alto rendimiento. Las consultas de disponibilidad son costosas, las RPCs en Postgres son ultrarrápidas y evitan que la IA "piense" mucho tiempo.

### Fase 2: Módulo Backoffice para el Comercio (Dashboard) (✅ COMPLETADO)
- [x] UI Calendario de Reservas (Vista Semanal / Mensual).
- [x] Creador de Recursos (El comercio define sus horarios, mesas o habitaciones).
- [x] Sistema de bloqueo de fechas manual.

### Fase 3: Integración de la Skill IA en Webhooks (✅ COMPLETADO)
- [x] Extender el webhook actual (Telegram/WhatsApp) para escuchar los comandos `[CHECK_AVAILABILITY]` y `[CREATE_BOOKING]`.
- [x] Entrenar el System Prompt base con reglas de agendamiento. para que la IA actúe como un recepcionista experto (nunca sobre-venda y ofrezca alternativas si no hay cupo).

### Fase 4: Integración Omnicanal (IA Landing)
- [ ] Desarrollar el componente web `<BookingWidget />` para que las páginas generadas en *Woox AI Landing* expongan un calendario clásico para quienes no quieran usar WhatsApp.
- [ ] Conectar la reserva web con el cerebro central: Si entra una reserva web, el bot notifica al cliente por WhatsApp: *"Hola, vimos que hiciste una reserva en nuestra web para mañana..."*

### Fase 5: Manejo Inteligente de Estados (CRM Activo)
- [ ] *Recordatorio 24h antes:* Tarea cron enviando un WhatsApp automático: "Hola, recuerda tu reserva mañana, ¿confirmas tu asistencia?".
- [ ] *Cancelación por IA:* Si el usuario responde "No puedo ir", la IA cambia el status a `cancelled` y libera el cupo automáticamente en Supabase.
