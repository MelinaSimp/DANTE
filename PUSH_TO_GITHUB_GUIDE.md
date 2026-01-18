# Push to GitHub - Quick Guide

## Option 1: Create New GitHub Repo and Push

1. **Go to GitHub**: https://github.com/new
2. **Create new repository**:
   - Name: `drift-crm` (or any name)
   - Make it **Private** (or Public)
   - **DON'T** initialize with README (we already have code)
3. **Click "Create repository"**
4. **Copy the repository URL** (e.g., `https://github.com/yourusername/drift-crm.git`)
5. **Run these commands**:
   ```bash
   cd /Users/zsoltsgewinn/drift-crm
   git remote add origin https://github.com/yourusername/drift-crm.git
   git branch -M main
   git push -u origin main
   ```

## Option 2: Use Railway CLI (No GitHub Needed!)

Railway also lets you deploy directly without GitHub:

1. **Install Railway CLI**:
   ```bash
   npm install -g @railway/cli
   ```

2. **Login to Railway**:
   ```bash
   railway login
   ```

3. **Go to media-streams-server directory**:
   ```bash
   cd media-streams-server
   ```

4. **Initialize and deploy**:
   ```bash
   railway init
   railway up
   ```

5. **Set environment variables in Railway dashboard**:
   - `NEXTJS_API_URL=https://driftai.studio`
   - `ELEVENLABS_API_KEY=your_key`

This way you don't need GitHub at all!
