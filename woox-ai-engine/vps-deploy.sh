#!/bin/bash

# ============================================================
# WOOX AI ENGINE - VPS AUTO-DEPLOY SCRIPT
# ============================================================

echo "🚀 Iniciando despliegue automático del Woox AI Engine..."

# 1. Sincronizar con GitHub (Rama develop)
echo "📥 Actualizando código desde GitHub (develop)..."
git checkout develop
git pull origin develop

# 2. Entrar a la carpeta del motor
cd woox-ai-engine

# 3. Configurar puerto 8099 en docker-compose automáticamente
echo "⚙️ Configurando puerto 8099 en docker-compose.yml..."
# Usamos sed para reemplazar el puerto 8000:8000 por 8099:8000
sed -i 's/"8000:8000"/"8099:8000"/g' docker/docker-compose.yml

# 4. Verificar archivo .env
if [ ! -f .env ]; then
    echo "⚠️ Archivo .env no encontrado. Creando uno desde el ejemplo..."
    cp .env.example .env
    echo "🚨 IMPORTANTE: Abre el archivo .env con 'nano .env' y pon tus API Keys antes de continuar."
    exit 1
fi

# 5. Reiniciar Contenedores con Docker Compose
echo "🐳 Reconstruyendo y reiniciando contenedores Docker..."
docker compose -f docker/docker-compose.yml up -d --build

echo "✅ ¡Despliegue completado con éxito!"
echo "📡 El motor debería estar escuchando en: http://$(curl -s ifconfig.me):8099"
echo "🔍 Revisa los logs con: docker logs -f woox-ai-engine"
