# Google OAuth Setup Guide

## Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Note your project name

## Step 2: Enable Google Calendar API

1. Go to **APIs & Services** → **Library**
2. Search for "Google Calendar API"
3. Click **Enable**

## Step 3: Create OAuth Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. If prompted, configure OAuth consent screen first:
   - User Type: **External** (unless you have Google Workspace)
   - App name: **Drift CRM**
   - User support email: Your email
   - Developer contact: Your email
   - Click **Save and Continue**
   - Scopes: Click **Add or Remove Scopes**
     - Add: `https://www.googleapis.com/auth/calendar`
     - Add: `https://www.googleapis.com/auth/spreadsheets.readonly`
   - Click **Save and Continue**
   - Test users: Add your email (if in testing mode)
   - Click **Save and Continue**
   - Click **Back to Dashboard**

4. Create OAuth Client ID:
   - Application type: **Web application**
   - Name: **Drift CRM**
   - Authorized redirect URIs: Add:
     ```
     https://drift-pg8nvyuf6-drift4.vercel.app/api/integrations/google/oauth
     ```
   - Click **Create**
   - **Copy your Client ID and Client Secret** (you'll need these)

## Step 4: Add to Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project: **drift-crm**
3. Go to **Settings** → **Environment Variables**
4. Add:
   - **GOOGLE_CLIENT_ID**: (paste your Client ID)
   - **GOOGLE_CLIENT_SECRET**: (paste your Client Secret)
   - Make sure to check **Production**, **Preview**, and **Development**
5. Click **Save**
6. **Redeploy** your project:
   - Go to **Deployments**
   - Click the three dots on latest deployment
   - Click **Redeploy**

## Step 5: Test

1. Go to your app
2. Click **Connect Google Calendar**
3. You should be redirected to Google's OAuth page
4. Authorize access
5. You'll be redirected back to your app

## Troubleshooting

- **"Redirect URI mismatch"**: Make sure the redirect URI in Google Cloud Console exactly matches your Vercel URL
- **"Invalid client"**: Double-check that Client ID and Secret are correct in Vercel
- **"Access blocked"**: Make sure you've added yourself as a test user (if in testing mode)

