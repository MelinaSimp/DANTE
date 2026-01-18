# How to Make Drift AI Available for Download

## Quick Steps

### 1. Build the App

Run this command to build for all platforms:
```bash
./BUILD_AND_DISTRIBUTE.sh
```

Or manually:
```bash
npm run build
npm run electron:build
```

This creates installers in `dist-electron/`:
- `Drift AI-1.0.0.dmg` (macOS)
- `Drift AI Setup 1.0.0.exe` (Windows)  
- `Drift AI-1.0.0.AppImage` (Linux)

---

### 2. Choose Distribution Method

#### Option A: GitHub Releases (Easiest)

1. Go to your GitHub repository
2. Click "Releases" → "Create a new release"
3. Tag: `v1.0.0`
4. Upload all files from `dist-electron/`
5. Add release notes
6. Publish

**Download URL:** `https://github.com/yourusername/drift-crm/releases/latest`

#### Option B: Your Website

1. Upload files from `dist-electron/` to your server
2. Place them in a `/downloads/` folder
3. Use the provided `public/download.html` page
4. Access at: `https://driftai.studio/download.html`

#### Option C: Cloud Storage

1. Upload to Dropbox/Google Drive
2. Create shareable links
3. Share links with users

---

### 3. Share the Download Link

Once files are uploaded, share the link:
- GitHub: `https://github.com/yourusername/drift-crm/releases/latest`
- Website: `https://driftai.studio/download.html`
- Direct: `https://yourdomain.com/downloads/Drift-AI-1.0.0.dmg`

---

## File Locations After Build

After running the build, you'll find:

```
dist-electron/
├── Drift AI-1.0.0.dmg          (macOS - ~150MB)
├── Drift AI Setup 1.0.0.exe    (Windows - ~150MB)
└── Drift AI-1.0.0.AppImage     (Linux - ~150MB)
```

---

## Updating the App

When you want to release a new version:

1. Update version in `package.json`:
   ```json
   "version": "1.1.0"
   ```

2. Rebuild:
   ```bash
   npm run build
   npm run electron:build
   ```

3. Create new release with updated files

---

## Testing Before Distribution

**Important:** Test each build before sharing:

- **macOS:** Open `.dmg`, drag to Applications, test
- **Windows:** Run `.exe` installer, test
- **Linux:** Make `.AppImage` executable (`chmod +x`), run, test

---

## Next Steps

1. ✅ Run `./BUILD_AND_DISTRIBUTE.sh` to build
2. ✅ Test each platform build
3. ✅ Upload to GitHub Releases or your website
4. ✅ Share download link with users

**See `DISTRIBUTION_GUIDE.md` for detailed instructions.**



