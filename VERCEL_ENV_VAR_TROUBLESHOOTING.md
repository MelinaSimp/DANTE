# Vercel Environment Variable Not Recognizing - Troubleshooting

## 🔴 Problem

`VAPI_API_KEY` is set in Vercel dashboard but not accessible in runtime:
```json
{"vapiApiKeyExists":false,"vapiApiKeyLength":0}
```

---

## ✅ Common Causes & Fixes

### Cause 1: Variable Not Linked to Project (MOST COMMON)

**Problem:** In Vercel, environment variables can exist but not be linked to your specific project.

**Fix:**
1. Go to **Vercel Dashboard** → Your Project (`drift-crm`)
2. Go to **Settings** → **Environment Variables**
3. Find `VAPI_API_KEY` in the list
4. Click on it to expand
5. Look for **"Link To Projects"** section
6. If your project (`drift-crm`) is NOT listed:
   - Click **"Search for a Project to link to..."**
   - Select your project: `drift-crm`
   - Click **"Save"**
7. **Redeploy** after linking

---

### Cause 2: Wrong Environment Scope

**Problem:** Variable is set but only for Preview, not Production.

**Fix:**
1. Go to **Vercel Dashboard** → Your Project → **Settings** → **Environment Variables**
2. Find `VAPI_API_KEY`
3. Click on it to expand
4. Check the dropdown at the top (should say "Production, Preview, and Development")
5. Make sure **"Production"** is checked
6. Click **"Save"**
7. **Redeploy**

---

### Cause 3: Typo in Variable Name

**Problem:** Variable name has a typo or extra space.

**Check:**
- Should be exactly: `VAPI_API_KEY` (all caps, underscores, no spaces)
- Common mistakes:
  - `VAPI-API-KEY` (dashes instead of underscores)
  - `VAPI_API_KEY ` (trailing space)
  - `VAPI_APIKEY` (missing underscore)

**Fix:**
1. Delete the incorrectly named variable
2. Create new one with exact name: `VAPI_API_KEY`
3. Make sure it's linked to your project
4. **Redeploy**

---

### Cause 4: Deployment Happened Before Variable Was Added

**Problem:** Environment variables are only available to deployments created AFTER the variable is set.

**Fix:**
1. After setting/linking the variable, you MUST redeploy
2. Options:
   - **Option A:** Make a small code change and push (triggers auto-deploy)
   - **Option B:** Go to Deployments → Click "..." on latest → "Redeploy"
   - **Option C:** Use Vercel CLI: `vercel --prod --force`

---

### Cause 5: Variable Value Has Special Characters

**Problem:** If the API key value has special characters that aren't properly escaped.

**Check:** In Vercel dashboard, when you edit `VAPI_API_KEY`, does the value show correctly?
- Should be: `2bf8f671-ccbb-440b-bf7e-9d5985ad3152`
- No extra quotes or escaping needed in Vercel UI

---

## 🔍 How to Verify

### Step 1: Check if Variable is Linked

1. Go to **Vercel Dashboard** → Your Project → **Settings** → **Environment Variables**
2. Click on `VAPI_API_KEY` to expand
3. Scroll down to **"Link To Projects"**
4. Verify your project (`drift-crm` or similar) is listed
5. If NOT listed → Click "Search for a Project" → Add it → Save

### Step 2: Verify Environment Scope

In the same expanded view:
- Dropdown at top should include **"Production"**
- Should say: "Production, Preview, and Development" or at least "Production"

### Step 3: Check Deployment Time vs Variable Update Time

1. Go to **Deployments** tab
2. Check when your latest deployment was created
3. Go back to **Environment Variables**
4. Check when `VAPI_API_KEY` was "Last Updated"
5. **If deployment is OLDER than variable update** → You need to redeploy!

### Step 4: Test After Fixes

After making changes and redeploying, test:
```
https://your-vercel-url.vercel.app/api/debug/all-env
```

Should show:
```json
{
  "importantKeys": {
    "VAPI_API_KEY": {
      "exists": true,
      "length": 36,
      "prefix": "2bf8f671-c"
    }
  }
}
```

---

## 🎯 Quick Fix Checklist

- [ ] Variable name is exactly `VAPI_API_KEY` (no typos)
- [ ] Variable is linked to your project (check "Link To Projects")
- [ ] Environment scope includes "Production"
- [ ] Variable was updated BEFORE or you've redeployed AFTER
- [ ] Redeployed after making changes

---

## 🆘 If Still Not Working

1. **Delete and recreate the variable:**
   - Delete `VAPI_API_KEY` from Vercel
   - Create it again with exact name: `VAPI_API_KEY`
   - Value: `2bf8f671-ccbb-440b-bf7e-9d5985ad3152`
   - Scope: Production, Preview, Development
   - Link to your project
   - Save
   - **Redeploy**

2. **Use the workaround endpoint:**
   - Visit: `/vapi-fix`
   - When prompted, enter your API key manually
   - This bypasses the env var issue

3. **Check Vercel logs:**
   - Look for any errors about environment variables
   - Check if there are multiple projects with same name

---

## 📝 Most Likely Issue

Based on your screenshot, the variable exists and is updated 22h ago. The most likely issue is:

**The variable is NOT linked to your specific project.**

Vercel allows environment variables to exist globally, but they need to be explicitly linked to each project. Check the "Link To Projects" section when you click on `VAPI_API_KEY`.
