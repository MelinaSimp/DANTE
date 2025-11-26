#!/bin/bash

# GigaAI - Direct Vercel Deployment Script
# This deploys your GigaAI application directly to Vercel without GitHub

echo "🚀 GigaAI Deployment to Vercel"
echo "================================"
echo ""

# Check if logged in
if ! vercel whoami &> /dev/null; then
    echo "⚠️  Not logged in to Vercel"
    echo "Please run: vercel login"
    exit 1
fi

echo "✅ Logged in to Vercel"
echo ""

# Deploy to production
echo "📦 Deploying to Vercel..."
vercel --prod --yes

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Your GigaAI application is now live!"
echo "Check your Vercel dashboard for the deployment URL."










