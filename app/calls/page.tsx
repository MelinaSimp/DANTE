import { createServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

type TranscriptAnswer = {
  question_id?: string;
  prompt?: string;
  answer?: string;
  captured_at?: string;
};

type CallLog = {
  id: string;
  call_sid: string;
  from_number: string | null;
  to_number: string | null;
  answers: TranscriptAnswer[] | null;
  ai_response: string | null;
  analysis: string | null;
  created_at: string;
};

type StatusEvent = {
  call_sid: string;
  status: string | null;
  call_duration: string | null;
  created_at: string;
};

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default async function CallsPage() {
  const supabase = await createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.workspace_id) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12 text-[var(--ink)] bg-[var(--canvas)] min-h-screen">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition mb-6"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
          Dashboard
        </Link>
        <h1 className="heading-display text-4xl text-[var(--ink)] mb-6">Call Transcripts</h1>
        <div className="rounded-[6px] border border-[var(--flag)] bg-[var(--flag-soft)] p-6 text-sm text-[var(--ink)]">
          We couldn’t find your workspace. Please contact an administrator.
        </div>
      </div>
    );
  }

  const { data: logs } = await supabase
    .from("receptionist_call_logs")
    .select("id, call_sid, from_number, to_number, answers, ai_response, analysis, created_at")
    .eq("workspace_id", profile.workspace_id)
    .order("created_at", { ascending: false })
    .limit(100);

  const callLogs: CallLog[] = logs ?? [];
  const callSids = callLogs.map((log) => log.call_sid).filter(Boolean);

  let statusEventsMap = new Map<string, StatusEvent[]>();

  if (callSids.length) {
    const { data: events } = await supabase
      .from("receptionist_call_status_events")
      .select("call_sid, status, call_duration, created_at")
      .in("call_sid", callSids);

    (events ?? []).forEach((event) => {
      const arr = statusEventsMap.get(event.call_sid) ?? [];
      arr.push(event);
      statusEventsMap.set(event.call_sid, arr);
    });

    statusEventsMap.forEach((arr, sid) => {
      arr.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      statusEventsMap.set(sid, arr);
    });
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 text-[var(--ink)] bg-[var(--canvas)] min-h-screen">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition mb-6"
      >
        <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
        Dashboard
      </Link>
      <div className="mb-8">
        <h1 className="heading-display text-4xl text-[var(--ink)]">Call Transcripts</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--ink-muted)]">
          Review AI receptionist conversations. Each entry includes the questions asked, the caller&apos;s
          responses, and the AI follow-up. Data is grouped by the Twilio number that handled the call.
        </p>
      </div>

      {callLogs.length === 0 ? (
        <div className="card-flat p-10 text-center text-sm text-[var(--ink-muted)]">
          No receptionist calls recorded yet.
        </div>
      ) : (
        <div className="space-y-6">
          {callLogs.map((log) => {
            const answers = log.answers ?? [];
            const events = statusEventsMap.get(log.call_sid) ?? [];
            const duration =
              events
                .slice()
                .reverse()
                .find((event) => event.call_duration)?.call_duration ?? null;

            return (
              <div
                key={log.id}
                className="card-flat card-flat-hover p-6"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="label-section text-[var(--ink-subtle)]">Caller</p>
                    <h2 className="text-lg font-semibold text-[var(--ink)]">{log.from_number ?? "Unknown caller"}</h2>
                    <p className="mt-0.5">
                      <span className="mono text-xs text-[var(--ink-subtle)]">{log.call_sid}</span>
                    </p>
                  </div>
                  <div className="text-xs text-[var(--ink-muted)]">
                    <div>Received: {formatDate(log.created_at)}</div>
                    {duration && <div>Duration: {duration}s</div>}
                  </div>
                </div>

                <div className="mt-4 grid gap-4 text-sm text-[var(--ink-muted)] sm:grid-cols-2">
                  <div>
                    <span className="label-section text-[var(--ink-subtle)]">Twilio Number</span>
                    <div className="text-base font-medium text-[var(--ink)]">{log.to_number ?? "—"}</div>
                  </div>
                  <div>
                    <span className="label-section text-[var(--ink-subtle)]">Caller</span>
                    <div className="text-base font-medium text-[var(--ink)]">
                      {log.from_number ?? "Unknown caller"}
                    </div>
                  </div>
                </div>

                <div className="mt-6 space-y-4 rounded-[6px] border border-[var(--rule)] bg-[var(--canvas-subtle)] p-5">
                  <p className="text-sm font-semibold text-[var(--ink)]">Transcript</p>
                  {answers.length === 0 ? (
                    <p className="text-sm text-[var(--ink-muted)]">No answers captured for this call.</p>
                  ) : (
                    <div className="space-y-4">
                      {answers.map((entry, idx) => (
                        <div key={`${entry.question_id ?? idx}`} className="rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] p-4">
                          <div className="label-section text-[var(--ink-subtle)]">
                            Question {idx + 1}
                          </div>
                          <div className="mt-1 text-sm font-medium text-[var(--ink)]">{entry.prompt ?? "—"}</div>
                          <div className="mt-3 rounded-[4px] border border-[var(--rule)] bg-[var(--canvas-subtle)] p-3 text-sm text-[var(--ink-muted)]">
                            <span className="label-section text-[var(--ink-subtle)]">Caller</span>
                            <div>{entry.answer ?? "No response"}</div>
                          </div>
                          {entry.captured_at && (
                            <div className="mt-2 text-xs text-[var(--ink-subtle)]">
                              Captured: {formatDate(entry.captured_at)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="rounded-[6px] border border-[var(--rule)] bg-[var(--accent-soft)] p-4 text-sm text-[var(--ink)]">
                    <div className="label-section text-[var(--accent)]">AI Follow-up</div>
                    <p className="mt-2">
                      {log.ai_response?.trim() ||
                        "The AI receptionist did not provide a follow-up response for this call."}
                    </p>
                  </div>
                  <div className="rounded-[6px] border border-[var(--rule)] bg-[var(--canvas)] p-4 text-sm text-[var(--ink)]">
                    <div className="label-section text-[var(--ink-subtle)]">AI Analysis</div>
                    <p className="mt-2 whitespace-pre-wrap">
                      {log.analysis?.trim() ||
                        "An AI analysis was not generated for this call. If this persists, confirm that OPENAI_API_KEY is set and the database migration for the analysis column has been applied."}
                    </p>
                  </div>
                </div>

                {events.length > 0 && (
                  <div className="mt-6 rounded-[6px] border border-[var(--rule)] bg-[var(--canvas-subtle)] p-5 text-xs text-[var(--ink-muted)]">
                    <p className="mb-3 text-sm font-semibold text-[var(--ink)]">Call Status Timeline</p>
                    <ul className="space-y-2">
                      {events.map((event, idx) => (
                        <li key={`${event.call_sid}-${idx}`} className="flex items-start justify-between gap-4">
                          <span className="font-medium text-[var(--ink)]">
                            {event.status ?? "unknown status"}
                          </span>
                          <span>{formatDate(event.created_at)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
