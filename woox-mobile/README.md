# Woox Mobile (React Native + Expo SDK 57)

Aplicación móvil nativa en **TypeScript puro** diseñada para la operativa en tiempo real de empresas y comerciantes en la plataforma Woox.

---

## 🚀 Arquitectura y Capacidades

1. **Expo Router (File-Based Routing):**
   - Rutas protegidas automáticas (`(app)/_layout.tsx`) con guardado de sesión persistente en `expo-secure-store`.
   - Navegación por pestañas nativas (`Pedidos`, `Mensajes`, `Reservas`, `Stock`, `Ajustes`).
2. **Sincronización en Tiempo Real (Supabase Realtime):**
   - Suscripción directa por WebSocket a las tablas `orders`, `conversations` y `messages` filtradas por `merchant_id`.
3. **Alarma Sonora y Háptica para Pedidos:**
   - Detección inmediata de pedidos `pending` con disparador sonoro en bucle y vibración táctil persistente hasta que el operador pulsa *"Aceptar y Preparar"*.
4. **Bandeja Omnicanal & Human Takeover:**
   - Visualización de chats entrantes de WhatsApp, Telegram, Messenger e Instagram.
   - Switch instantáneo de toma de control manual: pausa la IA en el canal del cliente y permite que el comerciante responda directamente.
5. **Agenda de Reservas & Control Exprés de Catálogo:**
   - Confirmación rápida de citas del día.
   - Interruptores de stock para deshabilitar productos agotados al instante (evitando que la IA los ofrezca en los chats).

---

## 🛠️ Ejecución Local

Para probar la app en tu teléfono móvil o simulador:

1. Ingresa a la carpeta del proyecto:
   ```bash
   cd woox-mobile
   ```

2. Inicia el servidor de desarrollo Expo:
   ```bash
   npm start
   ```

3. **En tu teléfono físico:**
   - Abre la aplicación **Expo Go** (disponible en Google Play Store y Apple App Store).
   - Escanea el código QR mostrado en la terminal.

4. **En emuladores:**
   - Presiona `a` para abrir el emulador de **Android**.
   - Presiona `i` para abrir el simulador de **iOS**.
   - Presiona `w` para probar en la **Web**.
