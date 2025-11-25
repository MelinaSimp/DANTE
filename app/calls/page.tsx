import { createServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

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
      <div className="mx-auto max-w-5xl px-4 py-12 text-white">
        <h1 className="mb-6 text-3xl font-semibold">Call Transcripts</h1>
        <div className="rounded-2xl border border-yellow-500/40 bg-yellow-500/10 p-6 text-sm text-yellow-50">
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
    <div className="mx-auto max-w-6xl px-4 py-12 text-white">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold">Call Transcripts</h1>
        <p className="mt-2 max-w-3xl text-sm text-white/60">
          Review AI receptionist conversations. Each entry includes the questions asked, the caller&apos;s
          responses, and the AI follow-up. Data is grouped by the Twilio number that handled the call.
        </p>
      </div>

      {callLogs.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-10 text-center text-sm text-white/60">
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
                className="rounded-3xl border border-white/10 bg-black/35 p-6 shadow-[0_20px_60px_rgba(10,_10,_20,_0.45)] transition hover:border-[#3351ff]/40 hover:bg-black/30"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-white/40">Call SID</p>
                    <h2 className="text-lg font-semibold">{log.call_sid}</h2>
                  </div>
                  <div className="text-xs text-white/50">
                    <div>Received: {formatDate(log.created_at)}</div>
                    {duration && <div>Twilio reported duration: {duration}s</div>}
                  </div>
                </div>

                <div className="mt-4 grid gap-4 text-sm text-white/70 sm:grid-cols-2">
                  <div>
                    <span className="text-xs uppercase tracking-wide text-white/40">Twilio Number</span>
                    <div className="text-base font-medium text-white">{log.to_number ?? "—"}</div>
                  </div>
                  <div>
                    <span className="text-xs uppercase tracking-wide text-white/40">Caller</span>
                    <div className="text-base font-medium text-white">
                      {log.from_number ?? "Unknown caller"}
                    </div>
                  </div>
                </div>

                <div className="mt-6 space-y-4 rounded-2xl border border-white/10 bg-black/25 p-5">
                  <p className="text-sm font-semibold text-white/80">Transcript</p>
                  {answers.length === 0 ? (
                    <p className="text-sm text-white/50">No answers captured for this call.</p>
                  ) : (
                    <div className="space-y-4">
                      {answers.map((entry, idx) => (
                        <div key={`${entry.question_id ?? idx}`} className="rounded-xl border border-white/10 bg-white/5 p-4">
                          <div className="text-xs uppercase tracking-wide text-white/50">
                            Question {idx + 1}
                          </div>
                          <div className="mt-1 text-sm font-medium text-white">{entry.prompt ?? "—"}</div>
                          <div className="mt-3 rounded-lg border border-white/10 bg-black/40 p-3 text-sm text-white/70">
                            <span className="text-xs uppercase tracking-wide text-white/40">Caller</span>
                            <div>{entry.answer ?? "No response"}</div>
                          </div>
                          {entry.captured_at && (
                            <div className="mt-2 text-xs text-white/40">
                              Captured: {formatDate(entry.captured_at)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="rounded-xl border border-white/10 bg-[#3351ff]/10 p-4 text-sm text-white/80">
                    <div className="text-xs uppercase tracking-wide text-white/60">AI Follow-up</div>
                    <p className="mt-2">
                      {log.ai_response?.trim() ||
                        "The AI receptionist did not provide a follow-up response for this call."}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">
                    <div className="text-xs uppercase tracking-wide text-white/60">AI Analysis</div>
                    <p className="mt-2 whitespace-pre-wrap">
                      {log.analysis?.trim() ||
                        "An AI analysis was not generated for this call. If this persists, confirm that OPENAI_API_KEY is set and the database migration for the analysis column has been applied."}
                    </p>
                  </div>
                </div>

                {events.length > 0 && (
                  <div className="mt-6 rounded-2xl border border-white/10 bg-black/25 p-5 text-xs text-white/50">
                    <p className="mb-3 text-sm font-semibold text-white/70">Call Status Timeline</p>
                    <ul className="space-y-2">
                      {events.map((event, idx) => (
                        <li key={`${event.call_sid}-${idx}`} className="flex items-start justify-between gap-4">
                          <span className="font-medium text-white/70">
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
