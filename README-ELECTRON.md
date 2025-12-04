# Desktop App Setup

This app can be run as a desktop application using Electron. The desktop app loads your Vercel-hosted web application in a native window.

## How It Works

- **Vercel**: Hosts your web app (backend API, database connections, etc.)
- **Electron**: Wraps the web app in a desktop window
- The desktop app connects to your Vercel deployment

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Update the production URL:**
   Edit `electron/main.js` and update the production URL to your current Vercel deployment:
   ```javascript
   const url = isDev 
     ? 'http://localhost:3000' 
     : 'https://your-vercel-url.vercel.app';
   ```

## Running the Desktop App

### Development Mode
```bash
# Terminal 1: Start Next.js dev server
npm run dev

# Terminal 2: Start Electron
npm run electron:dev
```

### Production Mode
```bash
npm run electron
```
This will load your Vercel-hosted app.

## Building Desktop Installers

### macOS
```bash
npm run electron:build:mac
```
Creates a `.dmg` file in `dist-electron/`

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

### All Platforms
```bash
npm run electron:build
```

## Configuration

- **App ID**: `com.drift.ai` (edit in `package.json` → `build.appId`)
- **App Name**: "Drift AI" (edit in `package.json` → `build.productName`)
- **Icon**: Uses `public/brand/logo-circle.png`
- **Window Size**: 1400x900 (minimum 1200x700)

## Notes

- The desktop app requires an internet connection to connect to Vercel
- All API calls go through your Vercel deployment
- The app behaves like a native desktop application
- External links open in the default browser

## Updating the Production URL

When you deploy a new version to Vercel, update the URL in `electron/main.js` or set the `ELECTRON_APP_URL` environment variable.








