# Setting Up Downloads on Your Website

## Quick Setup Guide

### Step 1: Build the Desktop App

Run the build script to create installers:
```bash
./BUILD_AND_DISTRIBUTE.sh
```

This creates files in `dist-electron/`:
- `Drift AI-1.0.0.dmg` (macOS)
- `Drift AI Setup 1.0.0.exe` (Windows)
- `Drift AI-1.0.0.AppImage` (Linux)

---

### Step 2: Upload Files to Your Website

#### Option A: Vercel (Recommended - Automatic)

1. **Create a `public/downloads/` folder** in your project:
   ```bash
   mkdir -p public/downloads
   ```

2. **Copy the built files** to `public/downloads/`:
   ```bash
   cp dist-electron/Drift\ AI-1.0.0.dmg public/downloads/
   cp dist-electron/Drift\ AI\ Setup\ 1.0.0.exe public/downloads/Drift-AI-Setup-1.0.0.exe
   cp dist-electron/Drift\ AI-1.0.0.AppImage public/downloads/
   ```

3. **Rename files** (remove spaces for URLs):
   ```bash
   cd public/downloads
   mv "Drift AI-1.0.0.dmg" "Drift-AI-1.0.0.dmg"
   mv "Drift AI-1.0.0.AppImage" "Drift-AI-1.0.0.AppImage"
   ```

4. **Commit and push** to GitHub:
   ```bash
   git add public/downloads/
   git commit -m "Add desktop app downloads"
   git push
   ```

5. **Vercel will automatically deploy** and files will be available at:
   - `https://driftai.studio/downloads/Drift-AI-1.0.0.dmg`
   - `https://driftai.studio/downloads/Drift-AI-Setup-1.0.0.exe`
   - `https://driftai.studio/downloads/Drift-AI-1.0.0.AppImage`

#### Option B: Manual Upload to Server

1. **Upload files** from `dist-electron/` to your web server
2. **Place them** in a `/downloads/` directory
3. **Ensure files are accessible** via HTTP (not blocked by server config)

---

### Step 3: Access the Download Page

The download page is already created at:
- **URL:** `https://driftai.studio/download`
- **File:** `app/download/page.tsx`

Users can now:
1. Visit `https://driftai.studio/download`
2. Click their platform (macOS/Windows/Linux)
3. Download the installer

---

### Step 4: Add Download Link to Navigation (Optional)

Add a "Download" link to your main navigation:

```tsx
// In your navigation component
<Link href="/download">Download</Link>
```

---

## File Structure

After setup, your project should have:

```
public/
  downloads/
    Drift-AI-1.0.0.dmg
    Drift-AI-Setup-1.0.0.exe
    Drift-AI-1.0.0.AppImage

app/
  download/
    page.tsx  (Download page)
```

---

## Updating Downloads

When you release a new version:

1. **Update version** in `package.json`:
   ```json
   "version": "1.1.0"
   ```

2. **Rebuild:**
   ```bash
   ./BUILD_AND_DISTRIBUTE.sh
   ```

3. **Update files** in `public/downloads/`:
   ```bash
   cp dist-electron/Drift\ AI-1.1.0.dmg public/downloads/Drift-AI-1.1.0.dmg
   # ... etc
   ```

4. **Update download links** in `app/download/page.tsx`:
   ```tsx
   href="/downloads/Drift-AI-1.1.0.dmg"
   ```

5. **Commit and push** to deploy

---

## Testing

1. **Build the app:**
   ```bash
   ./BUILD_AND_DISTRIBUTE.sh
   ```

2. **Copy files to public/downloads:**
   ```bash
   mkdir -p public/downloads
   cp dist-electron/*.dmg public/downloads/Drift-AI-1.0.0.dmg
   cp dist-electron/*.exe public/downloads/Drift-AI-Setup-1.0.0.exe
   cp dist-electron/*.AppImage public/downloads/Drift-AI-1.0.0.AppImage
   ```

3. **Test locally:**
   ```bash
   npm run dev
   ```
   Visit: `http://localhost:3000/download`

4. **Deploy to Vercel:**
   ```bash
   git add .
   git commit -m "Add desktop app downloads"
   git push
   ```

---

## File Sizes

Expect these file sizes:
- macOS `.dmg`: ~150-200MB
- Windows `.exe`: ~150-200MB
- Linux `.AppImage`: ~150-200MB

**Note:** Vercel has a 100MB file size limit for free tier. For larger files:
- Use Vercel Pro (unlimited)
- Or host files on a CDN (Cloudflare, AWS S3, etc.)
- Or use GitHub Releases and link to them

---

## Using a CDN (For Large Files)

If files exceed Vercel's limit:

1. **Upload to CDN** (Cloudflare, AWS S3, etc.)
2. **Update download links** in `app/download/page.tsx`:
   ```tsx
   href="https://cdn.driftai.studio/downloads/Drift-AI-1.0.0.dmg"
   ```

---

## Quick Commands

**One-time setup:**
```bash
# Build app
./BUILD_AND_DISTRIBUTE.sh

# Create downloads folder
mkdir -p public/downloads

# Copy and rename files
cp "dist-electron/Drift AI-1.0.0.dmg" "public/downloads/Drift-AI-1.0.0.dmg"
cp "dist-electron/Drift AI Setup 1.0.0.exe" "public/downloads/Drift-AI-Setup-1.0.0.exe"
cp "dist-electron/Drift AI-1.0.0.AppImage" "public/downloads/Drift-AI-1.0.0.AppImage"

# Deploy
git add public/downloads/ app/download/
git commit -m "Add desktop app downloads"
git push
```

---

**That's it!** Users can now download from `https://driftai.studio/download`



