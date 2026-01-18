# Distribution Guide - Making Drift AI Available for Download

## 🚀 Quick Start

### Step 1: Build the App

**For macOS:**
```bash
npm run build
npm run electron:build:mac
```
This creates a `.dmg` file in `dist-electron/` that users can download and install.

**For Windows:**
```bash
npm run build
npm run electron:build:win
```
This creates a `.exe` installer in `dist-electron/`.

**For Linux:**
```bash
npm run build
npm run electron:build:linux
```
This creates an `.AppImage` in `dist-electron/`.

**For All Platforms:**
```bash
npm run build
npm run electron:build
```

---

## 📦 Distribution Options

### Option 1: GitHub Releases (Recommended)

1. **Build the app:**
   ```bash
   npm run electron:build
   ```

2. **Create a GitHub Release:**
   - Go to your GitHub repository
   - Click "Releases" → "Create a new release"
   - Tag version (e.g., `v1.0.0`)
   - Upload the files from `dist-electron/`:
     - `Drift AI-1.0.0.dmg` (macOS)
     - `Drift AI Setup 1.0.0.exe` (Windows)
     - `Drift AI-1.0.0.AppImage` (Linux)

3. **Add release notes:**
   ```
   ## What's New
   - Initial desktop app release
   - Native desktop experience
   - Works with Vercel backend
   ```

4. **Share the release URL:**
   Users can download from: `https://github.com/yourusername/drift-crm/releases`

---

### Option 2: Your Website

1. **Build the app** (same as above)

2. **Upload to your website:**
   - Upload files from `dist-electron/` to your web server
   - Create a downloads page (e.g., `https://driftai.studio/download`)

3. **Create a simple download page:**
   ```html
   <!DOCTYPE html>
   <html>
   <head>
     <title>Download Drift AI</title>
   </head>
   <body>
     <h1>Download Drift AI Desktop App</h1>
     <div>
       <a href="/downloads/Drift-AI-1.0.0.dmg">Download for macOS</a>
       <a href="/downloads/Drift-AI-Setup-1.0.0.exe">Download for Windows</a>
       <a href="/downloads/Drift-AI-1.0.0.AppImage">Download for Linux</a>
     </div>
   </body>
   </html>
   ```

---

### Option 3: Cloud Storage (Dropbox, Google Drive, etc.)

1. **Build the app**

2. **Upload to cloud storage:**
   - Upload files to Dropbox, Google Drive, or similar
   - Create shareable links
   - Share links with users

---

## 🔐 Code Signing (Optional but Recommended)

### macOS Code Signing

1. **Get an Apple Developer account** ($99/year)
2. **Create certificates:**
   - Developer ID Application certificate
   - Developer ID Installer certificate

3. **Update `package.json`:**
   ```json
   "mac": {
     "category": "public.app-category.business",
     "target": "dmg",
     "icon": "public/brand/logo-circle.png",
     "hardenedRuntime": true,
     "gatekeeperAssess": false,
     "entitlements": "build/entitlements.mac.plist",
     "entitlementsInherit": "build/entitlements.mac.plist",
     "identity": "Developer ID Application: Your Name (TEAM_ID)"
   }
   ```

4. **Build with signing:**
   ```bash
   npm run electron:build:mac
   ```

### Windows Code Signing

1. **Get a code signing certificate** (from DigiCert, Sectigo, etc.)

2. **Update `package.json`:**
   ```json
   "win": {
     "target": "nsis",
     "icon": "public/brand/logo-circle.png",
     "certificateFile": "path/to/certificate.pfx",
     "certificatePassword": "your-password"
   }
   ```

---

## 📝 Version Management

### Update Version

1. **Update `package.json`:**
   ```json
   "version": "1.0.0"
   ```

2. **Rebuild:**
   ```bash
   npm run electron:build
   ```

3. **Create new release** with updated version

---

## 🎯 Recommended Distribution Workflow

1. **Build for all platforms:**
   ```bash
   npm run build
   npm run electron:build
   ```

2. **Test each build:**
   - Test macOS `.dmg` on a Mac
   - Test Windows `.exe` on Windows
   - Test Linux `.AppImage` on Linux

3. **Create GitHub Release:**
   - Tag: `v1.0.0`
   - Upload all platform files
   - Add release notes

4. **Share download link:**
   - GitHub Releases: `https://github.com/yourusername/drift-crm/releases/latest`
   - Or your website: `https://driftai.studio/download`

---

## 📋 Distribution Checklist

- [ ] Build app for all target platforms
- [ ] Test each build on respective OS
- [ ] Update version number in `package.json`
- [ ] Create GitHub Release (or upload to website)
- [ ] Add release notes/changelog
- [ ] Share download link with users
- [ ] (Optional) Set up code signing
- [ ] (Optional) Set up auto-updates

---

## 🔄 Auto-Updates (Advanced)

To enable automatic updates, you'll need:

1. **Update server** (hosts version info)
2. **electron-updater** package
3. **Signed builds** (required for auto-updates)

This is more complex and can be added later if needed.

---

## 💡 Tips

- **File sizes:** Expect ~100-200MB per platform
- **Update frequency:** Rebuild when you deploy major updates to Vercel
- **Versioning:** Use semantic versioning (1.0.0, 1.1.0, 2.0.0)
- **Testing:** Always test builds before distributing
- **Support:** Provide a way for users to report issues

---

## 🚨 Important Notes

- The desktop app requires internet to connect to Vercel
- Users need to have the latest Vercel URL (app includes fallbacks)
- If you change Vercel URLs, rebuild and redistribute
- Consider adding a "Check for Updates" feature

---

**Ready to distribute?** Run `npm run electron:build` and upload the files to GitHub Releases or your website!



