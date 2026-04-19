// lib/app-url.ts
// Centralized resolver for the app's canonical base URL.
//
// Priority:
//   1. NEXT_PUBLIC_APP_URL (explicit canonical URL — set this on Vercel)
//   2. APP_BASE_URL        (legacy alias for the same thing)
//   3. https://$VERCEL_URL (Vercel preview/prod deployment URL)
//   4. http://localhost:3000 (local dev only)
//
// In production we refuse to fall back to localhost: that would put a
// localhost URL into Stripe return URLs, invite emails, etc. Better to
// surface the misconfiguration loudly than to silently ship broken links.

export function getAppUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL;
  if (explicit) {
    // .trim() guards against the classic Vercel env paste-with-newline
    // bug (a trailing `\n` makes every downstream URL malformed and
    // things like VAPI's assistant config reject the webhook URL).
    return explicit.trim().replace(/\/$/, "");
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.trim()}`;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[getAppUrl] NEXT_PUBLIC_APP_URL is not configured. Set it in your Vercel project settings."
    );
  }

  return "http://localhost:3000";
}
