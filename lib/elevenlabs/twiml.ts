import { xmlEscape, xmlEscapeAttr } from "@/lib/xml";

const DEBUG = process.env.DEBUG_VOICE === "true";

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
  if (DEBUG) console.log("[TTS] text length:", text?.length || 0, "voiceId:", agentVoiceId);
  
  if (!text || text.trim().length === 0) return "";

  // If agent has ElevenLabs voice configured, generate audio on-demand
  if (agentVoiceId) {
    const audioStartTime = Date.now();
    try {
      const audioUrl = await generateAudioOnDemand(text, agentVoiceId, baseUrl);
      if (DEBUG) console.log("[TTS] Generated in", Date.now() - audioStartTime, "ms");
      if (audioUrl) {
        return `<Play>${xmlEscapeAttr(audioUrl)}</Play>`;
      }
    } catch (error: any) {
      console.error("[TTS] Audio generation failed:", error.message);
    }
    // Fallback to Say if audio generation fails
    console.warn("[TTS] Falling back to Twilio Say");
  }

  // Default to Twilio Say tag
  return `<Say voice="alice">${xmlEscape(text)}</Say>`;
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
      const statusCode = response.status;
      const errorBody = await response.text();
      console.error("ElevenLabs API error:", statusCode, errorBody);

      // Retry once for transient errors (429 rate limit, 500/502/503 server errors)
      if ([429, 500, 502, 503].includes(statusCode)) {
        console.log("[generateAudioOnDemand] Retrying after transient error...");
        await new Promise((r) => setTimeout(r, 800));
        const retryResponse = await fetch(
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
              voice_settings: { stability: 0.15, similarity_boost: 0.4, style: 0.0, use_speaker_boost: false },
              output_format: "mp3_22050_32",
            }),
          }
        );
        if (retryResponse.ok) {
          console.log("[generateAudioOnDemand] Retry succeeded");
          const retryBuffer = Buffer.from(await retryResponse.arrayBuffer());
          // Fall through to the caching/URL logic below by reassigning
          const retryResult = await cacheAndReturnUrl(retryBuffer, voiceId, text, baseUrl);
          return retryResult;
        }
        console.error("[generateAudioOnDemand] Retry also failed:", retryResponse.status);
      }
      return null;
    }

    // Get audio buffer and cache it
    const audioBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(audioBuffer);
    return cacheAndReturnUrl(buffer, voiceId, text, baseUrl);
  } catch (error) {
    console.error("[generateAudioOnDemand] Error:", error);
    return null;
  }
}

/** Cache audio buffer and return a URL for Twilio to play */
async function cacheAndReturnUrl(
  buffer: Buffer,
  voiceId: string,
  text: string,
  baseUrl?: string
): Promise<string | null> {
  const keyData = `${voiceId}|${text.trim()}`;
  const cacheKey = Buffer.from(keyData)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  const { storeAudioInCache } = await import("@/lib/elevenlabs/cache");
  storeAudioInCache(cacheKey, buffer);

  let apiBaseUrl = baseUrl || "";
  if (!apiBaseUrl && process.env.VERCEL_URL) {
    const vercelUrl = process.env.VERCEL_URL;
    apiBaseUrl = vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`;
  }
  if (!apiBaseUrl) {
    apiBaseUrl = process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL || "";
  }
  const cleanBaseUrl = apiBaseUrl.replace(/\/+$/, "").trim();
  if (!cleanBaseUrl) {
    console.error("[cacheAndReturnUrl] No base URL available");
    return null;
  }

  return `${cleanBaseUrl}/api/elevenlabs/audio/${cacheKey}`;
}

