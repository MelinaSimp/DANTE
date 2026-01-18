# How to Deploy to Vercel from Terminal

## Prerequisites

1. **Install Vercel CLI** (if not already installed):
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```
   This will open your browser to authenticate. Follow the prompts.

3. **Configure Git** (if not already done):
   ```bash
   git config user.email "your-email@example.com"
   git config user.name "Your Name"
   ```
   ⚠️ **Important**: Use the same email that has access to your Vercel team!

## Deployment Commands

### Deploy to Production
```bash
cd /Users/zsoltsgewinn/drift-crm
vercel --prod
```

### Deploy to Preview (for testing)
```bash
vercel
```

### Deploy with specific project
```bash
vercel --prod --yes
```

## Common Issues & Solutions

### Issue 1: "Git author email must have access to team"
**Solution**: Update git config with your Vercel account email:
```bash
git config user.email "your-vercel-email@example.com"
git config user.name "Your Name"
# Make a new commit
git commit --amend --reset-author
git push --force-with-lease
```

### Issue 2: "Not logged in"
**Solution**: Run `vercel login` again

### Issue 3: "Project not found"
**Solution**: Link to existing project:
```bash
vercel link
```

## Alternative: Use GitHub Auto-Deploy (Recommended)

Since your GitHub is connected to Vercel, deployments happen automatically when you push:
```bash
git add .
git commit -m "Your commit message"
git push
```
Vercel will automatically deploy from GitHub - no CLI needed!

## Check Deployment Status

```bash
vercel ls --prod
```

## View Deployment URL

After deployment, Vercel will show you the URL. Or check:
- Production: https://driftai.studio
- Dashboard: https://vercel.com/drift4/drift-crm
