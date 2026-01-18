# Fix: Agent Not Found for Voice Calls

## 🔍 The Problem

**Agent:** "Sproda" (ID: `623ccdbc-3633-42ad-99a4-497753d8a3aa`)
- ✅ Phone number: `+12166770276`
- ✅ Status: `deployed`
- ❌ Modality: `chat` (should be `voice` or `multi-modal`)

**Issue:** Voice calls only work with agents that have `modality: 'voice'` or `'multi-modal'`. Chat-only agents are ignored for voice calls.

---

## ✅ Solution

### Option 1: Change to `multi-modal` (Recommended)
- Handles both **SMS** and **voice calls**
- Use this if you want the agent to handle both text and voice

### Option 2: Change to `voice`
- Handles **voice calls only**
- SMS will NOT work with this agent
- Use this if you only want voice calls

---

## 🛠️ How to Fix

### Method 1: In the App (Easiest)
1. Go to your app → Agents
2. Find "Sproda" agent
3. Click "Edit" or "Settings"
4. Change **Modality** from `chat` to `multi-modal` (or `voice`)
5. Save

### Method 2: Database Update (Direct)
Run this SQL in your Supabase SQL editor:

```sql
-- Change to multi-modal (handles both SMS and calls)
UPDATE agents
SET modality = 'multi-modal'
WHERE id = '623ccdbc-3633-42ad-99a4-497753d8a3aa';

-- Verify the change
SELECT id, name, phone_number, modality, status
FROM agents
WHERE id = '623ccdbc-3633-42ad-99a4-497753d8a3aa';
```

---

## 📋 After Fixing

1. **Test the call:**
   - Call `+12166770276`
   - Should now find the agent and work

2. **Check logs:**
   - Should see: `[Twilio] Found agent: Sproda`
   - Should NOT see: `[Twilio] No voice/multi-modal agent found`

---

## 🎯 Why This Happened

The system filters agents by modality:
- **Voice calls** → Only matches `voice` or `multi-modal` agents
- **SMS** → Only matches `chat` or `multi-modal` agents

This allows different agents to share the same phone number:
- Voice agent handles calls
- Chat agent handles SMS
- Or one `multi-modal` agent handles both

"Sproda" was set to `chat`, so it's ignored for voice calls.
