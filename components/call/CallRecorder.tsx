"use client";

// Browser-side call recorder.
// - Captures mic + (optionally) tab audio via getDisplayMedia
// - Mixes both streams in an AudioContext into a single MediaStream
// - Encodes to Opus/WebM via MediaRecorder at 32 kbps mono so a 45-min call
//   fits under the 25 MB Whisper limit
// - On stop: uploads blob via signed URL, then triggers /api/calls/process
// - Shows live status and the final summary inline

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Mic, Square, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

type Contact = { id: string; name: string; email?: string | null };

type Phase =
  | "idle"
  | "recording"
  | "uploading"
  | "transcribing"
  | "done"
  | "error";

export default function CallRecorder({
  contact,
  onDone,
}: {
  contact: Contact;
  onDone?: (result: { noteId: string; summary: string }) => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [status, setStatus] = useState("Ready to record");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [captureTab, setCaptureTab] = useState(true);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const micStreamRef = useRef<MediaStream | null>(null);
  const tabStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mixedStreamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      // Cleanup on unmount to avoid orphan streams / AudioContexts.
      stopAllTracks();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopAllTracks() {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    tabStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    tabStreamRef.current = null;
    try {
      audioContextRef.current?.close();
    } catch {
      /* noop */
    }
    audioContextRef.current = null;
    mixedStreamRef.current = null;
  }

  async function start() {
    setError(null);
    setSummary(null);
    setStatus("Requesting microphone…");

    try {
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      micStreamRef.current = mic;

      let tab: MediaStream | null = null;
      if (captureTab) {
        setStatus(
          "Select the Zoom (or Meet/Teams) tab in the picker and tick 'Share tab audio'…"
        );
        try {
          // getDisplayMedia requires video:true on most browsers even if we
          // only want audio. We never use the video track.
          tab = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true,
          });
          if (tab.getAudioTracks().length === 0) {
            setStatus(
              "No tab audio captured — did you tick 'Share tab audio'? Continuing with mic only."
            );
            tab.getTracks().forEach((t) => t.stop());
            tab = null;
          } else {
            // Drop the video track immediately — we only care about audio.
            tab.getVideoTracks().forEach((t) => t.stop());
          }
        } catch (e) {
          // User cancelled the picker — fall through to mic-only.
          console.warn("Tab audio capture skipped:", e);
          tab = null;
        }
      }
      tabStreamRef.current = tab;

      // Mix mic + tab audio.
      const AC = (window.AudioContext ||
        (window as any).webkitAudioContext) as typeof AudioContext;
      const ctx = new AC();
      audioContextRef.current = ctx;
      const dest = ctx.createMediaStreamDestination();
      ctx.createMediaStreamSource(mic).connect(dest);
      if (tab && tab.getAudioTracks().length > 0) {
        ctx.createMediaStreamSource(tab).connect(dest);
      }
      mixedStreamRef.current = dest.stream;

      // Pick a supported Opus/WebM mime type.
      const mime =
        MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/webm")
            ? "audio/webm"
            : "";

      const rec = new MediaRecorder(dest.stream, {
        mimeType: mime || undefined,
        audioBitsPerSecond: 32000, // ~14 MB per hour
      });
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        void handleStop();
      };
      rec.onerror = (e) => {
        setError(`Recorder error: ${(e as any).error?.message || "unknown"}`);
        setPhase("error");
      };
      mediaRecorderRef.current = rec;
      rec.start(1000); // flush chunks every second so we don't lose much on crash

      startTimeRef.current = Date.now();
      setElapsed(0);
      timerRef.current = window.setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
      setPhase("recording");
      setStatus(
        tab && tab.getAudioTracks().length > 0
          ? "Recording mic + tab audio"
          : "Recording mic only (tab audio skipped)"
      );
    } catch (e: any) {
      setError(e?.message || "Could not start recording");
      setPhase("error");
      stopAllTracks();
    }
  }

  async function stop() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  }

  async function handleStop() {
    setPhase("uploading");
    setStatus("Finalizing recording…");
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);
    stopAllTracks();

    const blob = new Blob(chunksRef.current, { type: "audio/webm" });
    chunksRef.current = [];
    if (blob.size === 0) {
      setError("Recording is empty — mic may have been blocked.");
      setPhase("error");
      return;
    }
    const sizeMb = blob.size / 1024 / 1024;
    if (sizeMb > 24) {
      setError(
        `Recording is ${sizeMb.toFixed(1)} MB, over the 25 MB transcription limit. Try a shorter call.`
      );
      setPhase("error");
      return;
    }

    try {
      // Step 1: get signed upload URL.
      setStatus(`Uploading ${sizeMb.toFixed(1)} MB…`);
      const urlResp = await fetch("/api/calls/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ contactId: contact.id }),
      });
      if (!urlResp.ok) {
        const t = await urlResp.text();
        throw new Error(`upload-url failed: ${t.slice(0, 200)}`);
      }
      const { recordingId, path, token } = await urlResp.json();

      // Step 2: upload directly to Supabase Storage.
      const uploadResult = await supabase.storage
        .from("call-recordings")
        .uploadToSignedUrl(path, token, blob, {
          contentType: "audio/webm",
          upsert: true,
        });
      if (uploadResult.error) {
        throw new Error(`Upload failed: ${uploadResult.error.message}`);
      }

      // Step 3: trigger server-side transcription + summary.
      setPhase("transcribing");
      setStatus("Transcribing with Whisper + summarizing…");
      const procResp = await fetch("/api/calls/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ recordingId, durationSeconds: duration }),
      });
      if (!procResp.ok) {
        const t = await procResp.text();
        throw new Error(`process failed: ${t.slice(0, 300)}`);
      }
      const result = await procResp.json();
      setSummary(result.summary || "(no summary returned)");
      setStatus("Done — note saved to client");
      setPhase("done");
      onDone?.({ noteId: result.noteId, summary: result.summary });
    } catch (e: any) {
      setError(e?.message || "Processing failed");
      setPhase("error");
    }
  }

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="rounded-2xl border border-[#e5e7eb] bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[#151515]/60">
            Call recorder
          </p>
          <h3 className="text-lg font-semibold text-[#151515]">
            {contact.name}
          </h3>
        </div>
        <div className="text-3xl font-mono tabular-nums text-[#151515]">
          {mm}:{ss}
        </div>
      </div>

      {phase === "idle" && (
        <label className="mb-4 flex items-center gap-2 text-sm text-[#151515]/70">
          <input
            type="checkbox"
            checked={captureTab}
            onChange={(e) => setCaptureTab(e.target.checked)}
            className="h-4 w-4 rounded border-[#e5e7eb]"
          />
          Also capture tab audio (the other person's voice from Zoom/Meet/Teams).
          You'll pick the tab in a picker; tick "Share tab audio".
        </label>
      )}

      <div className="flex items-center gap-3">
        {phase === "idle" || phase === "error" ? (
          <button
            onClick={start}
            className="inline-flex items-center gap-2 rounded-full bg-red-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-red-700"
          >
            <Mic className="h-4 w-4" /> Start recording
          </button>
        ) : phase === "recording" ? (
          <button
            onClick={stop}
            className="inline-flex items-center gap-2 rounded-full bg-[#151515] px-5 py-2 text-sm font-medium text-white transition hover:bg-black"
          >
            <Square className="h-4 w-4" /> Stop & save
          </button>
        ) : phase === "uploading" || phase === "transcribing" ? (
          <div className="inline-flex items-center gap-2 rounded-full bg-[#f3f4f6] px-5 py-2 text-sm font-medium text-[#151515]">
            <Loader2 className="h-4 w-4 animate-spin" /> {status}
          </div>
        ) : phase === "done" ? (
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-5 py-2 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> Saved
          </div>
        ) : null}
      </div>

      {(phase === "recording" || phase === "idle") && (
        <p className="mt-3 text-sm text-[#151515]/60">{status}</p>
      )}

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>{error}</div>
        </div>
      )}

      {summary && (
        <div className="mt-5 rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#151515]/60">
            AI summary
          </p>
          <div className="whitespace-pre-wrap text-sm text-[#151515]">
            {summary}
          </div>
          <p className="mt-3 text-xs text-[#151515]/60">
            Saved to {contact.name}'s notes. Refresh the contact to see it in
            the notes list.
          </p>
        </div>
      )}
    </div>
  );
}
