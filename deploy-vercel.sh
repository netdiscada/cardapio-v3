#!/bin/bash
# Deploy script for Vercel push notification endpoint
# Uso: ./deploy-vercel.sh

set -e

echo "🚀 Deployando endpoint de notificação na Vercel..."

# Verifica se vercel CLI está instalado
if ! command -v vercel &> /dev/null; then
    echo "📦 Instalando Vercel CLI..."
    npm install -g vercel
fi

# Verifica se está logado
if ! vercel whoami &> /dev/null; then
    echo "🔐 Faça login na Vercel (abre navegador):"
    vercel login
fi

echo "📤 Fazendo deploy..."
vercel --prod

echo "✅ Deploy concluído!"
echo ""
echo "📋 Próximos passos:"
echo "1. Vá no dashboard da Vercel: https://vercel.com/dashboard"
echo "2. Selecione o projeto 'cardapio-quatinga-push' (ou similar)"
echo "3. Settings → Environment Variables → Adicione:"
echo "   - FIREBASE_PROJECT_ID = cardapio-8ddea"
echo "   - FIREBASE_CLIENT_EMAIL = (do service account)"
echo "   - FIREBASE_PRIVATE_KEY = (do service account, com \\n literais)"
echo "4. Re-deploy: vercel --prod"
echo ""
echo "📝 URL do endpoint será algo como: https://cardapio-quatinga-push.vercel.app/api/notify"