# 🚀 Plan de Crecimiento y Estabilidad: Woox SaaS (v2.6.0)

Este documento detalla la estrategia técnica para asegurar que **Woox** pueda escalar a miles de comercios y millones de mensajes mensuales, manteniendo una respuesta instantánea y una infraestructura eficiente.

---

## 1. 🏗️ Arquitectura de Próxima Generación (Serverless Native)

Tras la implementación del **Bot Builder 2.0**, hemos migrado la "inteligencia" del motor externo de Python a un modelo nativo en **Supabase Edge Functions**.

### **Ventajas de Estabilidad:**
*   **Escalado Horizontal Automático**: No hay un servidor central que se sature. Cada mensaje levanta una nueva instancia aislada.
*   **Aislamiento de Errores**: Si un flujo falla para un comercio, los demás no se ven afectados.
*   **Latencia Cero**: Reducción del tiempo de respuesta al eliminar saltos de red adicionales hacia el motor de Python.

---

## 2. 🛡️ Estrategia de Estabilidad Bajo Carga Masiva

Para manejar la concurrencia de múltiples SaaS concurrentes, implementaremos las siguientes capas:

### **A. Capa de Base de Datos (Postgres Optimizado)**
*   **Índices Compuestos**: Crear índices específicos en la tabla `bot_flows` y `messages` para que las búsquedas por `merchant_id` y `conversation_id` sean constantes e instantáneas.
*   **Supabase Pooler (PgBouncer)**: Asegurar que todas las Edge Functions usen el puerto `6543` (Transaction Mode) para evitar el agotamiento de conexiones a la base de datos.
*   **Vistas Materializadas**: Para los dashboards de analíticas, usar vistas que se refresquen periódicamente en lugar de consultar millones de mensajes en tiempo real.

### **B. Gestión de Inteligencia Artificial (LLM Quotas)**
Para evitar el error `429 Too Many Requests` de Google Gemini o OpenAI:
*   **Rotación de API Keys**: Implementar un pool de llaves dinámico en las variables de entorno de Supabase.
*   **Bring Your Own Key (BYOK)**: Permitir que los clientes "Enterprise" usen su propia API Key de Google/OpenAI, descargando el costo y el límite de cuota de tu cuenta principal.
*   **Modelo de Fallback**: Si el modelo `flash` (más rápido) falla o llega a su límite, conmutar automáticamente a un modelo de respaldo o a una respuesta predefinida "Estamos procesando tu solicitud".

### **C. Capa de Cache (Velocidad Extrema)**
*   **Upstash Redis**: Guardar la estructura del flujo visual (`flow_data`) en una base de datos en memoria (Redis). Esto evita consultar la base de datos SQL para cada mensaje, reduciendo la latencia de lectura a <10ms.

---

## 3. 📈 Plan de Crecimiento del Producto (Roadmap)

Para asegurar el crecimiento del negocio, Woox debe expandirse en las siguientes áreas:

### **A. Ecosistema de Nodos y Plantillas**
*   **Marketplace de Plantillas**: Permitir que los administradores creen "Super Plantillas" que los comercios puedan instalar con un solo clic (Ej: Plantilla Black Friday, Reservas Odontología).
*   **Nodos de Pago Directo**: Integración nativa con pasarelas (Stripe/MercadoPago) dentro del flujo para confirmar la venta sin salir del chat.

### **B. Omnicanalidad 360° Real**
*   **Unificación de Contexto**: Que la IA recuerde lo que un cliente dijo en Instagram cuando este escriba por WhatsApp el día siguiente.
*   **Bandeja de Entrada Multi-Agente (Handoff)**: Perfeccionar la transición de "Bot a Humano" con notificaciones Push instantáneas para el equipo de ventas.

### **C. Analíticas de Conversión**
*   **Embudos en el Builder**: Visualizar dentro del canvas del Bot Builder por qué nodos están pasando los usuarios y en cuáles están abandonando la conversación (Drop-off Rate).

---

## 4. 🛠️ Acciones Inmediatas (Checklist)

1.  [ ] **Auditoría de Índices SQL**: Revisar que `bot_flows`, `merchants` y `messages` tengan índices correctos.
2.  [ ] **Monitoreo de Errores (Sentry/LogSnag)**: Implementar alertas que notifiquen al equipo cuando una respuesta de IA tarde más de 8 segundos.
3.  [ ] **Documentación Técnica**: Mantener el archivo `CHANGELOG.md` y `APPINFO` actualizados para los inversores o clientes finales.
4.  [ ] **Desmantelamiento Gradual de Python**: Mantener el `woox-ai-engine` solo para experimentos internos de I+D, moviendo toda la lógica estable a Supabase.

---

> **Nota Final**: La estabilidad de un SaaS no depende de no tener errores, sino de qué tan rápido el sistema se recupera de ellos. Usar una arquitectura Serverless te da la mejor recuperación automática del mercado actual.
