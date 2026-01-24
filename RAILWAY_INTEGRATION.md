# Railway Integration & Logging System

## 🎯 Overview

I've set up a complete Railway integration system that allows you to:
- **Monitor Railway logs in real-time** from your Vercel app
- **Test Railway connectivity** directly from the UI
- **See detailed timing information** for debugging latency issues
- **Track all WebSocket connections** and audio streaming

## 📍 Access Points

### 1. **Railway Logs Viewer**
**URL:** `/railway-logs`

- Real-time log viewer (auto-refreshes every 2 seconds)
- Filter by log level (error, warn, info)
- View detailed metadata for each log entry
- See connection stats and timing information

### 2. **Railway Test Page**
**URL:** `/railway-test`

- Test Railway health check
- Test connection connectivity
- View test results in real-time

### 3. **API Endpoints**

#### Log Streaming Endpoint
```
POST /api/railway/logs
GET /api/railway/logs?level=error&limit=100
```

#### Test Endpoint
```
POST /api/railway/test
GET /api/railway/test
```

## 🔧 How It Works

### Railway Server → Vercel Logs

The Railway server (`media-streams-server/index.js`) now:
1. **Sends all logs** to `/api/railway/logs` endpoint
2. **Includes timing information** for every operation:
   - Greeting API response time
   - Agent execution time
   - TTS generation time
   - Audio streaming time
3. **Tracks connections** with detailed metadata

### What Gets Logged

- ✅ WebSocket connections (new, closed, errors)
- ✅ Stream start events
- ✅ Conversation ID lookups
- ✅ Greeting generation (with timing)
- ✅ User input processing (with timing)
- ✅ Agent response times
- ✅ TTS generation times
- ✅ Audio streaming progress
- ✅ All errors with full context

## 🚀 Next Steps

1. **Deploy Railway Server** with the updated code
2. **Visit `/railway-logs`** to see logs in real-time
3. **Make a test call** and watch the logs populate
4. **Check timing information** to identify bottlenecks

## 📊 Understanding the Logs

### Log Levels

- **`info`**: Normal operations (connections, responses, etc.)
- **`warn`**: Non-critical issues (missing conversationId, etc.)
- **`error`**: Critical failures (API errors, connection failures)

### Timing Information

Each log entry includes:
- **`responseTime`**: Time taken for API calls (ms)
- **`totalTime`**: Total time for operations (ms)
- **`chunksSent`**: Number of audio chunks streamed

### Example Log Entry

```json
{
  "level": "info",
  "message": "Agent response received (45 chars) in 2341ms",
  "metadata": {
    "conversationId": "abc-123",
    "responseTime": 2341,
    "outputLength": 45,
    "timestamp": "2026-01-23T..."
  }
}
```

## 🔍 Debugging Latency

When you see a 9-second delay, check the logs for:

1. **Greeting API time** - Should be < 3 seconds
2. **Agent execution time** - Should be < 5 seconds
3. **TTS generation time** - Should be < 2 seconds
4. **Audio streaming time** - Should be < 1 second

If any of these are high, that's your bottleneck!

## 🎯 Testing Workflow

1. Open `/railway-logs` in one tab
2. Open `/railway-test` in another tab
3. Run "Health Check" to verify Railway is reachable
4. Make a test call
5. Watch logs populate in real-time
6. Check timing information to identify slow operations

## ⚠️ Important Notes

- Logs are stored **in-memory** (last 1000 logs)
- Logs are **not persisted** across deployments
- For production, consider using Redis or a database
- Railway server must have `NEXTJS_API_URL` environment variable set

## 🔗 Quick Links

- **Logs Viewer**: `/railway-logs`
- **Test Page**: `/railway-test`
- **Health Check API**: `/api/debug/check-railway`
- **Logs API**: `/api/railway/logs`
