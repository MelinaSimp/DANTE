# Railway Keep-Alive Setup

## 🚨 Problem

Vercel Hobby plan only allows **daily** cron jobs, not every 10 minutes. We need an external service to ping Railway every 10 minutes.

## ✅ Solution: Use UptimeRobot (Free)

UptimeRobot is a free monitoring service that can ping your Railway server every 10 minutes.

### Step 1: Create UptimeRobot Account

1. Go to: https://uptimerobot.com
2. Sign up for a free account
3. Verify your email

### Step 2: Add Monitor

1. Click **"Add New Monitor"**
2. **Monitor Type:** Select **"HTTP(s)"**
3. **Friendly Name:** `Railway Media Stream Keep-Alive`
4. **URL:** `https://motivated-perfection-production.up.railway.app/health`
5. **Monitoring Interval:** Select **"Every 5 minutes"** (or 10 minutes if available)
6. Click **"Create Monitor"**

### Step 3: Verify It's Working

1. Check UptimeRobot dashboard - should show Railway is "Up"
2. Check Railway logs - you should see health check requests every 5-10 minutes
3. Railway should stay active (not stop after 13 minutes)

## ✅ Alternative: Use cron-job.org (Free)

If you prefer a different service:

1. Go to: https://cron-job.org
2. Sign up for free account
3. Create a new cron job:
   - **Title:** `Railway Keep-Alive`
   - **URL:** `https://motivated-perfection-production.up.railway.app/health`
   - **Schedule:** Every 10 minutes (`*/10 * * * *`)
   - **Request Method:** GET
4. Save and activate

## ✅ Alternative: Use Vercel API Route (Manual)

You can also manually trigger the keep-alive by visiting:
```
https://driftai.studio/api/keepalive/railway
```

Or set up a browser extension/script to visit it every 10 minutes.

## 📋 Quick Setup (Recommended: UptimeRobot)

**Fastest way:**
1. Go to https://uptimerobot.com
2. Sign up (free)
3. Add monitor:
   - URL: `https://motivated-perfection-production.up.railway.app/health`
   - Interval: 5 minutes
4. Done! Railway will stay active

## 🔍 Verify It's Working

After setting up:
1. **Check UptimeRobot dashboard** - Should show Railway is "Up"
2. **Check Railway logs** - Should see health check requests every 5-10 minutes
3. **Check Railway service status** - Should stay "Active" (not stop)

## ⚠️ Important

- **UptimeRobot free plan:** Up to 50 monitors, 5-minute intervals
- **cron-job.org free plan:** Up to 2 cron jobs, various intervals
- Both are free and will keep Railway active!

Once set up, Railway will stay active and your calls will use Media Streams (fast) instead of the fallback (slow).
