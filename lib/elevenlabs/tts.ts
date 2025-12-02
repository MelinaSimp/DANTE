/**
 * ElevenLabs Text-to-Speech Helper
 * Generates audio from text using ElevenLabs API
 */

export interface GenerateAudioOptions {
  text: string;
  voiceId: string;
  baseUrl?: string;
}

/**
 * Generate audio URL from text using ElevenLabs
 * Returns a URL that can be used with Twilio's <Play> tag
 */
export async function generateAudioUrl(
  text: string,
  voiceId: string,
  baseUrl?: string
): Promise<string | null> {
  if (!text || text.trim().length === 0) {
    return null;
  }

  if (!voiceId) {
    return null;
  }

  try {
    // Use provided baseUrl or construct from environment
    let apiBaseUrl = baseUrl || process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL || "";
    
    // If VERCEL_URL is set and no baseUrl provided, use it
    if (!apiBaseUrl && process.env.VERCEL_URL) {
      const vercelUrl = process.env.VERCEL_URL;
      apiBaseUrl = vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`;
    }
    
    const cleanBaseUrl = apiBaseUrl.replace(/\/+$/, "").trim();
    
    if (!cleanBaseUrl) {
      console.error("No base URL available for audio generation");
      return null;
    }
    
    // Call our internal API to generate audio
    const response = await fetch(`${cleanBaseUrl}/api/elevenlabs/generate-audio`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: text.trim(),
        voiceId,
      }),
    });

    if (!response.ok) {
      console.error("Failed to generate audio:", await response.text());
      return null;
    }

    const data = await response.json();
    return data.audioUrl || null;
  } catch (error) {
    console.error("Error generating audio URL:", error);
    return null;
  }
}

/**
 * Get list of available ElevenLabs voices
 * This can be used in the UI for voice selection
 */
export async function getAvailableVoices(): Promise<Array<{ voice_id: string; name: string }>> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error("ELEVENLABS_API_KEY is not set in environment variables");
    return [];
  }

  try {
    const response = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: {
        "xi-api-key": apiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `ElevenLabs API error (${response.status}): ${errorText}`;
      
      // Parse error if it's JSON
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.detail?.message || errorJson.message || errorMessage;
      } catch {
        // Not JSON, use raw text
      }
      
      console.error("ElevenLabs API error:", response.status, errorText);
      
      // Throw error with details so the API route can return it
      throw new Error(errorMessage);
    }

    const data = await response.json();
    const voices = (data.voices || []).map((voice: any) => ({
      voice_id: voice.voice_id,
      name: voice.name,
    }));
    console.log(`Loaded ${voices.length} voices from ElevenLabs`);
    return voices;
  } catch (error: any) {
    console.error("Error fetching voices:", error);
    // Re-throw so the API route can return the error message
    throw error;
  }
}

