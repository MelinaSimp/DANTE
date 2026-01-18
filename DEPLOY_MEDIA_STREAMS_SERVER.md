# Deploy Media Streams WebSocket Server - Step by Step

## Why You Need This

Regular Twilio Gather has 1-2 second latency (too slow).
Media Streams gives 200-500ms latency (fast enough).

## Quick Deploy Options (Choose One)

### Option A: Railway (EASIEST - Recommended)

1. **Go to Railway**: https://railway.app
2. **Sign in** (GitHub login works)
3. **Click "New Project"**
4. **Click "Deploy from GitHub repo"**
5. **Select your `drift-crm` repo**
6. **In the deployment settings:**
   - **Root Directory**: Set to `media-streams-server`
   - **Start Command**: `npm start`
7. **Add Environment Variables:**
   - `NEXTJS_API_URL` = `https://driftai.studio`
   - `ELEVENLABS_API_KEY` = `your_elevenlabs_key_here`
   - `PORT` = `3001` (or leave blank, Railway auto-assigns)
8. **Click "Deploy"**
9. **Copy the public URL** (e.g., `your-app.up.railway.app`)
10. **Your WebSocket URL**: `wss://your-app.up.railway.app/media-stream`

---

### Option B: Render (Also Easy)

1. **Go to Render**: https://render.com
2. **Sign in**
3. **Click "New +" → "Web Service"**
4. **Connect your GitHub repo** (`drift-crm`)
5. **Configure:**
   - **Name**: `twilio-media-streams` (or any name)
   - **Root Directory**: `media-streams-server`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free tier is fine
6. **Add Environment Variables:**
   - `NEXTJS_API_URL` = `https://driftai.studio`
   - `ELEVENLABS_API_KEY` = `your_elevenlabs_key_here`
7. **Click "Create Web Service"**
8. **Wait for deployment** (takes ~2-3 minutes)
9. **Copy the URL** (e.g., `your-app.onrender.com`)
10. **Your WebSocket URL**: `wss://your-app.onrender.com/media-stream`

---

### Option C: Fly.io (More Control)

1. **Install Fly CLI**: 
   ```bash
   curl -L https://fly.io/install.sh | sh
   ```

2. **Login to Fly**:
   ```bash
   fly auth login
   ```

3. **Go to your media-streams-server directory**:
   ```bash
   cd media-streams-server
   ```

4. **Launch the app**:
   ```bash
   fly launch
   ```
   - Choose app name (or auto-generate)
   - Select region (choose closest to you)
   - Don't deploy yet (answer "no")

5. **Set secrets**:
   ```bash
   fly secrets set NEXTJS_API_URL=https://driftai.studio
   fly secrets set ELEVENLABS_API_KEY=your_key_here
   ```

6. **Deploy**:
   ```bash
   fly deploy
   ```

7. **Get your URL**:
   ```bash
   fly info
   ```
   Look for the hostname (e.g., `your-app.fly.dev`)
   
8. **Your WebSocket URL**: `wss://your-app.fly.dev/media-stream`

---

## After Deployment - Configure Twilio

1. **Go to Twilio Console**: https://console.twilio.com
2. **Navigate to**: Phone Numbers → Manage → Active Numbers
3. **Click your phone number** (+1 216 350 8215)
4. **Scroll to "Voice Configuration"**
5. **Find "Media Streams" section**
6. **Enable Media Streams**
7. **Set WebSocket URL**: `wss://your-deployed-server.com/media-stream`
   - Example: `wss://your-app.up.railway.app/media-stream`
8. **Save**

---

## Test It

1. **Make a test call** to your Twilio number
2. **Check your WebSocket server logs** (in Railway/Render/Fly dashboard)
3. **You should see**:
   - Connection logs
   - Audio processing logs
   - Agent execution logs

---

## Troubleshooting

### Can't connect to WebSocket
- Make sure URL starts with `wss://` (not `ws://` or `https://`)
- Check firewall/security settings allow WebSocket connections
- Verify server is running (check health endpoint: `https://your-server.com/health`)

### Audio not streaming
- Check ElevenLabs API key is set correctly
- Verify `NEXTJS_API_URL` is correct
- Check server logs for errors

### High latency still
- Make sure Media Streams is enabled in Twilio
- Check server location (should be close to Twilio servers - US East is good)
- Verify WebSocket connection is active (check logs)

---

## Recommended: Railway

**Why Railway:**
- Easiest setup (3 clicks)
- Free tier available
- Auto-deploys on git push
- Built-in logs
- Simple URL structure

**Steps:**
1. Railway → New Project → GitHub repo
2. Set root directory to `media-streams-server`
3. Add environment variables
4. Deploy
5. Done! ✅
