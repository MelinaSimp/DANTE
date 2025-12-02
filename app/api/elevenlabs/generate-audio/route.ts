import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30; // 30 seconds for audio generation

/**
 * ElevenLabs Audio Generation API
 * POST /api/elevenlabs/generate-audio
 * 
 * Generates audio from text using ElevenLabs API
 * Returns a public URL to the audio file
 */
export async function POST(req: NextRequest) {
  try {
    const { text, voiceId } = await req.json();

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return NextResponse.json(
        { error: "Text is required" },
        { status: 400 }
      );
    }

    if (!voiceId || typeof voiceId !== "string") {
      return NextResponse.json(
        { error: "Voice ID is required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ElevenLabs API key not configured" },
        { status: 500 }
      );
    }

    // Call ElevenLabs API to generate audio
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          Accept: "audio/mpeg",
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({
          text: text.trim(),
          model_id: "eleven_turbo_v2_5", // Faster model for lower latency
          voice_settings: {
            stability: 0.4, // Lower stability = faster generation
            similarity_boost: 0.7, // Slightly lower for speed
            style: 0.0, // Neutral style for faster processing
            use_speaker_boost: false, // Disable for speed
          },
          output_format: "mp3_44100_128", // Lower quality = faster generation
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ElevenLabs API error:", errorText);
      return NextResponse.json(
        { error: "Failed to generate audio", details: errorText },
        { status: response.status }
      );
    }

    // Get audio as ArrayBuffer
    const audioBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(audioBuffer);

    // Generate a cache key based on text and voice
    const cacheKey = Buffer.from(`${voiceId}-${text.substring(0, 50)}-${Date.now()}`)
      .toString("base64")
      .replace(/[^a-zA-Z0-9]/g, "")
      .substring(0, 50);

    // Store in cache
    const { storeAudioInCache } = await import("@/lib/elevenlabs/cache");
    storeAudioInCache(cacheKey, buffer);

    // Get base URL for the audio URL
    const baseUrl = process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL || "";
    let audioUrl = `/api/elevenlabs/audio/${cacheKey}`;
    
    if (baseUrl) {
      const cleanBaseUrl = baseUrl.replace(/\/+$/, "").trim();
      audioUrl = `${cleanBaseUrl}${audioUrl}`;
    }

    return NextResponse.json({
      audioUrl,
      cacheKey,
    });
  } catch (error: any) {
    console.error("ElevenLabs audio generation error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

