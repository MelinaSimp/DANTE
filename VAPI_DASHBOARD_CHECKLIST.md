# Vapi Dashboard Settings Checklist

## ❌ NOT What We Need

**Custom Credentials (OAuth 2.0)** - This is for authenticating with external APIs, not for configuring webhooks.

---

## ✅ What We Actually Need to Check

### 1. **Assistant Settings** (Most Important)

Go to: **BUILD → Assistants → [Your Assistant]**

Look for these sections:

#### A. **Server URL Section**
- [ ] **Server URL**: Should be set to `https://drift-1et9oivry-drift4.vercel.app/api/vapi/webhook`
- [ ] **Server URL Events** or **Webhook Events**: Should include:
  - ✅ `request-start`
  - ✅ `user` (user messages)
  - ✅ `assistant` (assistant requests)
  - ✅ `end-of-call-report`
- [ ] **Enable Server URL** or **Use Server URL**: Should be ON/ENABLED
- [ ] **Server URL Timeout**: Should be set (e.g., 20 seconds)

#### B. **Model Section**
- [ ] **Model → Messages**: Should be EMPTY `[]`
- [ ] **Model → System Prompt**: Should be EMPTY or not set
- [ ] **Model → Provider**: Can be set (e.g., OpenAI)
- [ ] **Model → Model**: Can be set (e.g., gpt-4o)

#### C. **First Message Section**
- [ ] **First Message**: Should be EMPTY
- [ ] **First Message Mode**: Should be `assistant-speaks-first`

#### D. **Voice Section**
- [ ] **Voice Provider**: Should be ElevenLabs
- [ ] **Voice ID**: Should be set

---

### 2. **Phone Number Settings**

Go to: **BUILD → Phone Numbers → [Your Phone Number]**

- [ ] **Server URL**: Should match assistant Server URL
- [ ] **Assistant**: Should be linked to your assistant
- [ ] **SMS**: Should be DISABLED

---

### 3. **Advanced/Server Settings** (If Exists)

Look for any section labeled:
- "Server Configuration"
- "Webhook Settings"
- "Server URL Events"
- "Message Routing"
- "Response Source"

Check for toggles like:
- [ ] "Use Vapi Model" - Should be OFF
- [ ] "Fallback to Model" - Should be OFF
- [ ] "Enable Server URL" - Should be ON
- [ ] "Server URL Priority" - Should be set correctly

---

## 🔍 What to Look For

### Red Flags (These Will Break Server URL):
- ❌ Any system message or prompt in Model settings
- ❌ "Use Vapi Model" toggle ON
- ❌ "Fallback Model" enabled
- ❌ Server URL Events not including `request-start`
- ❌ Phone number Server URL different from assistant Server URL

### Green Flags (These Are Good):
- ✅ Server URL set correctly
- ✅ Model Messages empty
- ✅ First Message empty
- ✅ Server URL Events includes all message types
- ✅ No system prompts anywhere

---

## 📸 Screenshots to Take

If you find any of these settings, take screenshots:
1. Assistant → Server URL section
2. Assistant → Model section (showing empty messages)
3. Assistant → First Message section
4. Phone Number → Server URL section
5. Any "Advanced" or "Server" settings sections

---

## 🎯 The Real Issue

Based on the error log, Vapi is still using a system message `"You are an assistant."` even though our API shows `model.messages` is empty.

**This suggests:**
1. There's a dashboard setting we can't access via API
2. Vapi has a default system message that can't be removed
3. There's a "Use Server URL" toggle that's OFF

**Check the Assistant settings page thoroughly - especially look for any toggles or checkboxes related to "Server URL" or "Model" usage.**
