# Woox - AI Conversational Commerce

Este proyecto es una plataforma de comercio conversacional impulsada por IA, integrada con Supabase y Telegram.

## 🚀 Despliegue con Docker

Para desplegar la aplicación rápidamente usando Docker Compose:

1. Configura tus variables de entorno en un archivo `.env` (usa `.env.example` como base):
   ```bash
   cp .env.example .env
   ```
2. Inicia los contenedores:
   ```bash
   docker-compose up -d --build
   ```
La aplicación estará disponible en `http://localhost:8080`.

## 🗄️ Configuración de la Base de Datos

Para inicializar la base de datos en Supabase:
1. Ve a tu panel de Supabase -> SQL Editor.
2. Copia y ejecuta el contenido del archivo `init_database.sql` (ubicado en la raíz).
   - Este archivo contiene todo el esquema, funciones de IA y datos semilla.

## 🛠️ Desarrollo Local

Para desarrollo frontend dinámico:

1. Instala dependencias:
   ```bash
   npm install
   ```
2. Inicia el servidor de desarrollo:
   ```bash
   npm start
   ```
Navega a `http://localhost:4200/`.

## 🤖 Integración con Telegram

Consulta la [Guía de Configuración de Telegram](TELEGRAM_SETUP_GUIDE.md) para vincular tus bots con la IA de Woox.
