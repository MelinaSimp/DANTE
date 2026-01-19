# Railway Server Keeps Stopping

## 🚨 Problem

Your Railway Media Stream server keeps stopping after running for ~13 minutes:
- Started at `15:35:11`
- Stopped at `15:48:38` (~13 minutes later)
- Status: "Removed"

## 🔍 Why This Happens

Railway containers can stop for several reasons:

1. **Inactivity timeout** (Free/Hobby plans)
   - Railway may stop services that aren't receiving requests
   - After ~15 minutes of no activity, the service stops

2. **Memory/Resource limits**
   - If the service uses too much memory, Railway stops it
   - Check Railway logs for memory errors

3. **Service crash**
   - If the Node.js process crashes, Railway stops the container
   - Check logs for error messages before "Stopping Container"

4. **Railway deployment issue**
   - If Railway detects the service isn't working, it may stop it

## ✅ Solutions

### Solution 1: Add Keep-Alive (Recommended)

Add a simple HTTP endpoint that keeps the service alive:

**In `media-streams-server/index.js`:**
```javascript
// Add a simple keep-alive endpoint
server.on('request', (req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      connections: activeConnections.size,
      timestamp: new Date().toISOString(),
    }));
  } else if (req.url === '/keepalive') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});
```

**Then set up a cron job or external service to ping `/keepalive` every 10 minutes:**

Options:
1. **UptimeRobot** (free) - Monitors and pings your service
2. **Cron-job.org** (free) - Scheduled HTTP requests
3. **Vercel Cron** (if available) - Scheduled function

### Solution 2: Check Why It's Stopping

1. **Check Railway logs for errors:**
   - Look for errors before "Stopping Container"
   - Check for memory errors
   - Check for crash errors

2. **Check Railway service settings:**
   - Go to Railway Dashboard → Settings
   - Check "Auto-Deploy" is enabled
   - Check resource limits

3. **Check if it's a deployment issue:**
   - Railway might be stopping the old deployment
   - Make sure you're not accidentally stopping it manually

### Solution 3: Upgrade Railway Plan

- Free/Hobby plans may have inactivity timeouts
- Upgrading to a paid plan might remove timeouts

### Solution 4: Use Railway's Restart Policy

Check Railway service settings:
1. Go to Railway Dashboard → Your Service → Settings
2. Look for "Restart Policy"
3. Set to "always" or "unless-stopped"

## 🚀 Quick Fix (Right Now)

**Restart the Railway service:**
1. Go to Railway Dashboard
2. Click on `motivated-perfection` service
3. Click "Redeploy" or "Deploy"
4. Wait for it to start
5. Test a call immediately

**To keep it running longer:**
- Set up a keep-alive ping (Solution 1)
- Or upgrade Railway plan if it's a timeout issue

## 📋 Next Steps

1. **Restart Railway** (immediate fix)
2. **Add keep-alive endpoint** (long-term solution)
3. **Set up external ping service** (to keep it alive)
4. **Check Railway logs** for why it stopped (diagnostic)

The keep-alive solution is the best long-term fix!
