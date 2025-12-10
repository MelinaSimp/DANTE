# Custom Domain Setup for driftai.studio

## Step 1: Configure Domain in Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project: **drift-crm**
3. Go to **Settings** → **Domains**
4. Click **"Add Domain"**
5. Enter: `driftai.studio`
6. Vercel will show you DNS records to add

## Step 2: Add DNS Records

Vercel will provide you with DNS records. Typically you need:

**Option A: CNAME (Recommended)**
- Type: `CNAME`
- Name: `@` (or root domain)
- Value: `cname.vercel-dns.com`

**Option B: A Records**
- Type: `A`
- Name: `@`
- Value: Vercel's IP addresses (they'll provide these)

Add these records in your domain registrar's DNS settings (where you bought driftai.studio).

## Step 3: Update Google Cloud Console

### Branding Page:
1. **Application home page**: `https://driftai.studio`
2. **Authorized domains**: Add `driftai.studio` (without https://)
3. Click **Save**

### Clients Page:
1. Go to **Clients** → Click **"Drift OAuth"**
2. Under **"Authorized redirect URIs"**, add:
   ```
   https://driftai.studio/api/integrations/google/oauth
   ```
3. Click **Save**

## Step 4: Wait for DNS Propagation

- DNS changes can take 5 minutes to 48 hours
- Usually takes 5-30 minutes
- Check status in Vercel Dashboard → Domains

## Step 5: Test

Once DNS is active:
1. Visit `https://driftai.studio`
2. Try connecting Google Calendar
3. OAuth should work with your custom domain!

## Troubleshooting

- **Domain not working**: Check DNS records are correct
- **SSL Certificate**: Vercel automatically provisions SSL certificates
- **OAuth errors**: Make sure redirect URI matches exactly in Google Cloud Console

