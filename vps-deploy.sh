#!/bin/bash

# ============================================================
# WOOX MASTER DEPLOY - VPS AUTO-DEPLOY SCRIPT
# ============================================================

echo "🚀 Iniciando despliegue CENTRALIZADO de Woox (Frontend + IA Engine)..."

# 1. Sincronizar con GitHub (Rama develop)
echo "📥 Actualizando código desde GitHub (develop)..."
git checkout develop
git pull origin develop

# 2. Verificar archivo .env en el motor
if [ ! -f woox-ai-engine/.env ]; then
    echo "⚠️ Archivo .env del motor no encontrado en woox-ai-engine/.env"
    echo "Creando uno desde el ejemplo para que lo configures..."
    cp woox-ai-engine/.env.example woox-ai-engine/.env
    echo "🚨 IMPORTANTE: Abre woox-ai-engine/.env y pon tus API Keys."
    exit 1
fi

# 3. Reiniciar TODO el ecosistema Woox (Frontend + Engine)
echo "🐳 Reconstruyendo y reiniciando contenedores (Docker Compose Master)..."
docker compose up -d --build

echo ""
echo "✅ ¡Despliegue Maestro completado!"
echo "📡 Woox Frontend: http://$(curl -s ifconfig.me):8099"
echo "📡 Woox AI Engine: http://$(curl -s ifconfig.me):8000"
echo ""
echo "🔍 Logs IA: docker logs -f woox-ai-engine"
echo "🔍 Logs Web: docker logs -f woox-frontend"
