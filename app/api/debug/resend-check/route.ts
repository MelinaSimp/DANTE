import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Debug endpoint to check if RESEND_API_KEY is accessible
 * GET /api/debug/resend-check
 */
export async function GET() {
  const hasKey = !!process.env.RESEND_API_KEY;
  const keyLength = process.env.RESEND_API_KEY?.length || 0;
  const keyStartsWith = process.env.RESEND_API_KEY?.startsWith('re_') || false;
  
  // Get all env vars that contain 'RESEND' (for debugging)
  const resendVars = Object.keys(process.env)
    .filter(k => k.toUpperCase().includes('RESEND'))
    .map(k => ({
      name: k,
      exists: true,
      length: process.env[k]?.length || 0,
      startsWithRe: process.env[k]?.startsWith('re_') || false,
    }));

  return NextResponse.json({
    RESEND_API_KEY: {
      exists: hasKey,
      length: keyLength,
      startsWithRe: keyStartsWith,
      // Don't expose the actual key value
    },
    allResendVars: resendVars,
    message: hasKey 
      ? "✅ RESEND_API_KEY is set" 
      : "❌ RESEND_API_KEY is NOT set",
    instructions: hasKey
      ? "If emails still don't send, check: 1) Domain verification in Resend, 2) Vercel logs for API errors"
      : "Go to Vercel → Settings → Environment Variables → Add RESEND_API_KEY → Enable for Production → Redeploy",
  });
}


