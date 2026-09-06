#!/bin/bash

# ==============================================================================
# WOOX - SCRIPT DE CONFIGURACIÓN AUTOMÁTICA DE SUPABASE SELF-HOSTED PARA VPS
# ==============================================================================

echo "🚀 Iniciando preparación del entorno de Supabase Self-Hosted..."

# Directorio de instalación en el VPS
TARGET_DIR="$HOME/supabase-vps"

if [ -d "$TARGET_DIR" ] && [ -f "$TARGET_DIR/.env" ]; then
    echo "⚠️ El entorno en $TARGET_DIR ya está configurado (.env existente). Omitiendo regeneración de credenciales."
    echo "========================================================================"
    echo "🎉 ¡Supabase ya está listo!"
    echo "📍 Ubicación del entorno: $TARGET_DIR"
    echo "========================================================================"
    exit 0
fi

if [ -d "$TARGET_DIR" ]; then
    echo "⚠️ El directorio $TARGET_DIR ya existe pero no tiene .env. Reconfigurando..."
else
    echo "📥 Clonando repositorio oficial de Supabase Docker..."
    git clone --depth 1 https://github.com/supabase/supabase.git "$TARGET_DIR-temp"
    mv "$TARGET_DIR-temp/docker" "$TARGET_DIR"
    rm -rf "$TARGET_DIR-temp"
fi

cd "$TARGET_DIR" || exit

echo "⚙️ Configurando variables de entorno..."
cp .env.example .env

# Generar contraseñas seguras
DB_PASS=$(openssl rand -hex 16)
JWT_SEC=$(openssl rand -hex 32)

# Modificar archivo .env con contraseñas seguras y puerto libre
sed -i.bak "s/POSTGRES_PASSWORD=.*$/POSTGRES_PASSWORD=$DB_PASS/g" .env
sed -i.bak "s/JWT_SECRET=.*$/JWT_SECRET=$JWT_SEC/g" .env
sed -i.bak "s/POSTGRES_PORT=.*$/POSTGRES_PORT=54322/g" .env

# Generar claves JWT usando Python (HS256)
echo "🔑 Generando claves JWT para anon y service_role..."

python3 - <<EOF
import time
import json
import base64
import hmac
import hashlib

def base64url_encode(payload):
    return base64.urlsafe_b64encode(payload).rstrip(b'=').decode('utf-8')

def generate_jwt(role, secret):
    header = {"alg": "HS256", "typ": "JWT"}
    # Validez de 10 años
    now = int(time.time())
    payload = {
        "role": role,
        "iss": "supabase",
        "iat": now,
        "exp": now + (10 * 365 * 24 * 60 * 60)
    }
    
    parts = [
        base64url_encode(json.dumps(header, separators=(',', ':')).encode('utf-8')),
        base64url_encode(json.dumps(payload, separators=(',', ':')).encode('utf-8'))
    ]
    
    message = '.'.join(parts).encode('utf-8')
    signature = hmac.new(secret.encode('utf-8'), message, hashlib.sha256).digest()
    parts.append(base64url_encode(signature))
    return '.'.join(parts)

secret = "$JWT_SEC"
anon_key = generate_jwt("anon", secret)
service_key = generate_jwt("service_role", secret)

# Escribir en el archivo .env
with open(".env", "r") as f:
    content = f.read()

import re
content = re.sub(r'ANON_KEY=.*', f'ANON_KEY={anon_key}', content)
content = re.sub(r'SERVICE_ROLE_KEY=.*', f'SERVICE_ROLE_KEY={service_key}', content)

with open(".env", "w") as f:
    f.write(content)

print("✅ Claves JWT generadas y guardadas exitosamente.")
EOF

# Limpiar archivos temporales de sed
rm -f .env.bak

echo "========================================================================"
echo "🎉 ¡Configuración completada con éxito!"
echo "📍 Ubicación del entorno: $TARGET_DIR"
echo "========================================================================"
echo "👉 Para iniciar los servicios de Supabase ejecuta:"
echo "   cd $TARGET_DIR && docker compose up -d"
echo "========================================================================"
