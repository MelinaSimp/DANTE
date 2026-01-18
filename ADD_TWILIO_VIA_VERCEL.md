# Add Twilio Credentials via Vercel (MUCH EASIER!)

Instead of dealing with SQL, just add them as **environment variables in Vercel**. The code will automatically use them!

---

## ✅ Easy Steps:

### Step 1: Go to Vercel Dashboard
1. Go to https://vercel.com/dashboard
2. Click on your project (`drift-crm` or similar)
3. Go to **Settings** → **Environment Variables**

### Step 2: Add These Two Variables

Click **"Add New"** and add these one at a time:

**Variable 1:**
- **Name:** `TWILIO_ACCOUNT_SID`
- **Value:** `ACa4ec1e738aa8dd41616222435045d6fb`
- **Environments:** ✅ Production ✅ Preview ✅ Development

**Variable 2:**
- **Name:** `TWILIO_AUTH_TOKEN`
- **Value:** `6863bb19d773f6a119c66aa337d7c10b`
- **Environments:** ✅ Production ✅ Preview ✅ Development

### Step 3: Redeploy
1. After adding both variables, go to **Deployments** tab
2. Click **"Redeploy"** on the latest deployment (or wait for next auto-deploy)

---

## 🎯 That's It!

Once deployed, the warning will disappear because the code checks environment variables as a fallback!

---

## 📋 Why This Works

The code checks for Twilio credentials in this order:
1. ✅ Database (`twilio_credentials` table)
2. ✅ **Environment variables** (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`)
3. ❌ If neither exist, voice calls won't work

By adding them to Vercel, they'll work immediately without any database changes!

---

**This is WAY easier than SQL!** 🚀
