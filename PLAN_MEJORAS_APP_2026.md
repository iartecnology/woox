# 🛠️ Plan de Mejoras de la Aplicación Woox (2026)

Este documento consolida un plan de mejoras priorizado para la plataforma, con un punto especial dedicado al bug reportado: **el bot funciona bien en flujos fijos (menús, PDFs), pero el modo IA falla al capturar pedidos.**

---

## 🔴 0. PUNTO ESPECIAL: Fallo del Asistente IA en la Captura de Pedidos

### Diagnóstico (causa raíz confirmada en código)

Woox tiene **dos caminos distintos** para cerrar un pedido, y solo uno es confiable:

1. **Flujo visual fijo** (`nodo order_capture` / `register_order` en `bot-engine.ts:159-220`) → los datos ya vienen validados de variables capturadas paso a paso. **Funciona.**
2. **Modo IA libre** (`nodo ai_agent` + tool calling, `bot-engine.ts:1227-1397`) → depende de que el LLM llame correctamente a la tool `register_order` con datos completos. **Falla de forma silenciosa.**

Puntos de fallo concretos identificados:

| # | Problema | Ubicación | Efecto |
|---|---|---|---|
| 1 | `executeAgentTool()` no valida que `customer_name`, `customer_phone`, `address` sean reales (acepta vacíos, `null`, o placeholders tipo `"..."`, `"no disponible"`) | `bot-engine.ts:554-557` | Se crean pedidos con datos basura o se intenta crear con `null` |
| 2 | `createOrderSafe()` solo hace `console.error()` cuando falla el INSERT, **no relanza el error** | `bot-engine.ts:94` | El fallo desaparece, nadie se entera |
| 3 | El caller ignora `orderErr` y **siempre** devuelve el mensaje "🎉 ¡Pedido registrado exitosamente!" | `bot-engine.ts:572-594` | El cliente cree que el pedido se hizo aunque falló en BD |
| 4 | Los webhooks de producción (WhatsApp/Telegram) **eliminan** el comando de texto `[ORDER_CONFIRMED:{...}]` con un regex, pero **no lo procesan** — solo el simulador del frontend lo parsea | `whatsapp-webhook/index.ts:16`, `telegram-webhook/index.ts:24` | Si el LLM (p.ej. Groq/Llama) no logra ejecutar tool calling y responde en texto plano, el pedido **se pierde** en producción aunque funcione en el simulador |
| 5 | El fix ya diagnosticado por el equipo (`EJECUTAR_FIX_ORDER_CAPTURE.sql`) con reglas anti-placeholder para el prompt **nunca se aplicó** — la skill activa sigue siendo la versión antigua de `20260221_relational_skills.sql` | migrations | El prompt en producción sigue siendo débil |
| 6 | El recovery de tool-calls malformados de Groq es un parcheo por regex frágil | `ai-adapter.ts:436-509` | Con JSON complejo o multi-línea, el parseo falla y no hay segundo intento |

**Por qué "el bot funciona bien" en menús/PDFs pero no en pedidos**: los nodos fijos no dependen de que un LLM genere JSON válido; el pedido por IA sí, y ahora mismo no hay ninguna capa que valide, confirme ni informe cuando ese JSON llega incompleto o no llega.

### 🎯 Causa raíz real (confirmada al ejecutar el plan)

Al revisar `get_compiled_prompt()` (la RPC que arma el system prompt del nodo `ai_agent`, ver `supabase/migrations/20260313_optimize_ai_prompt_cost.sql`), se confirmó que **inyecta el fragmento de la skill `order_capture`**, cuya versión activa (`20260221_relational_skills.sql`) le ordena a la IA **escribir texto libre** `[ORDER_CONFIRMED: {...}]`.

Al mismo tiempo, `bot-engine.ts:1306-1319` ("INSTRUCCIONES OPERATIVAS") le ordena a la **misma IA, en el mismo prompt**, registrar el pedido **exclusivamente llamando a la tool `register_order`**.

Son dos mecanismos contradictorios en un solo prompt. Según qué instrucción "gana" en cada respuesta del modelo:
- Si usa la tool → el pedido se crea (funciona, por eso a veces sí cierra).
- Si escribe el texto `[ORDER_CONFIRMED:{...}]` → en Telegram se borra sin procesar; en **WhatsApp/Evolution/Facebook el JSON crudo se enviaba tal cual al cliente** (esos webhooks no filtraban ese patrón).

Esto explica la inconsistencia mejor que un simple "falta de validación": el propio sistema le dice a la IA dos formas distintas de hacer lo mismo.

### Plan de corrección (orden de ejecución) — ✅ EJECUTADO

- [x] **Paso 1 (corregido) — Migración `20260830_fix_order_capture_tool_calling.sql`.** En vez de aplicar el `EJECUTAR_FIX_ORDER_CAPTURE.sql` original (que seguía usando el mecanismo de texto contradictorio), se creó una migración nueva que reescribe el `system_prompt_fragment` de la skill `order_capture` para que instruya **únicamente** tool-calling (`add_to_cart` / `register_order`), eliminando la instrucción de escribir `[ORDER_CONFIRMED]`. **Pendiente de aplicar en producción** (ver sección "Cómo desplegar" abajo).

- [x] **Paso 2 — Validación de datos antes de crear la orden.** Aplicado en `bot-engine.ts:558-561`: si `customer_name`, `customer_phone` o `address` están vacíos o son placeholders (`"..."`, `"no disponible"`, `"por confirmar"`, etc.), la tool devuelve un mensaje pidiendo el dato real en vez de intentar crear el pedido.

- [x] **Paso 3 — Verificado, no requería cambio.** Al leer el código real (`bot-engine.ts:571-599`), el caller **ya** comprobaba `orderErr`/`order` antes de responder éxito, y ya tenía un mensaje de error genérico de fallback. No se tocó.

- [x] **Paso 4 (ajustado) — Stripping defensivo de `[ORDER_CONFIRMED]` en los 4 webhooks.** Se añadió el mismo regex que ya tenía Telegram a `whatsapp-webhook`, `evolution-webhook` y `facebook-webhook`, para que si el texto contradictorio se sigue emitiendo por cualquier motivo (modelo que ignore instrucciones), **nunca se filtre JSON crudo al cliente**. No se implementó un parser completo de creación de pedidos por texto en cada webhook (duplicaría lógica en 4 archivos) porque, con la causa raíz resuelta en el prompt, ese camino deja de ser necesario — es una red de seguridad, no un segundo mecanismo de negocio.

- [ ] **Paso 5 — Test de regresión pendiente** con al menos 2 proveedores de IA (Gemini y Groq) una vez aplicada la migración SQL en producción.

<details>
<summary>Plan original (referencia histórica antes del diagnóstico definitivo)</summary>

- [ ] **Paso 3 — Propagar errores reales de `createOrderSafe()`.** Cambiar `bot-engine.ts:94` para que el caller sepa que falló, y que el mensaje de éxito solo se envíe si `order` existe:
  ```typescript
  const { data: order, error: orderErr } = await createOrderSafe(...);
  if (orderErr || !order) {
    console.error('[BOT-ENGINE] Fallo real creando pedido:', orderErr);
    return '⚠️ Tuvimos un problema técnico registrando tu pedido. Un agente lo revisará en breve.';
  }
  ```
  Esto además da una señal clara para monitoreo (punto 3 del roadmap general).

- [ ] **Paso 4 — Añadir fallback de parsing de `[ORDER_CONFIRMED]` en los webhooks de producción**, igual que ya existe en `chat-simulator.component.ts:1723-1765` (incluyendo el chequeo `hasPlaceholders`). Esto cubre el caso en que el LLM no dispara tool calling y responde en texto — hoy ese pedido se pierde sin dejar rastro.

- [ ] **Paso 5 — Test de regresión manual** con al menos 2 proveedores de IA (Gemini y Groq, que son los que tienen comportamientos distintos de tool calling) simulando: datos completos, datos con placeholder, y datos ausentes. Confirmar que en los tres casos el usuario recibe un mensaje honesto y que solo se crea orden en BD cuando corresponde.

- [ ] **Paso 6 — Commit** de los cambios de `bot-engine.ts` con mensaje descriptivo, dejando fuera cualquier cambio no relacionado.

</details>

### 🚀 Cómo desplegar el fix

1. Abrir el [SQL Editor de Supabase](https://supabase.com/dashboard/project/khgegukjrtyjmonhavan/sql/new) y ejecutar manualmente `supabase/migrations/20260830_fix_order_capture_tool_calling.sql` (requiere acceso de administrador al proyecto — no se ejecutó automáticamente contra producción).
2. Desplegar las Edge Functions modificadas (`bot-engine` compartido + los 4 webhooks) con el flujo habitual (`vps-deploy.sh` / redeploy de Supabase Functions).
3. Probar en el simulador y en al menos un canal real con datos completos, con un dato faltante y con un placeholder ("...") para confirmar que ahora se rechaza o se registra correctamente.

---

## 1. 🏗️ Estabilidad de Infraestructura

- [ ] **Monitoreo de errores real** (Sentry o similar) en Edge Functions — hoy los `console.error()` (como el del punto especial arriba) no llegan a ningún lado observable.
- [ ] **Auditoría de índices SQL** en `bot_flows`, `messages`, `orders` para confirmar que las 62 migraciones no dejaron índices redundantes o faltantes.
- [ ] **Cache Redis (Upstash)** para `flow_data`, mencionado en `PLAN_CRECIMIENTO_ESTABILIDAD.md` pero no implementado — reduciría lecturas repetidas a Postgres por cada mensaje.
- [ ] **Rotación / pool de API keys de IA** para evitar cuellos de botella por `429 Too Many Requests` en cuentas compartidas.

## 2. 🤖 Robustez del Motor de IA (más allá del bug de pedidos)

- [ ] **Unificar el mecanismo de confirmación de acciones críticas** (pedidos, reservas, cancelaciones): usar siempre tool calling estructurado con schema estricto, y tratar el parsing de texto (`[ORDER_CONFIRMED]`) solo como fallback de última instancia, no como mecanismo primario en ningún canal.
- [ ] **Logging estructurado de tool calls fallidos** (qué tool, qué args, qué proveedor de IA) para poder diagnosticar sin tener que leer logs crudos de Deno.
- [ ] **Reintentos automáticos** cuando el modelo `flash` falla por cuota, antes de caer a mensaje genérico.
- [ ] **Endurecer el recovery de Groq** en `ai-adapter.ts:436-509` con un segundo intento vía JSON.parse tolerante (similar al que ya existe en el simulador) en vez de solo regex.

## 3. 📦 Producto / Roadmap Funcional

- [ ] **Nodos de pago directo** (Stripe/MercadoPago) para cerrar la venta sin depender de que la IA capture bien los datos de entrega.
- [ ] **Embudos/drop-off analytics** en el Bot Builder para ver en qué nodo se pierden más usuarios (útil para detectar futuros cuellos de botella como el de pedidos).
- [ ] **Omnicanalidad real de contexto** entre WhatsApp/Telegram/Instagram para el mismo cliente.
- [ ] **Publicación de la app móvil** (Android ya tiene Capacitor listo; falta CI/CD y publicación en stores).

## 4. ✅ Checklist de acciones inmediatas (prioridad)

1. [ ] Ejecutar `EJECUTAR_FIX_ORDER_CAPTURE.sql` (punto especial, Paso 1)
2. [ ] Validación de datos + propagación de errores en `bot-engine.ts` (Pasos 2-3)
3. [ ] Fallback de parsing en webhooks de producción (Paso 4)
4. [ ] Monitoreo de errores (Sentry) para detectar futuras fallas silenciosas
5. [ ] Test de regresión multi-proveedor de IA
