# 🚀 WOOX: Ecosistema Omnicanal de Ventas con IA

Woox es una plataforma empresarial diseñada para automatizar las ventas y la atención al cliente en múltiples canales (WhatsApp, Telegram, Facebook Messenger) utilizando Inteligencia Artificial avanzada (Google Gemini / OpenAI).

## 🧩 Arquitectura del Sistema
- **Frontend**: Angular 18 con diseño premium (Glassmorphism, Dark Mode).
- **Backend**: Supabase (PostgreSQL, Auth, Edge Functions).
- **IA**: Motores integrados de Google Generative AI (Gemini Flash/Pro) y OpenAI (GPT-4o).
- **Infraestructura**: Despliegue mediante Docker & Edge Computing.

---

## 🛠️ Funcionalidades Core

### 1. 🤖 IA Sales Agents (Agentes de Venta)
- **Omnicanalidad**: Un solo agente puede atender WhatsApp, Telegram y Messenger simultáneamente.
- **Entrenamiento Personalizado**: 
    - **System Prompt**: Define la personalidad y el "mood" del agente.
    - **Contexto de Marca**: Información específica de la empresa.
    - **Restricciones de Seguridad**: Filtros anti-inyección para evitar que la IA sea manipulada.
- **Protocolo de Cierre Estricto**: La IA no solo responde dudas, sino que guía al cliente hasta generar un ticket de compra con nombre, dirección y teléfono.

### 2. 🛍️ Gestión de Catálogo & Productos
- **Categorización**: Organización de productos por categorías (ej: Entradas, Platos Fuertes, Bebidas).
- **Inventario IA**: La IA tiene acceso en tiempo real al catálogo, precios y disponibilidad.
- **Formateo Dinámico**: Envío automático de menús formateados con negritas y emojis optimizados para cada plataforma.

### 3. 💬 Centro de Mensajería (Live Chat)
- **Dashboard Unificado**: Visualización de todas las conversaciones entrantes de todos los canales en un solo lugar.
- **Control de IA**: Switch para activar/desactivar la IA en conversaciones específicas para intervención humana.
- **Historial de Mensajes**: Registro completo de interacciones (Cliente vs IA vs Humano).

### 4. 📦 Gestión de Pedidos (Orders)
- **Captura Automática**: Cuando la IA detecta una confirmación, genera un objeto `[ORDER_CONFIRMED]` que se inserta automáticamente en la base de datos.
- **Dashboard de Pedidos**: Seguimiento de estado (Pendiente, Preparando, Enviado, Completado).
- **Asignación de Clientes**: Creación automática de perfiles de cliente con historial de compras.

### 5. 🏗️ Panel Super Admin (Multi-tenant)
- **Gestión de Comercios (Merchants)**: Creación y configuración de múltiples empresas independientes.
- **Configuración de Canales**: 
    - **WhatsApp**: Conexión vía Meta API (Permanent Tokens, Phone IDs).
    - **Telegram**: Integración con BotFather.
    - **Facebook**: Messenger API con Page Access Tokens.
- **Gestión de Perfiles**: Control de acceso basado en roles (SuperAdmin, MerchantAdmin, Operator).
- **Inicialización de DB**: Scripts automáticos para migración y creación de esquemas.

---

## 📈 Funcionalidades Premium / Marketing
- **Re-marketing Automatizado**: Capacidad de enviar mensajes de seguimiento tras X tiempo de inactividad.
- **Agentes Especializados**: Selección de modelos específicos (Flash para velocidad, Pro para razonamiento complejo).
- **Branding Personalizado**: Colores y logotipos dinámicos por cada comercio.

## 🔗 Integraciones Técnicas
- **Webhooks**: Sistema de verificación instantánea y handshake con Meta/Telegram.
- **Edge Functions**: Lógica de procesamiento de mensajes distribuida para baja latencia.
- **Deduplicación**: Sistema de filtrado de mensajes repetidos para evitar doble procesamiento y costos innecesarios de API.

---
*Este documento sirve como base de conocimiento para que cualquier IA comprenda el flujo de trabajo, las tablas de base de datos y la lógica de negocio de Woox.*
