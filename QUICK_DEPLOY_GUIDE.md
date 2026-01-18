# Quick Deploy Guide - driftai.studio

## Step 1: Deploy Your Project to Vercel

### Option 1: Using Vercel CLI (Recommended)

1. **Install Vercel CLI** (if not already installed):
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```
   This will open your browser to login.

3. **Deploy from your project directory**:
   ```bash
   cd /Users/zsoltsgewinn/drift-crm
   vercel --prod
   ```

4. **Follow the prompts**:
   - Set up and deploy? **Yes**
   - Which scope? Select your **account/team**
   - Link to existing project? **No** (for first deployment)
   - Project name: Use default or enter a name
   - Directory: **./** (current directory)
   - Override settings? **No**

5. **After deployment**, you'll get a URL like:
   - `https://your-project-name.vercel.app`
   - Save this URL - you'll need it!

---

## Step 2: Add Custom Domain (driftai.studio)

### After deployment is complete:

1. **Go to Vercel Dashboard**: https://vercel.com/dashboard

2. **Click on your project** (the one you just deployed)

3. **Go to Settings** → **Domains**

4. **Click "Add Domain"**

5. **Enter**: `driftai.studio`

6. **Click "Add"**

7. **Vercel will show you DNS instructions**:
   - It will tell you to add nameservers or DNS records
   - Follow the instructions based on your domain registrar

8. **Configure DNS at your domain registrar**:
   - Log into where you bought `driftai.studio` (GoDaddy, Namecheap, etc.)
   - Update nameservers or DNS records as Vercel instructs
   - **Important**: Use Vercel's nameservers if possible (easier)

9. **Wait 10-30 minutes** for DNS to propagate

10. **Test**: Visit `https://driftai.studio`

---

## Quick Command Summary

```bash
# 1. Install Vercel CLI
npm i -g vercel

# 2. Login
vercel login

# 3. Deploy to production
cd /Users/zsoltsgewinn/drift-crm
vercel --prod
```

---

## Troubleshooting

### If you get "Project not found":
- Make sure you're logged into the correct Vercel account
- Try `vercel login` again

### If domain doesn't work after adding:
- Check DNS propagation: https://dnschecker.org
- Make sure you added the correct nameservers/DNS records
- Wait longer (can take up to 48 hours, usually 10-30 minutes)

### If you need to check deployment status:
- Go to: https://vercel.com/dashboard
- Click on your project
- Check the "Deployments" tab

---

## What You'll Get

After deployment:
1. **Vercel URL**: `https://your-project-name.vercel.app` (works immediately)
2. **Custom Domain**: `https://driftai.studio` (works after DNS setup)

Both URLs will show the same app - the custom domain is just prettier!


