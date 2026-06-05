"use client";

// app/dante/CallSummaryBlock.tsx
//
// Renders a voice call summary inline in Dante chat. The agent or
// workflow runner emits a ```call_summary fenced block with JSON
// containing call metadata, extracted action items, and key topics.
//
// Schema:
// {
//   "caller": "John Smith",
//   "direction": "inbound" | "outbound",
//   "duration_seconds": 342,
//   "date": "2026-06-05T14:30:00Z",
//   "phone": "+1 (216) 555-0123",
//   "sentiment": "positive" | "neutral" | "negative",
//   "summary": "Discussed lease renewal terms...",
//   "topics": ["lease renewal", "tenant improvements", "rent escalation"],
//   "action_items": [
//     { "item": "Send updated lease draft", "assignee": "Agent", "due": "2026-06-07" },
//     { "item": "Review TI budget", "assignee": "John", "due": "2026-06-10" }
//   ],
//   "property": "Maple Ridge Plaza"
// }

interface ActionItem {
  item: string;
  assignee?: string;
  due?: string;
}

export interface CallSummaryData {
  caller?: string;
  direction?: "inbound" | "outbound";
  duration_seconds?: number;
  date?: string;
  phone?: string;
  sentiment?: "positive" | "neutral" | "negative";
  summary?: string;
  topics?: string[];
  action_items?: ActionItem[];
  property?: string;
}

export function parseCallSummaryBlock(raw: string): CallSummaryData | null {
  try {
    const data = JSON.parse(raw);
    // Need at least a summary
    if (!data.summary && !data.topics && !data.action_items) return null;
    return data as CallSummaryData;
  } catch {
    return null;
  }
}

function formatDuration(seconds: number | undefined): string {
  if (!seconds) return "--";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatDate(iso: string | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

const SENTIMENT_STYLE: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  positive: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-600 dark:text-emerald-400",
    label: "Positive",
  },
  neutral: {
    bg: "bg-zinc-500/10",
    text: "text-zinc-600 dark:text-zinc-400",
    label: "Neutral",
  },
  negative: {
    bg: "bg-red-500/10",
    text: "text-red-600 dark:text-red-400",
    label: "Negative",
  },
};

export default function CallSummaryBlock({
  data,
}: {
  data: CallSummaryData;
}) {
  const sentiment = SENTIMENT_STYLE[data.sentiment || "neutral"] || SENTIMENT_STYLE.neutral;

  return (
    <div className="space-y-3 rounded-xl border border-[var(--rule)] bg-[var(--canvas)] p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <svg
              className="w-4 h-4 text-[var(--ink-muted)]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"
              />
            </svg>
            <span className="text-xs font-semibold text-[var(--ink)] tracking-wide uppercase">
              Call Summary
            </span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-[var(--ink-muted)]">
            {data.caller && <span>{data.caller}</span>}
            {data.caller && data.direction && <span>--</span>}
            {data.direction && (
              <span className="capitalize">{data.direction}</span>
            )}
            {data.phone && <span>{data.phone}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {data.sentiment && (
            <span
              className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${sentiment.bg} ${sentiment.text}`}
            >
              {sentiment.label}
            </span>
          )}
        </div>
      </div>

      {/* Meta strip */}
      <div className="flex flex-wrap gap-4 text-[10px] text-[var(--ink-muted)]">
        {data.date && <span>{formatDate(data.date)}</span>}
        {data.duration_seconds && (
          <span>{formatDuration(data.duration_seconds)}</span>
        )}
        {data.property && <span>{data.property}</span>}
      </div>

      {/* Summary */}
      {data.summary && (
        <div className="text-xs text-[var(--ink)] leading-relaxed">
          {data.summary}
        </div>
      )}

      {/* Topics */}
      {data.topics && data.topics.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {data.topics.map((topic, i) => (
            <span
              key={i}
              className="px-2 py-0.5 rounded-full text-[10px] bg-[var(--canvas-subtle)] text-[var(--ink-muted)] border border-[var(--rule)]"
            >
              {topic}
            </span>
          ))}
        </div>
      )}

      {/* Action Items */}
      {data.action_items && data.action_items.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] text-[var(--ink-muted)] uppercase tracking-wider font-medium">
            Action Items
          </div>
          <div className="space-y-1">
            {data.action_items.map((ai, i) => (
              <div
                key={i}
                className="flex items-start gap-2 text-xs px-3 py-1.5 rounded-md bg-[var(--canvas-subtle)]"
              >
                <svg
                  className="w-3.5 h-3.5 text-[var(--ink-muted)] mt-0.5 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <div className="flex-1 min-w-0">
                  <span className="text-[var(--ink)]">{ai.item}</span>
                  {(ai.assignee || ai.due) && (
                    <span className="text-[var(--ink-muted)] ml-2">
                      {ai.assignee && <span>{ai.assignee}</span>}
                      {ai.assignee && ai.due && <span> -- </span>}
                      {ai.due && <span>due {ai.due}</span>}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
