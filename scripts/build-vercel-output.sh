#!/bin/bash
# build-vercel-output.sh
# Cria a estrutura `.vercel/output/` exigida pelo Build Output API v3
# apos o Vite build gerar frontend/dist
set -e

VERCEL_OUTPUT=".vercel/output"

echo "[build-vercel-output] Criando $VERCEL_OUTPUT..."
mkdir -p "$VERCEL_OUTPUT/static"
mkdir -p "$VERCEL_OUTPUT/functions"

# config.json global
cat > "$VERCEL_OUTPUT/config.json" <<EOF
{
  "version": 3,
  "routes": [
    { "src": "^/assets/(.*)\$", "headers": { "cache-control": "public, max-age=31536000, immutable" }, "continue": true },
    { "src": "^/(.*)\$", "headers": { "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "strict-origin-when-cross-origin" }, "continue": true },
    { "handle": "filesystem" },
    { "src": "^/(.*)\$", "dest": "/index.html", "check": true }
  ]
}
EOF

echo "[build-vercel-output] Copiando frontend/dist/* -> $VERCEL_OUTPUT/static/"
cp -R frontend/dist/. "$VERCEL_OUTPUT/static/"

echo "[build-vercel-output] Bundle de cada api/*.ts via esbuild -> $VERCEL_OUTPUT/functions/<name>"
# Each api file becomes a function. esbuild bundles to a single .js file.
# api/health.ts -> .vercel/output/functions/health.func/index.js
# api/agendamentos/list.ts -> .vercel/output/functions/agendamentos/list.func/index.js

mkdir -p "$VERCEL_OUTPUT/functions"

# Use a Node script to walk api/ and bundle each file
node scripts/build-api-functions.mjs

echo "[build-vercel-output] OK!"
echo "Conteudo de $VERCEL_OUTPUT/static/:"
ls -la "$VERCEL_OUTPUT/static/" | head -20
echo "Conteudo de $VERCEL_OUTPUT/functions/:"
ls -la "$VERCEL_OUTPUT/functions/" | head -20
