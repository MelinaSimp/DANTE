# Twilio Media Streams WebSocket Server

Standalone WebSocket server for handling Twilio Media Streams connections.

## Deployment Options

### Option 1: Railway
1. Create new project on Railway
2. Connect GitHub repo
3. Set environment variables
4. Deploy

### Option 2: Render
1. Create new Web Service
2. Connect repo
3. Set build command: `npm install`
4. Set start command: `npm start`
5. Set environment variables

### Option 3: Fly.io
```bash
fly launch
fly secrets set NEXTJS_API_URL=https://driftai.studio
fly secrets set ELEVENLABS_API_KEY=your_key
fly deploy
```

### Option 4: EC2 / VPS
```bash
git clone <repo>
cd media-streams-server
npm install
npm start
```

## Environment Variables

- `PORT` - Server port (default: 3001, Railway uses 8080 when not set)
- `NEXTJS_API_URL` - **Required.** Your Next.js API base URL (e.g. `https://driftai.studio`). Used for `/api/twilio/media-stream-lookup` and `/api/twilio/media-stream-execute`.
- `ELEVENLABS_API_KEY` - **Required.** ElevenLabs API key for TTS.

## Twilio Configuration

1. **Voice webhook**: Phone Number → Voice → "A call comes in" → Webhook URL = `https://your-app.com/api/twilio/media-stream` (your Vercel/production URL).
2. The Stream URL (`wss://your-railway-app.up.railway.app/media-stream`) is set in TwiML by the app; configure `RAILWAY_WEBSOCKET_URL` in Vercel.

## Testing

```bash
# Health check
curl http://localhost:3001/health

# Should return:
# {"status":"ok","connections":0,"timestamp":"..."}
```
