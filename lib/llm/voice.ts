// lib/llm/voice.ts
//
// Phase 7 W7.3 — voice scaffold.
//
// Streaming voice agent loop is too large for a single-session
// implementation; this file is the scaffold so the surface exists
// and routes can call into it as features land.
//
// Three primitives:
//   - transcribeAudio: wraps lib/llm/client.transcribe (Whisper)
//   - synthesizeSpeech: ElevenLabs TTS wrapper, streaming when
//     the caller asks for streaming
//   - transcribeAndAnswer: convenience for the simple
//     "user speaks, agent answers in voice" flow without
//     mid-utterance interruption (Phase 8 adds the realtime path)

import { transcribe } from "./client";

export interface TranscribeAudioInput {
  audio: Blob;
  language?: string;
}

export async function transcribeAudio(input: TranscribeAudioInput): Promise<{ text: string }> {
  return transcribe({
    audio: input.audio,
    model: "whisper-1",
    language: input.language,
  });
}

export interface SynthesizeSpeechInput {
  text: string;
  /** ElevenLabs voice id. Defaults to a generic neutral voice. */
  voiceId?: string;
  /** Stream as MP3 chunks rather than buffering whole. */
  streaming?: boolean;
}

const ELEVEN_BASE = "https://api.elevenlabs.io/v1";

/**
 * ElevenLabs TTS. Returns a Buffer (non-streaming) or a
 * ReadableStream<Uint8Array> (streaming). Caller handles framing.
 */
export async function synthesizeSpeech(
  input: SynthesizeSpeechInput,
): Promise<Buffer | ReadableStream<Uint8Array>> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY not configured");
  const voiceId = input.voiceId ?? process.env.ELEVENLABS_DEFAULT_VOICE ?? "21m00Tcm4TlvDq8ikWAM";

  const url = `${ELEVEN_BASE}/text-to-speech/${voiceId}${input.streaming ? "/stream" : ""}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": apiKey,
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: input.text,
      model_id: "eleven_turbo_v2_5",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ElevenLabs ${res.status}: ${body.slice(0, 200)}`);
  }
  if (input.streaming) {
    if (!res.body) throw new Error("ElevenLabs returned no streaming body");
    return res.body;
  }
  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}

/**
 * Convenience: transcribe → ask agent → synthesize. Non-streaming
 * for now; the realtime conversational mode (interruptions, VAD,
 * turn-taking) is Phase 8 work.
 */
export interface TranscribeAndAnswerInput {
  audio: Blob;
  workspaceId: string;
  /** Optional: voice for the response. */
  voiceId?: string;
}

export interface TranscribeAndAnswerResult {
  transcribedText: string;
  answerText: string;
  audio: Buffer;
}

export async function transcribeAndAnswer(
  input: TranscribeAndAnswerInput,
): Promise<TranscribeAndAnswerResult> {
  const { text: transcribedText } = await transcribeAudio({ audio: input.audio });

  // Stub: in production this calls the full agent loop. For now we
  // wrap it in a simple completion so the API surface is testable.
  // Wire to runAgent() when this lands as a UI feature.
  const placeholder = `(voice agent reply for: "${transcribedText.slice(0, 100)}")`;

  const audio = (await synthesizeSpeech({
    text: placeholder,
    voiceId: input.voiceId,
  })) as Buffer;

  return { transcribedText, answerText: placeholder, audio };
}
