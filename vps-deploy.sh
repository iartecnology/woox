#!/bin/bash

# ============================================================
# WOOX MASTER DEPLOY - VPS AUTO-DEPLOY SCRIPT
# ============================================================

echo "🚀 Iniciando despliegue de Woox Frontend..."

echo "📥 Actualizando código desde GitHub (develop)..."
git checkout develop
git pull origin develop

echo "⚡ Asegurando estado de Supabase Self-Hosted..."
bash supabase/setup-selfhost.sh
if [ -d "$HOME/supabase-vps" ]; then
    echo "🐳 Iniciando/Verificando contenedores de Supabase..."
    cd "$HOME/supabase-vps" && docker compose up -d
    cd - > /dev/null || exit
fi

echo "🐳 Reconstruyendo y reiniciando contenedor de Woox Frontend..."
docker compose up -d --build

echo ""
echo "✅ ¡Despliegue completado!"
echo "📡 Woox Frontend: http://$(curl -s ifconfig.me):8099"
