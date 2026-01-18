# Desktop App Guide

## 🚀 Quick Start

### Run the Desktop App

**Option 1: Production Mode (Recommended)**
```bash
npm run electron
```
This opens the desktop app and loads your live Vercel deployment.

**Option 2: Development Mode**
```bash
# Terminal 1: Start Next.js dev server
npm run dev

# Terminal 2: Start Electron (in a new terminal)
npm run electron:dev
```
This opens the desktop app and loads `http://localhost:3000`.

## 📦 Build for Distribution

### macOS
```bash
npm run electron:build:mac
```
Creates a `.dmg` file in `dist-electron/` that you can share.

### Windows
```bash
npm run electron:build:win
```
Creates a `.exe` installer in `dist-electron/`.

### Linux
```bash
npm run electron:build:linux
```
Creates an `.AppImage` in `dist-electron/`.

## 🎯 Features

- ✅ Native desktop window (1400x900, resizable)
- ✅ Works with your Vercel deployment
- ✅ External links open in default browser
- ✅ Can be built into installers for distribution
- ✅ Auto-updates URL if one fails

## 🔧 Configuration

The app automatically tries these URLs in order:
1. Latest production URL (from Vercel)
2. Previous production URLs (fallbacks)
3. Custom domain (`driftai.studio`)

To use a specific URL, set the environment variable:
```bash
ELECTRON_APP_URL=https://your-url.com npm run electron
```

## 📝 Notes

- The desktop app requires internet to connect to Vercel
- All data and API calls go through your Vercel deployment
- The app behaves like a native desktop application
- Window size: 1400x900 (minimum: 1200x700)

## 🐛 Troubleshooting

**App won't open?**
- Make sure you've run `npm install` first
- Check that Electron is installed: `npm list electron`

**Can't connect?**
- Check your internet connection
- Verify the Vercel URL is accessible in your browser
- The app will show an error dialog with details

**Want to update the URL?**
- Edit `electron/main.js` and update the `productionUrls` array



