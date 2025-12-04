import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Debug endpoint to check environment variables
 * GET /api/debug/env-check
 * 
 * This helps verify if ELEVENLABS_API_KEY is accessible
 */
export async function GET() {
  // Check if API key exists (don't expose the actual key)
  const hasKey = !!process.env.ELEVENLABS_API_KEY;
  const keyLength = process.env.ELEVENLABS_API_KEY?.length || 0;
  const keyStartsWith = process.env.ELEVENLABS_API_KEY?.startsWith('sk_') || false;
  
  // Get all env vars that contain 'ELEVEN' (for debugging)
  const elevenVars = Object.keys(process.env)
    .filter(k => k.toUpperCase().includes('ELEVEN'))
    .map(k => ({
      name: k,
      exists: true,
      length: process.env[k]?.length || 0,
      startsWithSk: process.env[k]?.startsWith('sk_') || false,
    }));

  return NextResponse.json({
    eLEVENLABS_API_KEY: {
      exists: hasKey,
      length: keyLength,
      startsWithSk: keyStartsWith,
      // Don't expose the actual key value
    },
    allElevenVars: elevenVars,
    message: hasKey 
      ? "✅ ELEVENLABS_API_KEY is set" 
      : "❌ ELEVENLABS_API_KEY is NOT set",
    instructions: hasKey
      ? "If voices still don't load, check: 1) API key permissions, 2) Vercel logs for API errors"
      : "Go to Vercel → Settings → Environment Variables → Add ELEVENLABS_API_KEY → Enable for Production → Redeploy",
  });
}





