import { xmlEscape, xmlEscapeAttr } from "@/lib/xml";

/**
 * Generate TwiML Say or Play tag based on agent's voice configuration
 * If agent has ElevenLabs voice, generate audio on-demand and return it directly
 * Otherwise, use Say tag with Twilio default voice
 */
export async function generateSpeechTwiml(
  text: string,
  agentVoiceId: string | null | undefined,
  baseUrl?: string
): Promise<string> {
  console.log("[generateSpeechTwiml] Called with:");
  console.log("  - Text length:", text?.length || 0);
  console.log("  - Text preview:", text?.substring(0, 50));
  console.log("  - Agent voice ID:", agentVoiceId);
  console.log("  - Base URL:", baseUrl);
  
  if (!text || text.trim().length === 0) {
    console.log("[generateSpeechTwiml] Empty text, returning empty string");
    return "";
  }

  // If agent has ElevenLabs voice configured, generate audio on-demand
  if (agentVoiceId) {
    console.log("[generateSpeechTwiml] Agent has ElevenLabs voice, generating audio...");
    const audioStartTime = Date.now();
    try {
      const audioUrl = await generateAudioOnDemand(text, agentVoiceId, baseUrl);
      const audioDuration = Date.now() - audioStartTime;
      if (audioUrl) {
        console.log("[generateSpeechTwiml] ✅ Audio generated successfully");
        console.log("[generateSpeechTwiml] Audio generation time:", audioDuration, "ms");
        console.log("[generateSpeechTwiml] Audio URL:", audioUrl);
        // Use Play tag with the audio URL
        const playTag = `<Play>${xmlEscapeAttr(audioUrl)}</Play>`;
        console.log("[generateSpeechTwiml] Play tag:", playTag);
        return playTag;
      } else {
        console.warn("[generateSpeechTwiml] ⚠️ Audio URL is null/empty");
        console.warn("[generateSpeechTwiml] Audio generation time:", audioDuration, "ms");
      }
    } catch (error: any) {
      const audioDuration = Date.now() - audioStartTime;
      console.error("[generateSpeechTwiml] ❌ Exception generating audio:", error);
      console.error("[generateSpeechTwiml] Error message:", error.message);
      console.error("[generateSpeechTwiml] Error stack:", error.stack);
      console.error("[generateSpeechTwiml] Audio generation time:", audioDuration, "ms");
    }
    // Fallback to Say if audio generation fails
    console.warn("[generateSpeechTwiml] ⚠️ Falling back to Twilio Say");
  } else {
    console.log("[generateSpeechTwiml] No ElevenLabs voice, using Twilio Say");
  }

  // Default to Twilio Say tag
  const escapedText = xmlEscape(text);
  const sayTag = `<Say voice="alice">${escapedText}</Say>`;
  console.log("[generateSpeechTwiml] Returning Say tag");
  return sayTag;
}

/**
 * Generate audio on-demand and store it with a deterministic cache key
 * This ensures the audio is available when Twilio requests it
 */
async function generateAudioOnDemand(
  text: string,
  voiceId: string,
  baseUrl?: string
): Promise<string | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return null;
  }

  try {
    // Generate audio directly from ElevenLabs
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
          model_id: "eleven_turbo_v2_5", // Fastest model for lower latency
          voice_settings: {
            stability: 0.15, // Lower = faster generation (reduced from 0.2)
            similarity_boost: 0.4, // Lower = faster (reduced from 0.5)
            style: 0.0, // Neutral style for faster processing
            use_speaker_boost: false, // Disable for speed
          },
          output_format: "mp3_22050_32", // Lower quality = faster generation (optimized for speed)
        }),
      }
    );

    if (!response.ok) {
      console.error("ElevenLabs API error:", response.status, await response.text());
      return null;
    }

    // Get audio buffer
    const audioBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(audioBuffer);

    // Create deterministic cache key that can be decoded
    // Format: base64(voiceId|text) - use | as separator since it's URL-safe
    const textToEncode = text.trim();
    const keyData = `${voiceId}|${textToEncode}`;
    const cacheKey = Buffer.from(keyData)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");

    // Store in cache
    const { storeAudioInCache } = await import("@/lib/elevenlabs/cache");
    storeAudioInCache(cacheKey, buffer);

    // Construct audio URL - CRITICAL: Use the current deployment URL, not a hardcoded one
    // Priority: 1) baseUrl from request, 2) VERCEL_URL (current deployment), 3) fallback
    let apiBaseUrl = baseUrl || "";
    
    // If no baseUrl provided, use VERCEL_URL (this is the CURRENT deployment)
    if (!apiBaseUrl && process.env.VERCEL_URL) {
      const vercelUrl = process.env.VERCEL_URL;
      apiBaseUrl = vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`;
      console.log("[generateAudioOnDemand] Using VERCEL_URL for base URL:", apiBaseUrl);
    }
    
    // Fallback to environment variables (but these might be outdated)
    if (!apiBaseUrl) {
      apiBaseUrl = process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL || "";
      if (apiBaseUrl) {
        console.warn("[generateAudioOnDemand] ⚠️ Using fallback base URL (might be outdated):", apiBaseUrl);
      }
    }
    
    const cleanBaseUrl = apiBaseUrl.replace(/\/+$/, "").trim();
    
    if (!cleanBaseUrl) {
      console.error("[generateAudioOnDemand] ❌ No base URL available for audio URL");
      return null;
    }

    const audioUrl = `${cleanBaseUrl}/api/elevenlabs/audio/${cacheKey}`;
    console.log("[generateAudioOnDemand] ✅ Generated audio URL:", audioUrl);
    console.log("[generateAudioOnDemand] Cache key:", cacheKey);
    console.log("[generateAudioOnDemand] Audio buffer size:", buffer.length, "bytes");
    console.log("[generateAudioOnDemand] Base URL used:", cleanBaseUrl);
    return audioUrl;
  } catch (error) {
    console.error("[generateAudioOnDemand] Error:", error);
    return null;
  }
}

