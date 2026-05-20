"use client";

// DanteNoticed — the "what D/V is flagging right now" card that
// appears either inline on detail pages OR inside hover previews.
// Distinct from EntityHoverCard's neutral facts (email, phone,
// last interaction): this card is D/V *speaking*. Renders only when
// there's something active to say; nothing flagged → returns null.
//
// Visual treatment: soft gradient header to feel slightly elevated
// from regular card chrome, otherwise stays in Drift's tokens. Each
// flagged signal becomes a row with an explanation in the assistant's
// voice and a click-through link to where the user resolves it.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  Bell,
  CalendarClock,
  ClipboardCheck,
  AlertTriangle,
  FileWarning,
  Clock,
} from "lucide-react";
import { useAssistantBrand } from "./AssistantNameProvider";
import CreativeCard from "@/components/ui/creative-card";

type Kind = "contact" | "property";

interface ContactNoticed {
  id: string;
  name: string | null;
  stale_days: number | null;
  pending_drafts: Array<{
    id: string;
    subject: string | null;
    send_at: string | null;
    reason: string | null;
  }>;
  review_due:
    | { stage: string; next_review_date: string; days_until: number }
    | null;
}

interface PropertyNoticed {
  id: string;
  address: string;
  expiring_docs: Array<{
    id: string;
    title: string;
    doc_kind: string;
    expires_at: string;
    days_until: number;
  }>;
  stuck_deal:
    | { stage: string; days_in_stage: number; threshold_days: number }
    | null;
  pending_drafts: Array<{
    id: string;
    subject: string | null;
    send_at: string | null;
    reason: string | null;
  }>;
  expected_close_date: string | null;
}

type NoticedData = ContactNoticed | PropertyNoticed;

// Module-scope cache keyed by `${kind}:${id}` so the inline detail-
// page card and the hover-preview card share data without each one
// firing its own request. Cleared on full page reload.
const noticedCache = new Map<string, NoticedData>();
const inflight = new Map<string, Promise<NoticedData | null>>();

export async function loadNoticed(
  kind: Kind,
  id: string,
): Promise<NoticedData | null> {
  const key = `${kind}:${id}`;
  if (noticedCache.has(key)) return noticedCache.get(key)!;
  if (inflight.has(key)) return inflight.get(key)!;
  const p = (async () => {
    try {
      const r = await fetch(`/api/noticed/${kind}/${id}`, {
        credentials: "include",
      });
      if (!r.ok) return null;
      const data = (await r.json()) as NoticedData;
      noticedCache.set(key, data);
      return data;
    } catch {
      return null;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

interface Props {
  kind: Kind;
  id: string;
  /** When true, render with extra prominent chrome (gradient header,
   *  larger heading) suited to a top-of-page placement. Default
   *  false renders compactly so the card fits inside hover popovers. */
  prominent?: boolean;
  /** Pre-loaded data — when provided, the component skips its own
   *  fetch. Used by EntityHoverCard which loads in parallel. */
  data?: NoticedData | null;
  /** Called when the data resolves so parent surfaces (hover card)
   *  can hide their wrapper if nothing's flagged. */
  onResolved?: (hasSignals: boolean) => void;
}

function hasAnySignal(data: NoticedData | null): boolean {
  if (!data) return false;
  if ("stale_days" in data) {
    return (
      data.stale_days != null ||
      data.pending_drafts.length > 0 ||
      data.review_due != null
    );
  }
  return (
    data.expiring_docs.length > 0 ||
    data.stuck_deal != null ||
    data.pending_drafts.length > 0
  );
}

export default function DanteNoticed({
  kind,
  id,
  prominent = false,
  data: dataProp,
  onResolved,
}: Props) {
  const { name: assistantName } = useAssistantBrand();
  const [data, setData] = useState<NoticedData | null>(dataProp ?? null);
  const [loading, setLoading] = useState(dataProp === undefined);

  useEffect(() => {
    if (dataProp !== undefined) {
      setData(dataProp);
      setLoading(false);
      onResolved?.(hasAnySignal(dataProp));
      return;
    }
    let cancelled = false;
    loadNoticed(kind, id).then((d) => {
      if (cancelled) return;
      setData(d);
      setLoading(false);
      onResolved?.(hasAnySignal(d));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, id, dataProp]);

  if (loading) return null; // skeleton is noisier than absence
  if (!hasAnySignal(data)) return null;

  // Build the rows in priority order (most actionable first).
  const rows: Array<React.ReactNode> = [];

  if (kind === "contact" && data && "stale_days" in data) {
    if (data.stale_days != null) {
      rows.push(
        <NoticedRow
          key="stale"
          icon={<Clock className="w-3.5 h-3.5" strokeWidth={1.5} />}
          tone="warn"
          title={`No contact in ${data.stale_days} day${data.stale_days === 1 ? "" : "s"}`}
          body={`I haven't seen a note, email, or call about ${data.name || "this contact"} in over ${data.stale_days} days. Want me to draft a check-in?`}
        />,
      );
    }
    if (data.review_due) {
      const overdue = data.review_due.days_until < 0;
      rows.push(
        <NoticedRow
          key="review"
          icon={<ClipboardCheck className="w-3.5 h-3.5" strokeWidth={1.5} />}
          tone={overdue ? "danger" : "warn"}
          title={
            overdue
              ? `Review overdue by ${Math.abs(data.review_due.days_until)} days`
              : `Review due in ${data.review_due.days_until} days`
          }
          body={`Cycle stage is ${data.review_due.stage.replace(/_/g, " ")}. Next review on ${data.review_due.next_review_date}.`}
          href="/work?filter=review_due"
          linkLabel="Open in work queue"
        />,
      );
    }
    for (const d of data.pending_drafts) {
      rows.push(
        <NoticedRow
          key={`draft-${d.id}`}
          icon={<Bell className="w-3.5 h-3.5" strokeWidth={1.5} />}
          tone="default"
          title={`Draft awaiting your approval: ${d.subject || "(no subject)"}`}
          body={d.reason || "I drafted this for you. It won't send until you approve."}
          href="/reminders"
          linkLabel="Review draft"
        />,
      );
    }
  }

  if (kind === "property" && data && "expiring_docs" in data) {
    for (const d of data.expiring_docs) {
      const tone =
        d.days_until <= 7 ? "danger" : d.days_until <= 30 ? "warn" : "default";
      rows.push(
        <NoticedRow
          key={`doc-${d.id}`}
          icon={<FileWarning className="w-3.5 h-3.5" strokeWidth={1.5} />}
          tone={tone}
          title={`${d.doc_kind} expires in ${d.days_until} day${d.days_until === 1 ? "" : "s"}`}
          body={`"${d.title}" — renewal window is open. Want me to draft a notice?`}
        />,
      );
    }
    if (data.stuck_deal) {
      rows.push(
        <NoticedRow
          key="stuck"
          icon={<AlertTriangle className="w-3.5 h-3.5" strokeWidth={1.5} />}
          tone="warn"
          title={`Deal stuck in ${data.stuck_deal.stage}`}
          body={`In '${data.stuck_deal.stage}' for ${data.stuck_deal.days_in_stage} days — typical is ${data.stuck_deal.threshold_days}. Cooling off without movement.`}
        />,
      );
    }
    if (data.expected_close_date) {
      const days = Math.floor(
        (new Date(data.expected_close_date).getTime() - Date.now()) /
          86400_000,
      );
      if (days >= 0 && days <= 14) {
        rows.push(
          <NoticedRow
            key="close-soon"
            icon={<CalendarClock className="w-3.5 h-3.5" strokeWidth={1.5} />}
            tone="default"
            title={`Expected close in ${days} day${days === 1 ? "" : "s"}`}
            body={`Target close ${data.expected_close_date}. Anything we still need from the buyer?`}
          />,
        );
      }
    }
    for (const d of data.pending_drafts) {
      rows.push(
        <NoticedRow
          key={`draft-${d.id}`}
          icon={<Bell className="w-3.5 h-3.5" strokeWidth={1.5} />}
          tone="default"
          title={`Draft awaiting your approval: ${d.subject || "(no subject)"}`}
          body={d.reason || "I drafted this for you. It won't send until you approve."}
          href="/reminders"
          linkLabel="Review draft"
        />,
      );
    }
  }

  if (rows.length === 0) return null;

  // Prominent mode (detail-page placement) wraps the body in the
  // Creative Card chrome — rounded-2xl outer, top-left glow,
  // gradient padding ring. Compact mode (used inside the hover
  // preview) renders a flat bordered card so it doesn't double up
  // chrome that the hover wrapper already provides.
  const body = (
    <>
      <div className="px-4 py-3 border-b border-[var(--glass-border)] dark:border-[var(--glass-border)] flex items-center gap-2 bg-[var(--canvas)]/50 bg-[var(--canvas)]/30">
        <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
        <div className="flex-1 min-w-0">
          <div className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)]">
            {assistantName} noticed
          </div>
          {prominent && (
            <div className="text-sm text-[var(--ink-muted)] mt-0.5">
              {rows.length} thing{rows.length === 1 ? "" : "s"} worth your attention
            </div>
          )}
        </div>
      </div>
      <ul className="divide-y divide-[var(--glass-border)]">
        {rows.map((row, i) => (
          <li key={i}>{row}</li>
        ))}
      </ul>
    </>
  );

  if (prominent) {
    return (
      <CreativeCard className="max-w-none">
        {body}
      </CreativeCard>
    );
  }

  return (
    <div className="rounded-[6px] border border-[var(--rule)] overflow-hidden bg-[var(--canvas)]">
      {body}
    </div>
  );
}

function NoticedRow({
  icon,
  tone,
  title,
  body,
  href,
  linkLabel,
}: {
  icon: React.ReactNode;
  tone: "default" | "warn" | "danger";
  title: string;
  body: string;
  href?: string;
  linkLabel?: string;
}) {
  const accent =
    tone === "danger"
      ? "var(--danger)"
      : tone === "warn"
      ? "var(--accent)"
      : "var(--ink-muted)";
  return (
    <div className="px-4 py-3 flex items-start gap-3">
      <div className="shrink-0 mt-0.5" style={{ color: accent }}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-[var(--ink)]">{title}</div>
        <div className="text-xs text-[var(--ink-muted)] mt-0.5 leading-relaxed">
          {body}
        </div>
        {href && linkLabel && (
          <Link
            href={href}
            className="inline-block mt-1.5 text-[11px] text-[var(--accent)] hover:underline"
          >
            {linkLabel} →
          </Link>
        )}
      </div>
    </div>
  );
}
