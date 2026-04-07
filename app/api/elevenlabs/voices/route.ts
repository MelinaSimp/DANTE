import { NextResponse } from "next/server";
import { getAvailableVoices } from "@/lib/elevenlabs/tts";
import { requireUser } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireUser();
    if (auth.error) return auth.error;

    const apiKey = process.env.ELEVENLABS_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "ElevenLabs API key not configured", voices: [] },
        { status: 500 }
      );
    }

    const voices = await getAvailableVoices();

    if (voices.length === 0) {
      return NextResponse.json(
        { error: "No voices returned from ElevenLabs API", voices: [] },
        { status: 500 }
      );
    }

    return NextResponse.json({ voices });
  } catch (error: any) {
    console.error("Error fetching voices:", error);
    return NextResponse.json(
      { error: "Failed to fetch voices", voices: [] },
      { status: 500 }
    );
  }
}

