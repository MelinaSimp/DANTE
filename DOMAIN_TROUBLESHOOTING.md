# Domain Troubleshooting - driftai.studio

## ❌ Problem: "This site can't be reached" (ERR_FAILED)

This means `driftai.studio` isn't connected to your Vercel deployment yet.

---

## ✅ Quick Fix: Use Vercel URL for Now

**While we fix the domain, use your Vercel URL:**

1. Go to **Vercel Dashboard** → Your Project
2. Find your **production deployment URL** (looks like `drift-xxxxx.vercel.app`)
3. Use that URL instead of `driftai.studio` for now

---

## 🔧 Setting Up driftai.studio Domain

### Step 1: Add Domain in Vercel

1. Go to **Vercel Dashboard** → Your Project
2. Click **Settings** → **Domains**
3. Click **Add Domain**
4. Enter: `driftai.studio`
5. Click **Add**

### Step 2: Configure DNS

Vercel will show you DNS records to add. You need to add these to your domain registrar (where you bought driftai.studio):

**If using Vercel's nameservers:**
- Vercel will give you nameservers (like `ns1.vercel-dns.com`)
- Go to your domain registrar (GoDaddy, Namecheap, etc.)
- Update nameservers to Vercel's nameservers

**If using custom DNS:**
- Add an A record pointing to Vercel's IP
- Or add a CNAME record pointing to your Vercel deployment

### Step 3: Wait for DNS Propagation

- DNS changes can take 5 minutes to 48 hours
- Usually takes 10-30 minutes
- Check status in Vercel Dashboard → Domains

---

## 🍎 Mac Paste Issue Fix

### If You Can't Paste URLs:

**Option 1: Use Keyboard Shortcut**
- `Cmd + V` to paste (not right-click)

**Option 2: Enable Paste in Browser**
- Chrome: Settings → Privacy → Site Settings → Additional Permissions → Clipboard
- Make sure clipboard access is allowed

**Option 3: Type It Manually**
- Just type the URL in the address bar

**Option 4: Drag and Drop**
- Copy the URL from somewhere
- Drag it into the address bar

---

## 🚀 Quick Solution: Use Vercel URL

**For now, just use your Vercel deployment URL:**

1. Go to Vercel Dashboard
2. Find your project
3. Copy the production URL (e.g., `https://drift-xxxxx.vercel.app`)
4. Use that instead of `driftai.studio`

**Update Twilio webhooks to use Vercel URL:**
- Incoming: `https://your-vercel-url.vercel.app/api/twilio/incoming`
- Status: `https://your-vercel-url.vercel.app/api/twilio/status`

---

## 📝 Step-by-Step: Connect Domain (When Ready)

1. **In Vercel:**
   - Settings → Domains → Add `driftai.studio`

2. **At Your Domain Registrar:**
   - Log into where you bought driftai.studio
   - Update DNS settings as Vercel instructs

3. **Wait:**
   - 10-30 minutes for DNS to propagate

4. **Test:**
   - Visit `https://driftai.studio`
   - Should work!

---

## 💡 Why This Is Happening

The domain `driftai.studio` exists, but it's not connected to your Vercel deployment yet. It's like having a phone number that's not connected to a phone - the number exists, but calls won't go through.

**Solution:** Connect the domain in Vercel and configure DNS.

---

## 🆘 If Still Stuck

1. **Use Vercel URL for now** - It works immediately
2. **Set up domain later** - When you have time
3. **Check Vercel docs** - They have great domain setup guides

The app works fine on the Vercel URL - the domain is just a prettier address!

