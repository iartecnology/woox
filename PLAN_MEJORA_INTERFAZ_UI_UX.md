# Plan Maestro de Modernización de Interfaz (UI/UX) — Woox SaaS

Este documento reúne de forma exhaustiva y estructurada **todo el plan de modernización de interfaz**, combinando la arquitectura global del SaaS (Shell, Navegación, Design System y Zero-States) con la optimización profunda y especializada de las pantallas operativas del comerciante: **Chats en Vivo (`/chats`)** y **Gestión de Pedidos (`/orders`)**.

---

## 📅 Fase 1: Arquitectura de Navegación y Shell Desktop/Mobile
**Objetivo:** Reducir la sobrecarga cognitiva, organizar el menú en bloques de negocio claros y corregir el comportamiento en pantallas de escritorio y rutas públicas.

### 1.1 Sidebar Estructurado por Secciones Semánticas:
- **🔴 Operación Diaria (Ventas & Clientes):**
  - 💬 **Chats en Vivo** *(con badge reactivo de no leídos en tiempo real)*
  - 🛵 **Pedidos & Entregas** *(con badge de órdenes pendientes)*
  - 📅 **Agenda / Reservas** *(visible según industria)*
  - 👥 **Clientes (CRM)**
- **🚀 Crecimiento & Marketing:**
  - 📊 **Estadísticas & ROI** *(ventas por IA, conversión y consumo)*
  - 📢 **Campañas de Remarketing**
  - 🍱 **Catálogo de Productos**
  - 🔗 **BioLink** & 🪄 **AI Landing**
- **⚙️ Inteligencia & Ajustes:**
  - 🧬 **ADN (Constructor de Flujos IA)**
  - 🧠 **Cerebro de Empresa (RAG Knowledge)**
  - 🔌 **Canales Omnicanal** (WhatsApp, Telegram, IG, Messenger)
  - ⚙️ **Automatización & Proveedores LLM**

### 1.2 Sidebar Híbrido (Desktop vs Mobile):
- En monitores y laptops (pantallas `> 1024px`), ofrecer la opción de fijar el Sidebar lateral sin tapar la pantalla con backdrop oscuro, permitiendo colapsarlo a modo mini-iconos para maximizar el área de trabajo.
- En dispositivos móviles, mantener el menú lateral deslizante con overlay y la barra inferior de accesos rápidos (*Bottom Navigation Bar*).

### 1.3 Aislamiento de Rutas Públicas en Shell (`app.ts` y `app.html`):
- Corregir en [`app.ts`](file:///Users/ric/Documents/RIC/ANTIGRAVITY/Woox/src/app/app.ts) la propiedad `isPublicPage` para excluir de la barra de navegación y del sidebar tanto a `/login`, `/register`, `/p/:slug` como a `/bio/:slug`.

---

## 🎨 Fase 2: Design System & Consistencia Dark/Light Mode
**Objetivo:** Estandarizar la identidad visual en toda la suite SaaS, erradicar parches de color y lograr un acabado premium estilo Linear/Raycast/Supabase.

### 2.1 Tokens Globales en [`styles.css`](file:///Users/ric/Documents/RIC/ANTIGRAVITY/Woox/src/styles.css):
- Reemplazar los estilos fijos en línea (`style="background: white; color: #111827"`) en `order-management`, `customer-crm`, `super-admin` y `metrics-dashboard` por clases utilitarias basadas en variables CSS semánticas:
  - **Superficies:** `--bg-primary`, `--bg-secondary`, `--bg-card`, `--bg-elevated`, `--modal-bg`.
  - **Tipografía:** `--text-primary`, `--text-secondary`, `--text-muted`, `--text-accent`.
  - **Bordes y divisores:** `--border-subtle`, `--border-color`, `--border-focus`.
- Soporte íntegro y sin fallos de legibilidad para el **Modo Oscuro (`[data-theme="dark"]`)**.

### 2.2 Elevación y Glassmorphism Pulido:
- Sombras suaves estandarizadas (`box-shadow: 0 10px 30px -10px rgba(0,0,0,0.08)`).
- Bordes redondeados modernos (`border-radius: 16px` para tarjetas, `12px` para controles).
- Microinteracciones con transiciones sutiles (`transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1)`).

---

## 💡 Fase 3: Estados Vacíos (Zero States) y Guiado Proactivo
**Objetivo:** Guiar y activar al comerciante desde su primer inicio de sesión para que configure su bot y empiece a vender.

### 3.1 Tarjetas de Activación Inicial (Zero-Data States):
- **Pedidos vacíos (`/orders`):**
  - Ilustración y mensaje motivador: *"Aún no tienes pedidos registrados. Conecta tu WhatsApp o prueba el simulador para cerrar tu primera venta asistida por IA."*
  - Botones directos de acción: `[🚀 Abrir Simulador de Pruebas]` y `[📲 Conectar WhatsApp]`.
- **Catálogo vacío (`/products`):**
  - *"Sube tus primeros productos o impórtalos para que la IA pueda ofrecerlos en el menú y cerrar pedidos automáticamente."*
  - Botón: `[+ Crear Primer Producto]`.
- **CRM vacío (`/crm`):**
  - *"Tus clientes aparecerán aquí automáticamente en cuanto interactúen por chat con tu agente IA o realicen un pedido."*
- **Chats vacíos (`/chats`):**
  - *"Tu centro omnicanal está esperando mensajes. Inicia una conversación desde el simulador para probar tus flujos."*

---

## 💬 Fase 4: Optimización Profunda de la Pantalla de Chats (`/chats`)
**Objetivo:** Operación ágil, prevención de errores confidenciales y soporte al cierre de ventas.

### 4.1 Jerarquía Visual y Ergonómica del Inbox (Panel 1):
- Nombre del cliente en negrita y tipografía limpia.
- Fragmento del último mensaje truncado a 1 línea con indicador de estado (leído, pendiente).
- Micro-badge distintivo del canal (WhatsApp verde oficial, Telegram azul, Instagram degradado, Simulador cohete).
- Marca de tiempo relativa clara (`hace 3m`, `14:20`).
- Pastillas de filtrado limpias: `Todos`, `🤖 Atendido por IA`, `👤 Esperando Humano`.

### 4.2 Caja de Entrada Segura con Distinción Fuerte (Chat vs. Nota Interna):
- Al activar **"Nota Interna"**, el fondo de la caja cambia a ámbar claro (`#fffbeb`), con borde naranja y advertencia:
  - *"🔒 NOTA PRIVADA — Solo visible para el equipo. El cliente NO verá este mensaje."*
- Evita fugas de información accidental hacia el cliente de WhatsApp.

### 4.3 Panel CRM Lateral Plegable (Drawer Inteligente - Panel 3):
- Botón en la cabecera del chat `[ℹ️ Info Cliente]` para contraer o expandir la ficha CRM.
- Permite que el hilo de conversación use el 100% del espacio en portátiles o tablets.

### 4.4 Respuestas Rápidas (Snippets de Ventas):
- Acceso rápido a textos frecuentes con 1 clic: cuentas bancarias para transferencias, ubicación física, horarios de apertura y enlaces de catálogo.

---

## 🛵 Fase 5: Optimización Profunda de la Pantalla de Pedidos (`/orders`)
**Objetivo:** Panel de cocina y despacho de alta velocidad en tiempo real con trazabilidad de ventas por IA.

### 5.1 Sello de Atribución IA y Origen del Pedido:
- Cada tarjeta y fila de pedido indicará de forma inequívoca si fue:
  - `🤖 Cerrado por IA` (venta autónoma del bot).
  - `👤 Pedido Manual / Agente`.
- Icono del canal de procedencia (WhatsApp, Web, BioLink).

### 5.2 Semáforo de Tiempo Transcurrido (SLA de Despacho):
- Contador visual de frescura del pedido para evitar clientes insatisfechos por retrasos:
  - 🟢 **Normal**: `< 15 min`.
  - 🟡 **En Espera**: `15 - 30 min`.
  - 🔴 **Urgente / Retrasado**: `> 30 min` (con alerta visual).

### 5.3 Impresión Rápida de Comanda Térmica (58mm / 80mm):
- Botón directo `[🖨️ Imprimir Comanda]` formateado para impresoras térmicas de cocina o recibos de despacho, con desglose de productos, adicionales e instrucciones especiales.

### 5.4 Notificación Directa al Cliente por WhatsApp:
- Botón contextual para enviar la actualización de estado al WhatsApp del cliente con 1 solo clic:
  - *"¡Hola {{cliente}}! Tu pedido #{{id}} está en cocina / en camino con el repartidor 🛵"*.

### 5.5 Totales Acumulados en Cabeceras Kanban:
- En cada columna (*Confirmar Pago*, *En Cocina*, *Listos*), mostrar no solo el conteo de pedidos sino la suma en dinero: `En Cocina: 4 pedidos ($185.000)`.

---

## 🏢 Fase 6: Modales Extensos y Formularios en SuperAdmin & Configuración
**Objetivo:** Navegabilidad fluida en ajustes avanzados sin formularios infinitos.

### 6.1 Navegación por Pestañas en Formularios Complejos:
- Transformar modales con más de 20-30 inputs en diálogos organizados por pestañas:
  - 📋 **General:** Nombre, slug, tipo de industria, logo, teléfono.
  - 🤖 **Inteligencia Artificial:** Proveedor (Gemini, OpenAI, Groq, Ollama), modelo, prompt del sistema, temperatura.
  - 📲 **Canales & WhatsApp:** Meta Cloud API, Evolution API / QR, Webhooks.
  - 📦 **Plan & Límites:** Suscripción, tokens mensuales, capacidades.

---

## 🚀 Fase 7: Verificación de Calidad y Despliegue en Git
**Objetivo:** Garantizar estabilidad técnica total y publicar en las dos ramas principales.

1. Verificación estricta de compilación con TypeScript (`npx tsc --noEmit`).
2. Validación de adaptabilidad responsive (Móvil, Tablet, Monitor de Escritorio).
3. Prueba de compatibilidad en Modo Claro y Modo Oscuro.
4. Commit y Push sincronizado a las ramas **`develop`** y **`main`**.
