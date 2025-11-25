# Where to Find Server Logs

## Development Mode (Local)

### 1. **Terminal Running `npm run dev`**
This is the **main place** to see server-side logs:

```bash
# Look for a terminal window/tab running:
npm run dev
# or
next dev
```

**What you'll see:**
- `[Agent Executor]` logs
- `[Conversation Message]` logs  
- `[Chat Interface]` logs
- Database errors
- API errors
- OpenAI API errors

**Example output:**
```
[Agent Executor] Execution error: { error: "...", conversationId: "...", ... }
[Agent Executor] Error loading step: { code: "...", message: "..." }
```

### 2. **Browser Console (Client-Side Errors)**
For frontend/UI errors:

1. Open your browser (Chrome, Firefox, Safari)
2. Press `F12` or `Cmd+Option+I` (Mac) / `Ctrl+Shift+I` (Windows)
3. Click the **Console** tab
4. Look for red error messages

**What you'll see:**
- `[Chat Interface]` client-side errors
- Network request failures
- React errors
- JavaScript errors

### 3. **Electron Console (If Using Electron App)**
If you're running the Electron desktop app:

1. In the Electron window, press `Cmd+Option+I` (Mac) or `Ctrl+Shift+I` (Windows)
2. Or check the terminal where you ran `npm run electron` or `npm run electron:dev`

**What you'll see:**
- Electron-specific errors
- Renderer process errors
- Network errors

## Production Mode (Vercel)

### **Vercel Dashboard**
1. Go to [vercel.com](https://vercel.com)
2. Select your project
3. Click **Functions** tab
4. Click on a function to see its logs
5. Or go to **Deployments** → Click a deployment → **Functions** tab

**What you'll see:**
- Serverless function logs
- API route logs
- Error traces

## Quick Check: Is Your Dev Server Running?

Run this command to see if Next.js is running:

```bash
ps aux | grep "next-server" | grep -v grep
```

If you see output, the server is running. The logs are in the terminal where you started it.

## How to See Logs Right Now

### Option 1: Find the Terminal
Look for a terminal window/tab that shows:
```
▲ Next.js 15.5.3
- Local:        http://localhost:3000
```

That's where your logs are!

### Option 2: Start Fresh (If You Can't Find It)
1. Open a new terminal
2. Navigate to your project:
   ```bash
   cd /Users/zsoltsgewinn/drift-crm
   ```
3. Start the dev server:
   ```bash
   npm run dev
   ```
4. Watch the terminal - all logs will appear here

### Option 3: Check Browser Console
1. Open your app in the browser
2. Press `F12` or `Cmd+Option+I`
3. Click **Console** tab
4. Try asking a question in the chat
5. Look for error messages

## What to Look For

When you ask a question and get an error, look for:

1. **`[Agent Executor]`** - Core execution errors
2. **`[Conversation Message]`** - API route errors
3. **`[Chat Interface]`** - Frontend errors
4. **`OPENAI_API_KEY`** - Missing API key errors
5. **`Step not found`** - Missing step errors
6. **`Error loading step`** - Database errors

## Still Can't Find Logs?

1. **Check if dev server is running:**
   ```bash
   lsof -i :3000
   ```

2. **Start the dev server if it's not running:**
   ```bash
   cd /Users/zsoltsgewinn/drift-crm
   npm run dev
   ```

3. **Check Electron logs:**
   If using Electron, the logs might be in the terminal where you ran `npm run electron`

