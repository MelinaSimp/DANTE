# Vapi Server URL Configuration - What to Check

## ✅ What We Know

1. **Vapi has Server URL** - Configured in Vapi Dashboard
2. **Our webhook is on Vercel** - `/api/vapi/webhook`
3. **Vapi should call our webhook** - But it's not happening during calls

## 🔍 The Real Issue

From the error log, we see:
- Vapi is using a system message: `"You are an assistant."`
- Only `end-of-call-report` is being sent
- No `request-start` or `user` messages during the call

**This means Vapi is using its own model instead of the Server URL.**

## 📍 Where to Check in Vapi Dashboard

### Step 1: Go to Assistant Settings
**BUILD → Assistants → [Your Assistant]**

### Step 2: Look for "Server URL" Section

This section should have:
- **Server URL field**: `https://drift-1et9oivry-drift4.vercel.app/api/vapi/webhook`
- **Server URL Events** or **Webhook Events** checkboxes:
  - ☑ `request-start`
  - ☑ `user`
  - ☑ `assistant`
  - ☑ `end-of-call-report`

**If you don't see these checkboxes**, Vapi might be using a different UI or the feature might be in a different location.

### Step 3: Check for Toggles

Look for any toggles or switches like:
- **"Use Server URL"** - Should be ON
- **"Enable Server URL"** - Should be ON
- **"Use Vapi Model"** - Should be OFF
- **"Fallback to Model"** - Should be OFF

### Step 4: Check Model Section

**Model → Messages**: Should be empty `[]`
**Model → System Prompt**: Should be empty

**If there's a toggle like "Use Model Messages" or "Enable Model"**, it should be OFF.

## 🎯 What We Need to Find

The key is finding where Vapi decides:
- ✅ Use Server URL (call webhook)
- ❌ Use Vapi Model (ignore Server URL)

This decision point is likely:
1. A toggle in the Assistant settings
2. A "Server URL Events" configuration
3. A "Message Routing" or "Response Source" setting

## 📸 What to Screenshot

If you find any of these, take screenshots:
1. The entire "Server URL" section
2. Any "Events" or "Webhook Events" checkboxes
3. Any toggles related to "Server URL" or "Model"
4. The "Model" section showing messages array

## 💡 Alternative: Check Phone Number Settings

Sometimes the Server URL can be overridden at the Phone Number level:

**BUILD → Phone Numbers → [Your Number]**

Check:
- **Server URL**: Should match assistant Server URL
- **Assistant**: Should be linked
- **Any toggles**: Similar to assistant settings

---

## 🔧 If You Can't Find These Settings

Vapi's UI might have changed, or these settings might be:
- In an "Advanced" section
- Behind a "Show More" button
- In a different tab (e.g., "Server", "Webhook", "Integration")

**Try searching the page for:**
- "Server URL"
- "Webhook"
- "Events"
- "request-start"
