# How to Open the Desktop App

## Quick Start

### Option 1: Production Mode (Loads Vercel App)
```bash
npm run electron
```
This opens the desktop app and loads your live Vercel deployment at `https://drift-n2gcspjqm-drift4.vercel.app`

### Option 2: Development Mode (Loads Local Server)
```bash
# Terminal 1: Start Next.js dev server
npm run dev

# Terminal 2: Start Electron (in a new terminal)
npm run electron:dev
```
This opens the desktop app and loads `http://localhost:3000`

## What You'll See

- A native desktop window (1400x900 pixels)
- Your Drift AI app loaded inside
- All functionality works exactly like the web version
- The app connects to your Vercel backend

## Building Installers

To create distributable installers for other users:

### macOS
```bash
npm run electron:build:mac
```
Creates a `.dmg` file in `dist-electron/` that you can share

### Windows
```bash
npm run electron:build:win
```
Creates a `.exe` installer in `dist-electron/`

### Linux
```bash
npm run electron:build:linux
```
Creates an `.AppImage` in `dist-electron/`

## Troubleshooting

- **App won't open?** Make sure you've run `npm install` first
- **Can't connect?** Check your internet connection (app needs to reach Vercel)
- **Wrong URL?** Update `electron/main.js` with your current Vercel URL

## Notes

- The desktop app requires internet to connect to Vercel
- All data and API calls go through your Vercel deployment
- External links automatically open in your default browser
- The app behaves like a native desktop application








