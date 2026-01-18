# Railway Service Setup - Quick Steps

## Current Situation

✅ Railway project created: `creative-gentleness`
⚠️ Multiple services exist in the project
⚠️ Need to create a new service for Media Streams

## Quick Fix (Via Dashboard)

Since there are multiple services, let's create a new one via the dashboard:

1. **Go to your Railway project**: https://railway.com/project/c0d7464d-8954-42c4-adae-97545ecd380f

2. **Create New Service**:
   - Click **"New"** button (top right)
   - Select **"Empty Service"** or **"GitHub Repo"**
   - Name it: `media-streams-server`

3. **Configure Service**:
   - **Root Directory**: `media-streams-server`
   - **Start Command**: `npm start`
   - **Build Command**: `npm install` (or leave blank)

4. **Add Environment Variables** (in service settings):
   - `NEXTJS_API_URL` = `https://driftai.studio`
   - `ELEVENLABS_API_KEY` = `your_elevenlabs_key_here`
   - `PORT` = `3001` (optional)

5. **Deploy**:
   - Railway should auto-deploy
   - Or click "Deploy" button

6. **Get Public URL**:
   - After deployment, go to service → "Settings" → "Networking"
   - Generate a public domain
   - Your WebSocket URL: `wss://your-domain.up.railway.app/media-stream`

## After Service is Created

Once you create the service, tell me and I can:
- Set environment variables via CLI
- Redeploy if needed
- Get the public URL

Or you can do it all via the dashboard - either way works!
