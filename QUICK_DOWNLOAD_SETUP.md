# Quick Setup: Website Downloads

## 🚀 3-Step Setup

### Step 1: Build the App
```bash
./BUILD_AND_DISTRIBUTE.sh
```

### Step 2: Copy Files to Website
```bash
./setup-downloads.sh
```

### Step 3: Deploy
```bash
git add public/downloads/ app/download/
git commit -m "Add desktop app downloads"
git push
```

**Done!** Users can now download from: `https://driftai.studio/download`

---

## What Gets Created

- ✅ Download page at `/download`
- ✅ Files in `public/downloads/`:
  - `Drift-AI-1.0.0.dmg` (macOS)
  - `Drift-AI-Setup-1.0.0.exe` (Windows)
  - `Drift-AI-1.0.0.AppImage` (Linux)

---

## Testing Locally

```bash
npm run dev
```

Visit: `http://localhost:3000/download`

---

## File Size Note

Vercel free tier has a 100MB limit. If files are larger:
- Use Vercel Pro (unlimited)
- Or host on CDN and update links in `app/download/page.tsx`

---

**See `WEBSITE_DOWNLOAD_SETUP.md` for detailed instructions.**



