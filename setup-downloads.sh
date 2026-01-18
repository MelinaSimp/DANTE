#!/bin/bash

# Setup script to prepare downloads for website
# This copies built files to public/downloads/ and renames them for URLs

echo "📦 Setting up downloads for website..."
echo ""

# Check if dist-electron exists
if [ ! -d "dist-electron" ]; then
    echo "❌ dist-electron/ not found. Please build the app first:"
    echo "   ./BUILD_AND_DISTRIBUTE.sh"
    exit 1
fi

# Create downloads directory
echo "📁 Creating public/downloads/ directory..."
mkdir -p public/downloads

# Copy and rename files (remove spaces for URLs)
echo "📋 Copying files..."

# macOS
if [ -f "dist-electron/Drift AI-1.0.0.dmg" ]; then
    cp "dist-electron/Drift AI-1.0.0.dmg" "public/downloads/Drift-AI-1.0.0.dmg"
    echo "✅ macOS: Drift-AI-1.0.0.dmg"
else
    echo "⚠️  macOS .dmg not found"
fi

# Windows
if [ -f "dist-electron/Drift AI Setup 1.0.0.exe" ]; then
    cp "dist-electron/Drift AI Setup 1.0.0.exe" "public/downloads/Drift-AI-Setup-1.0.0.exe"
    echo "✅ Windows: Drift-AI-Setup-1.0.0.exe"
else
    echo "⚠️  Windows .exe not found"
fi

# Linux
if [ -f "dist-electron/Drift AI-1.0.0.AppImage" ]; then
    cp "dist-electron/Drift AI-1.0.0.AppImage" "public/downloads/Drift-AI-1.0.0.AppImage"
    echo "✅ Linux: Drift-AI-1.0.0.AppImage"
else
    echo "⚠️  Linux .AppImage not found"
fi

echo ""
echo "✨ Files ready in public/downloads/"
echo ""
echo "📋 Next steps:"
echo "1. Test locally: npm run dev (visit http://localhost:3000/download)"
echo "2. Commit and push:"
echo "   git add public/downloads/ app/download/"
echo "   git commit -m 'Add desktop app downloads'"
echo "   git push"
echo ""
echo "3. Users can download from: https://driftai.studio/download"



