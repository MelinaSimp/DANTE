# Retell API Key Setup

## ✅ Add to Vercel Environment Variables

Go to: **Vercel Dashboard** → **Your Project** → **Settings** → **Environment Variables**

Add:
```
RETELL_API_KEY=key_bdc087d7ea9afc2224390b8e8cfa
```

Make sure to enable for:
- ✅ Production
- ✅ Preview  
- ✅ Development

---

## 🔒 Why We Need It

1. **Webhook Verification** (if Retell signs webhooks)
2. **API Calls** - To create calls, check status, update config
3. **Future Features** - Any programmatic Retell interactions

---

## 📝 Current Status

- ❌ Not in Vercel env vars yet
- ✅ Hardcoded in scripts (bad practice)
- ⚠️ Should be added ASAP
