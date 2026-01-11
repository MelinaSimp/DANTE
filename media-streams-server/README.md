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

- `PORT` - Server port (default: 3001)
- `NEXTJS_API_URL` - Your Next.js API URL (e.g., https://driftai.studio)
- `ELEVENLABS_API_KEY` - Your ElevenLabs API key

## Twilio Configuration

1. Go to Twilio Console > Phone Numbers
2. Select your phone number
3. Enable "Media Streams"
4. Set WebSocket URL: `wss://your-server.com/media-stream`

## Testing

```bash
# Health check
curl http://localhost:3001/health

# Should return:
# {"status":"ok","connections":0,"timestamp":"..."}
```
