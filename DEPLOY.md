# GigaAI - Direct Vercel Deployment Guide

## Deploy Directly to Vercel (No GitHub Required)

### Option 1: Using Vercel CLI (Recommended)

1. **Install Vercel CLI** (if not already installed):
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Deploy from your project directory**:
   ```bash
   cd /Users/zsoltsgewinn/drift-crm
   vercel
   ```

4. **Follow the prompts**:
   - Set up and deploy? **Yes**
   - Which scope? Select your **company/team**
   - Link to existing project? **No** (for first deployment)
   - Project name: **gigaai** (or your preferred name)
   - Directory: **./** (current directory)
   - Override settings? **No**

5. **For production deployment**:
   ```bash
   vercel --prod
   ```

### Option 2: Using Vercel Dashboard (Drag & Drop)

1. **Go to**: https://vercel.com/dashboard
2. **Click**: "Add New..." → "Project"
3. **Select**: "Import Third-Party Git Repository" or use the CLI method above
4. **Or use Vercel CLI** to deploy directly from your local machine

### Option 3: Using Vercel Dashboard with Local Upload

1. **Install Vercel CLI**:
   ```bash
   npm i -g vercel
   ```

2. **Login and deploy**:
   ```bash
   vercel login
   vercel --prod
   ```

3. **Your deployment will be available at**:
   - Preview: `https://gigaai-[hash].vercel.app`
   - Production: `https://gigaai.vercel.app` (after setting custom domain)

### Environment Variables (if needed)

If you need environment variables:
1. Go to your Vercel project dashboard
2. Settings → Environment Variables
3. Add any required variables

### Custom Domain Setup

1. Go to your Vercel project dashboard
2. Settings → Domains
3. Add your custom domain (e.g., `giga.ai` or `app.giga.ai`)

### Quick Deploy Command

```bash
# One-time setup
vercel login

# Deploy to production
vercel --prod

# Deploy preview
vercel
```

Your GigaAI application will be live at your Vercel URL!










