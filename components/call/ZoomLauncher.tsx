"use client";

// Zoom launcher — alternative to browser recording.
//
// Click "Start Zoom meeting": we call /api/zoom/meeting to create an
// instant meeting on the workspace's connected Zoom account, then
// open the start_url in a new tab. The advisor hosts; Zoom auto-records
// to cloud; the recording.completed webhook pulls it back into Drift
// and ties the transcript to this contact.

import { useState } from "react";
import { Video, ExternalLink, Loader2, Info, Copy } from "lucide-react";
import { toast } from "@/components/ui/toast";

type Contact = { id: string; name: string };

type StartedMeeting = {
  recordingId: string;
  startUrl: string;
  joinUrl: string;
};

export default function ZoomLauncher({ contact }: { contact: Contact }) {
  const [starting, setStarting] = useState(false);
  const [meeting, setMeeting] = useState<StartedMeeting | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/zoom/meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: contact.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't start a Zoom meeting");
        return;
      }
      setMeeting({
        recordingId: data.recordingId,
        startUrl: data.startUrl,
        joinUrl: data.joinUrl,
      });
      window.open(data.startUrl, "_blank", "noopener");
    } catch (err: any) {
      setError(err?.message || "Network error");
    } finally {
      setStarting(false);
    }
  };

  const copyJoin = async () => {
    if (!meeting) return;
    await navigator.clipboard.writeText(meeting.joinUrl);
    toast.success("Join link copied — send it to your client");
  };

  if (meeting) {
    return (
      <div className="card-flat p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Video className="w-4 h-4 text-[var(--accent)]" strokeWidth={1.5} />
          <div className="label-section">Zoom meeting started</div>
        </div>
        <p className="text-sm text-[var(--ink-muted)]">
          Your host window opened in a new tab. Share the join link with{" "}
          {contact.name}. Zoom will cloud-record automatically; once the meeting
          ends, the transcript will appear in their timeline in a few minutes.
        </p>
        <div className="flex gap-2">
          <a
            href={meeting.startUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-3 py-2 text-sm bg-[var(--accent)] text-white rounded-[4px] hover:opacity-90"
          >
            <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.5} />
            Open host window
          </a>
          <button
            onClick={copyJoin}
            className="inline-flex items-center gap-1 px-3 py-2 text-sm border border-[var(--rule)] rounded-[4px] hover:bg-[var(--canvas-subtle)]"
          >
            <Copy className="w-3.5 h-3.5" strokeWidth={1.5} />
            Copy join link
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card-flat p-5 space-y-3">
      <div className="flex items-start gap-3">
        <Video className="w-5 h-5 text-[var(--ink-muted)] mt-0.5" strokeWidth={1.5} />
        <div className="flex-1">
          <div className="text-sm font-medium text-[var(--ink)]">
            Record via Zoom
          </div>
          <p className="text-sm text-[var(--ink-muted)] mt-1">
            Start a cloud-recorded Zoom meeting. When it ends, Drift transcribes
            and summarizes it into {contact.name}'s timeline automatically.
          </p>
        </div>
      </div>
      {error && (
        <div className="flex items-start gap-2 p-3 border border-red-300 bg-red-50 rounded-[4px] text-sm text-red-700">
          <Info className="w-4 h-4 mt-0.5" strokeWidth={1.5} />
          {error}
        </div>
      )}
      <button
        onClick={start}
        disabled={starting}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-[var(--accent)] text-white rounded-[4px] hover:opacity-90 disabled:opacity-50"
      >
        {starting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
            Starting Zoom…
          </>
        ) : (
          <>
            <Video className="w-4 h-4" strokeWidth={1.5} />
            Start Zoom meeting
          </>
        )}
      </button>
    </div>
  );
}
