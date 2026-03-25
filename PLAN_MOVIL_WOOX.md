# 📱 Plan de Implementación: Woox Mobile (APK & IPA)

Este documento detalla la estrategia para convertir el frontend actual de Woox en una aplicación móvil nativa distribuible en Google Play Store y Apple App Store.

## 🛠️ Tecnología Recomendada: Capacitor (Ionic)

Dado que Woox ya utiliza **Angular 21**, la mejor opción es **Capacitor**.
*   **Ventaja**: Reutiliza el 100% del código web actual.
*   **Rendimiento**: Acceso directo a APIs nativas (Cámara, Notificaciones, Biometría).
*   **Mantenimiento**: Una sola base de código para Web, Android e iOS.

---

## 🚀 Fases de Implementación Actualizadas (CI/CD Flow)

### Fase 1: Preparación de Capacitor (Semana 1)
1.  **Instalar Capacitor**: Integrar `@capacitor/core` y `@capacitor/android/@ios`.
2.  **Configuración de Identidad**: Definir el `App ID` (ej: `com.woox.app`) y nombres.
3.  **Generación de Assets**: Crear iconos y Splash Screens con una sola imagen base.

### Fase 2: Automatización con GitHub Actions (CI/CD) (Semana 2)
1.  **Workflow `mobile-builds.yml`**: Crear un flujo que se active al hacer push a `main`.
2.  **Android Build (Ubuntu)**: GitHub compilará el `.apk` automáticamente usando Gradle.
3.  **iOS Build (macOS)**: (Opcional) GitHub compilará el `.ipa` usando runners de Apple.
4.  **Gestión de Secretos**: Almacenar la **KeyStore** de Android y certificados de Apple en `GitHub Secrets` para firmar la app sin exponer llaves.

### Fase 3: Distribución y Pruebas (Semana 3)
1.  **Descarga de Artifactos**: Cada build exitoso generará un enlace de descarga del APK en la pestaña "Actions" de GitHub.
2.  **Distribución Beta**: Usar *Firebase App Distribution* o *TestFlight* para enviar la app a probadores seleccionados.

---

## 💎 Características Indispensables para los Comercios

1.  **Live Chat con Notificaciones PUSH**: Responder mensajes de WhatsApp/Telegram al instante vía Firebase Cloud Messaging (FCM).
2.  **Modo Offline Parcial**: Consultar catálogo y pedidos recientes sin conexión (SQLite local).
3.  **Gestión de Inventario vía Cámara**: Escaneo rápido de productos.
4.  **Impresión Térmica Bluetooth**: Impresión de tickets de pedidos directamente desde el móvil.
5.  **Biometría**: Autenticación rápida con FaceID/Huella.

---

## 📈 Resumen de Costes y Herramientas

| Herramienta | Función | Coste Estimado | Necesitas PC Local? |
| :--- | :--- | :--- | :--- |
| **GitHub Actions** | Compilación y Generación | Gratis (Minutos incluidos) | No |
| **Firebase PUSH** | Notificaciones | Gratis (Plan Spark) | No |
| **Google Play Console** | Publicar en Play Store | $25 (Pago único) | Solo para subir |
| **Apple Developer** | Publicar en App Store | $99 (Anual) | Solo para subir |

---

## 🛠️ Próximos pasos inmediatos
1.  Generar una **KeyStore** de Android (te daré el comando) y guardarla en GitHub.
2.  Crear el archivo `.github/workflows/mobile-build.yml` con la receta de compilación.
3.  Instalar los plugins de Capacitor para **Push Notifications** y **Cámara**.
