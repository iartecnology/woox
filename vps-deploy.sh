#!/bin/bash

# ============================================================
# WOOX MASTER DEPLOY - VPS AUTO-DEPLOY SCRIPT
# ============================================================

echo "🚀 Iniciando despliegue de Woox Frontend..."

echo "📥 Actualizando código desde GitHub (develop)..."
git checkout develop
git pull origin develop

echo "🐳 Reconstruyendo y reiniciando contenedor de Woox Frontend..."
docker compose up -d --build

echo ""
echo "✅ ¡Despliegue completado!"
echo "📡 Woox Frontend: http://$(curl -s ifconfig.me):8099"
