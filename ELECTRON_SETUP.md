# Electron Desktop App Setup

## 🚀 Running the Desktop App

### Quick Start (Mac)

1. **Open Terminal** in your project directory:
   ```bash
   cd /Users/zsoltsgewinn/drift-crm
   ```

2. **Run the Electron app:**
   ```bash
   npm run electron
   ```

   This will:
   - Build the Next.js app (if needed)
   - Open the Electron desktop app
   - Load `https://driftai.studio` in a desktop window

### Development Mode

To run with DevTools open (for debugging):

```bash
npm run electron:dev
```

### Debug Mode

To run with extra debugging:

```bash
npm run electron:debug
```

---

## 📱 What You'll See

- A desktop window opens
- The app loads `https://driftai.studio`
- It looks and feels like a native Mac app
- You can resize, minimize, etc.

---

## 🔧 Troubleshooting

### If the app doesn't open:

1. **Check if Electron is installed:**
   ```bash
   npm list electron
   ```

2. **If not installed, install it:**
   ```bash
   npm install
   ```

3. **Try building first:**
   ```bash
   npm run build
   npm run electron
   ```

### If you see "Failed to Load App":

- Make sure `https://driftai.studio` is accessible in your browser
- Check your internet connection
- The app will show an error dialog with details

### If you want to use a different URL:

Set the `ELECTRON_APP_URL` environment variable:

```bash
ELECTRON_APP_URL=https://your-url.com npm run electron
```

---

## 🎯 Features

- ✅ Native Mac app window
- ✅ Opens your web app in a desktop window
- ✅ External links open in your default browser
- ✅ Works offline (caches the web app)
- ✅ Can be built into a `.app` file for distribution

---

## 📦 Building for Distribution

To create a distributable Mac app:

```bash
npm run electron:build:mac
```

This creates a `.dmg` file in the `dist-electron` folder that you can share.

---

## 💡 Tips

- The app automatically loads `https://driftai.studio`
- If the domain isn't working, it will show an error
- You can resize the window like any Mac app
- Close the window to quit (or use Cmd+Q)

---

**That's it!** Just run `npm run electron` and you'll have a desktop app version of your web app.

