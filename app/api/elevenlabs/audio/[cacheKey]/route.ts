import { NextRequest, NextResponse } from "next/server";
import { getAudioFromCache } from "@/lib/elevenlabs/cache";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Serve cached audio files
 * GET /api/elevenlabs/audio/[cacheKey]
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ cacheKey: string }> }
) {
  try {
    const { cacheKey } = await params;

    // Check cache first
    let audioBuffer = getAudioFromCache(cacheKey);

    // If not in cache, try to decode and regenerate
    if (!audioBuffer) {
      try {
        // Decode cache key: base64(voiceId|text)
        let base64Key = cacheKey.replace(/-/g, "+").replace(/_/g, "/");
        const paddingNeeded = (4 - (base64Key.length % 4)) % 4;
        base64Key += "=".repeat(paddingNeeded);

        const decoded = Buffer.from(base64Key, "base64").toString("utf-8");
        const parts = decoded.split("|");

        if (parts.length >= 2) {
          const voiceId = parts[0];
          const text = parts.slice(1).join("|");

          const apiKey = process.env.ELEVENLABS_API_KEY;
          if (apiKey) {
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
                  model_id: "eleven_turbo_v2_5",
                  voice_settings: {
                    stability: 0.4,
                    similarity_boost: 0.7,
                    style: 0.0,
                    use_speaker_boost: false,
                  },
                  output_format: "mp3_44100_128",
                }),
              }
            );

            if (response.ok) {
              const audioArrayBuffer = await response.arrayBuffer();
              audioBuffer = Buffer.from(audioArrayBuffer);

              const { storeAudioInCache } = await import("@/lib/elevenlabs/cache");
              storeAudioInCache(cacheKey, audioBuffer);
            } else {
              const errorText = await response.text();
              console.error("[Audio] ElevenLabs API error:", response.status, errorText);
            }
          } else {
            console.error("[Audio] ELEVENLABS_API_KEY not configured");
          }
        } else {
          console.error("[Audio] Invalid cache key format");
        }
      } catch (decodeError: unknown) {
        console.error("[Audio] Failed to decode cache key:", decodeError instanceof Error ? decodeError.message : decodeError);
      }
    }

    if (audioBuffer) {
      return new NextResponse(new Uint8Array(audioBuffer), {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg",
          "Content-Length": audioBuffer.length.toString(),
          "Cache-Control": "public, max-age=3600",
          "Accept-Ranges": "bytes",
        },
      });
    }

    return new NextResponse("Audio not found", {
      status: 404,
      headers: { "Content-Type": "text/plain" },
    });
  } catch (error: unknown) {
    console.error("[Audio] Unexpected error:", error instanceof Error ? error.message : error);
    return new NextResponse("Internal server error", {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }
}
