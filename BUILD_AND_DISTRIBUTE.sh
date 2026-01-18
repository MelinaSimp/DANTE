#!/bin/bash

# Build and Distribute Script for Drift AI Desktop App
# This script builds the app for all platforms and prepares it for distribution

echo "🚀 Building Drift AI Desktop App for Distribution"
echo "=================================================="

# Step 1: Build Next.js app
echo ""
echo "📦 Step 1: Building Next.js app..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Next.js build failed!"
    exit 1
fi

echo "✅ Next.js build complete!"
echo ""

# Step 2: Build Electron app for all platforms
echo "📦 Step 2: Building Electron app for all platforms..."
npm run electron:build

if [ $? -ne 0 ]; then
    echo "❌ Electron build failed!"
    exit 1
fi

echo "✅ Electron build complete!"
echo ""

# Step 3: List built files
echo "📁 Built files are in dist-electron/:"
echo ""
ls -lh dist-electron/

echo ""
echo "✨ Build complete! Files are ready for distribution."
echo ""
echo "📋 Next steps:"
echo "1. Test each build on its respective platform"
echo "2. Create a GitHub Release or upload to your website"
echo "3. Share the download links with users"
echo ""
echo "📖 See DISTRIBUTION_GUIDE.md for detailed instructions"



