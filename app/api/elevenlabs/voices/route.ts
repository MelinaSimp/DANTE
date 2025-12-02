import { NextResponse } from "next/server";
import { getAvailableVoices } from "@/lib/elevenlabs/tts";

export const dynamic = "force-dynamic";

/**
 * Get available ElevenLabs voices
 * GET /api/elevenlabs/voices
 */
export async function GET() {
  try {
    // Check if API key is set - check all possible env var names
    const apiKey = process.env.ELEVENLABS_API_KEY || 
                   process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY ||
                   process.env.ELEVENLABS_KEY;
    
    // Debug logging
    console.log("[ElevenLabs Voices API] Environment check:");
    console.log("- ELEVENLABS_API_KEY exists:", !!process.env.ELEVENLABS_API_KEY);
    console.log("- ELEVENLABS_API_KEY length:", process.env.ELEVENLABS_API_KEY?.length || 0);
    console.log("- All env vars with 'ELEVEN':", Object.keys(process.env).filter(k => k.includes('ELEVEN')));
    
    if (!apiKey) {
      console.error("ELEVENLABS_API_KEY is not set in environment variables");
      return NextResponse.json(
        { 
          error: "ELEVENLABS_API_KEY is not configured", 
          details: "The environment variable is not set or not accessible. Make sure it's added to Vercel and the deployment was restarted.",
          voices: [] 
        },
        { status: 500 }
      );
    }

    // Check if API key looks valid (starts with 'sk_')
    if (!apiKey.startsWith('sk_')) {
      console.warn("ELEVENLABS_API_KEY doesn't look like a valid key (should start with 'sk_')");
    }

    const voices = await getAvailableVoices();
    
    // Log for debugging
    console.log(`[ElevenLabs Voices API] Returning ${voices.length} voices`);
    
    if (voices.length === 0) {
      console.warn("[ElevenLabs Voices API] No voices returned - check API key and permissions");
      return NextResponse.json(
        { 
          error: "No voices returned from ElevenLabs API", 
          details: "API key may be invalid or missing required permissions. Check: 1) API key is correct, 2) API key has 'Voices: Read' permission, 3) API key is not expired.",
          voices: [] 
        },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ voices });
  } catch (error: any) {
    console.error("Error fetching voices:", error);
    const errorMessage = error.message || "Unknown error occurred";
    const errorDetails = errorMessage.includes("401") || errorMessage.includes("Unauthorized")
      ? "API key is invalid or expired. Check your ElevenLabs API key."
      : errorMessage.includes("403") || errorMessage.includes("Forbidden")
      ? "API key doesn't have 'Voices: Read' permission. Update permissions in ElevenLabs dashboard."
      : errorMessage;
    
    return NextResponse.json(
      { 
        error: "Failed to fetch voices", 
        details: errorDetails,
        voices: [] 
      },
      { status: 500 }
    );
  }
}

