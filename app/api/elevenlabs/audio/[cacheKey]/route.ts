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
  const startTime = Date.now();
  try {
    const { cacheKey } = await params;
    const userAgent = req.headers.get("user-agent") || "unknown";
    const referer = req.headers.get("referer") || "none";
    
    console.log("=".repeat(80));
    console.log("[Audio Endpoint] ===== NEW REQUEST =====");
    console.log("[Audio Endpoint] Cache key:", cacheKey);
    console.log("[Audio Endpoint] Cache key length:", cacheKey.length);
    console.log("[Audio Endpoint] User-Agent:", userAgent);
    console.log("[Audio Endpoint] Referer:", referer);
    console.log("[Audio Endpoint] Full URL:", req.url);

    // Check cache first
    let audioBuffer = getAudioFromCache(cacheKey);
    console.log("[Audio Endpoint] Cache hit:", !!audioBuffer);

    // If not in cache, try to decode and regenerate
    if (!audioBuffer) {
      console.log("[Audio Endpoint] ⚠️ Cache miss - attempting to decode and regenerate");
      try {
        // Decode cache key: base64(voiceId|text)
        // Handle URL-safe base64: replace - with + and _ with /, add padding if needed
        let base64Key = cacheKey.replace(/-/g, "+").replace(/_/g, "/");
        
        // Add padding if needed (base64 strings should be multiple of 4)
        const paddingNeeded = (4 - (base64Key.length % 4)) % 4;
        base64Key += "=".repeat(paddingNeeded);
        
        console.log("[Audio Endpoint] Original cache key:", cacheKey);
        console.log("[Audio Endpoint] Base64 key (after replacements):", base64Key);
        
        const decoded = Buffer.from(base64Key, "base64").toString("utf-8");
        console.log("[Audio Endpoint] Decoded string:", decoded.substring(0, 100));
        
        const parts = decoded.split("|");
        console.log("[Audio Endpoint] Split parts count:", parts.length);
        
        if (parts.length >= 2) {
          const voiceId = parts[0];
          const text = parts.slice(1).join("|");
          
          console.log("[Audio Endpoint] ✅ Decoded successfully");
          console.log("[Audio Endpoint] Voice ID:", voiceId);
          console.log("[Audio Endpoint] Text length:", text.length);
          console.log("[Audio Endpoint] Text preview:", text.substring(0, 50));
          
          // Generate audio on-demand
          const apiKey = process.env.ELEVENLABS_API_KEY;
          if (apiKey) {
            console.log("[Audio Endpoint] Calling ElevenLabs API...");
            const apiStartTime = Date.now();
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

            const apiDuration = Date.now() - apiStartTime;
            console.log("[Audio Endpoint] ElevenLabs API response status:", response.status);
            console.log("[Audio Endpoint] ElevenLabs API call duration:", apiDuration, "ms");

            if (response.ok) {
              const audioArrayBuffer = await response.arrayBuffer();
              audioBuffer = Buffer.from(audioArrayBuffer);
              
              // Store in cache for future requests
              const { storeAudioInCache } = await import("@/lib/elevenlabs/cache");
              storeAudioInCache(cacheKey, audioBuffer);
              console.log("[Audio Endpoint] ✅ Generated audio on-demand, size:", audioBuffer.length, "bytes");
              console.log("[Audio Endpoint] Total generation time:", apiDuration, "ms");
            } else {
              const errorText = await response.text();
              console.error("[Audio Endpoint] ❌ ElevenLabs API error:", response.status, errorText);
              console.error("[Audio Endpoint] Failed after:", apiDuration, "ms");
            }
          } else {
            console.error("[Audio Endpoint] ❌ ELEVENLABS_API_KEY not available");
          }
        } else {
          console.error("[Audio Endpoint] ❌ Invalid cache key format - expected voiceId|text, got:", decoded.substring(0, 100));
        }
      } catch (decodeError: any) {
        console.error("[Audio Endpoint] ❌ Failed to decode cache key");
        console.error("[Audio Endpoint] Error type:", decodeError.constructor.name);
        console.error("[Audio Endpoint] Error message:", decodeError.message);
        console.error("[Audio Endpoint] Error stack:", decodeError.stack);
      }
    }

    if (audioBuffer) {
      const duration = Date.now() - startTime;
      console.log("[Audio Endpoint] ✅ SUCCESS - Returning audio");
      console.log("[Audio Endpoint] Audio size:", audioBuffer.length, "bytes");
      console.log("[Audio Endpoint] Response time:", duration, "ms");
      console.log("[Audio Endpoint] Content-Type: audio/mpeg");
      console.log("=".repeat(80));
      
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

    // If not in cache and can't generate, return 404
    const duration = Date.now() - startTime;
    console.error("[Audio Endpoint] ❌ FAILED - Audio not found and couldn't regenerate");
    console.error("[Audio Endpoint] Response time:", duration, "ms");
    console.error("[Audio Endpoint] Returning 404");
    console.log("=".repeat(80));
    
    return new NextResponse("Audio not found", { 
      status: 404,
      headers: {
        "Content-Type": "text/plain",
      },
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error("[Audio Endpoint] ❌ EXCEPTION:", error);
    console.error("[Audio Endpoint] Error message:", error.message);
    console.error("[Audio Endpoint] Error stack:", error.stack);
    console.error("[Audio Endpoint] Response time:", duration, "ms");
    console.log("=".repeat(80));
    
    return new NextResponse("Internal server error", { 
      status: 500,
      headers: {
        "Content-Type": "text/plain",
      },
    });
  }
}

