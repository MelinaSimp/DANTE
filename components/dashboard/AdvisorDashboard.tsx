"use client";

// Harvey-styled advisor dashboard — the default landing for authenticated
// users. Four sections mirror how an advisor actually starts their day:
//
//   • Today            — next calendar items with "prep" links
//   • Awaiting review  — compliance flags + drafts pending sign-off
//   • Recent           — latest call recordings with audit chips
//   • Flagged          — RMDs / age-band triggers / client watchlist
//
// The legacy analytics dashboard is preserved at /dashboard/legacy for
// anyone who still needs the AUM/sales numbers.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import {
  ArrowUpRight,
  ShieldCheck,
  FileCheck2,
  CalendarClock,
  AlertTriangle,
  LogOut,
  LayoutDashboard,
  FileText,
  Database,
  Loader2,
  CheckCircle2,
} from "lucide-react";

type Meeting = {
  id: string;
  contactName: string;
  scheduledAt: string;
  serviceType: string;
};

type CallNote = {
  id: string;
  contact_id: string;
  contact_name: string | null;
  created_at: string;
  body: string;
  has_audit: boolean;
};

type Flag = {
  id: string;
  kind: "rmd" | "age-band" | "suitability" | "stale";
  client: string;
  detail: string;
  dueAt?: string | null;
};

type DashboardData = {
  advisorName: string;
  workspaceName: string;
  today: Meeting[];
  awaitingReview: number;
  recentCalls: CallNote[];
  flagged: Flag[];
  stats: {
    clients: number;
    calls7d: number;
    documents: number;
    verifiedPct: number | null;
    aumTotal: number | null;
    aumAsOf: string | null;
    aumIsDemo: boolean;
    aumAccountCount: number;
  };
};

// Compact AUM formatting — $4.2M, $812K, $0 — for the stat cell.
function formatAumCompact(n: number | null): string {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000)
    return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTimeOnly(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRelativeDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.round((d.getTime() - now.getTime()) / 86400000);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff < 7 && diff > 0) return `in ${diff}d`;
  if (diff < 0) return `${-diff}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function AdvisorDashboard({ data }: { data: DashboardData }) {
  const router = useRouter();
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const firstName = useMemo(
    () => data.advisorName.split(" ")[0] || "there",
    [data.advisorName]
  );

  return (
    <div className="min-h-screen bg-white text-[#151515]">
      {/* Top bar — kept minimal. Logo left, sign-out right. */}
      <header className="sticky top-0 z-30 flex items-center justify-between px-6 md:px-10 py-4 bg-white border-b border-[var(--rule)]">
        <div className="flex items-center gap-3">
          <img
            src="/brand/logo-circle.png"
            alt="Drift"
            className="w-6 h-6 rounded-full object-cover"
          />
          <span className="text-sm font-medium tracking-tight">Drift</span>
          <span className="text-[var(--ink-subtle)]">·</span>
          <span className="text-xs mono text-[var(--ink-muted)]">
            {data.workspaceName}
          </span>
        </div>
        <nav className="flex items-center gap-1">
          <Link
            href="/client-details-overview"
            className="px-3 py-1.5 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
          >
            Clients
          </Link>
          <Link
            href="/calls"
            className="px-3 py-1.5 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
          >
            Calls
          </Link>
          <Link
            href="/dashboard/agents"
            className="px-3 py-1.5 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
          >
            Agents
          </Link>
          <Link
            href="/settings"
            className="px-3 py-1.5 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
          >
            Settings
          </Link>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              router.push("/auth");
            }}
            className="ml-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </button>
        </nav>
      </header>

      <div className="max-w-6xl mx-auto px-6 md:px-10 py-12 md:py-16">
        {/* Editorial header */}
        <div className="mb-12">
          <div className="label-section mb-3">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </div>
          <h1 className="heading-display text-5xl md:text-6xl mb-3">
            {greeting}, {firstName}.
          </h1>
          <p className="prose-body text-[var(--ink-muted)] max-w-2xl">
            {data.today.length > 0
              ? `You have ${data.today.length} meeting${
                  data.today.length === 1 ? "" : "s"
                } today. ${
                  data.awaitingReview > 0
                    ? `${data.awaitingReview} item${
                        data.awaitingReview === 1 ? "" : "s"
                      } need${data.awaitingReview === 1 ? "s" : ""} your review.`
                    : "Nothing awaiting your review."
                }`
              : data.awaitingReview > 0
              ? `No meetings today. ${data.awaitingReview} item${
                  data.awaitingReview === 1 ? "" : "s"
                } need${data.awaitingReview === 1 ? "s" : ""} your review.`
              : "No meetings today, nothing awaiting review. A quiet one."}
          </p>
        </div>

        {/* Stat strip — stripped down, no giant cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-[var(--rule)] mb-12 rounded-md overflow-hidden border border-[var(--rule)]">
          <StatCell
            label="AUM"
            value={formatAumCompact(data.stats.aumTotal)}
            hint={
              data.stats.aumTotal === null
                ? undefined
                : data.stats.aumIsDemo
                ? "demo data"
                : data.stats.aumAccountCount > 0
                ? `${data.stats.aumAccountCount} acct${
                    data.stats.aumAccountCount === 1 ? "" : "s"
                  }`
                : undefined
            }
          />
          <StatCell
            label="Clients"
            value={data.stats.clients.toString()}
            href="/client-details-overview"
          />
          <StatCell
            label="Calls · 7d"
            value={data.stats.calls7d.toString()}
            href="/calls"
          />
          <StatCell
            label="Documents"
            value={data.stats.documents.toString()}
            href="/client-details-overview"
          />
          <StatCell
            label="Verified"
            value={
              data.stats.verifiedPct !== null
                ? `${data.stats.verifiedPct}%`
                : "—"
            }
            hint="citation-grounded"
          />
        </div>

        {/* Demo-data prompt for empty custodian state. Appears only
            when no AUM data exists — gives a one-click "try it" path
            to the mock driver so the scaffold has an end-to-end real
            use in development. Hidden once any balance rolls in. */}
        {data.stats.aumTotal === null && (
          <DemoCustodianPrompt />
        )}

        {/* Two-column: Today / Awaiting */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-10 mb-16">
          <DashSection
            label="Today"
            icon={<CalendarClock className="w-3.5 h-3.5" />}
          >
            {data.today.length === 0 ? (
              <EmptyNote>No meetings scheduled.</EmptyNote>
            ) : (
              <ul className="divide-y divide-[var(--rule)] border-t border-b border-[var(--rule)]">
                {data.today.map((m) => (
                  <li key={m.id} className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="text-[15px] font-medium mb-0.5">
                          {m.contactName}
                        </div>
                        <div className="text-xs text-[var(--ink-muted)] mono">
                          {formatTimeOnly(m.scheduledAt)} · {m.serviceType}
                        </div>
                      </div>
                      <Link
                        href={`/client-details-overview?contact=${encodeURIComponent(
                          m.contactName
                        )}`}
                        className="inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
                      >
                        Prep
                        <ArrowUpRight className="w-3 h-3" />
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </DashSection>

          <DashSection
            label="Awaiting your review"
            icon={<ShieldCheck className="w-3.5 h-3.5" />}
          >
            {data.awaitingReview === 0 ? (
              <EmptyNote>Queue is clear.</EmptyNote>
            ) : (
              <div className="py-4 border-t border-b border-[var(--rule)]">
                <div className="flex items-baseline gap-3">
                  <div className="heading-display text-4xl">
                    {data.awaitingReview}
                  </div>
                  <div className="text-sm text-[var(--ink-muted)]">
                    item{data.awaitingReview === 1 ? "" : "s"} pending
                    compliance review
                  </div>
                </div>
                <Link
                  href="/compliance/queue"
                  className="mt-3 inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
                >
                  Open queue
                  <ArrowUpRight className="w-3 h-3" />
                </Link>
              </div>
            )}
          </DashSection>
        </section>

        {/* Recent calls */}
        <section className="mb-16">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <span className="label-section">Recent calls</span>
              <FileCheck2 className="w-3.5 h-3.5 text-[var(--ink-muted)]" />
            </div>
            <Link
              href="/calls"
              className="text-xs text-[var(--ink-muted)] hover:text-[var(--ink)]"
            >
              All calls →
            </Link>
          </div>
          {data.recentCalls.length === 0 ? (
            <EmptyNote>No call recordings yet.</EmptyNote>
          ) : (
            <ul className="divide-y divide-[var(--rule)] border-t border-b border-[var(--rule)]">
              {data.recentCalls.map((c) => (
                <li key={c.id} className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 mb-1">
                        <div className="text-[15px] font-medium truncate">
                          {c.contact_name || "Unknown"}
                        </div>
                        <div className="text-xs mono text-[var(--ink-subtle)]">
                          {formatRelativeDate(c.created_at)}
                        </div>
                      </div>
                      <div className="text-sm text-[var(--ink-muted)] line-clamp-1">
                        {c.body.replace(/^📞 Call with [^\n]*\n?/, "").slice(0, 180)}
                      </div>
                    </div>
                    {c.has_audit && (
                      <Link
                        href={`/client-details-overview?contact=${c.contact_id}&audit=${c.id}`}
                        className="chip-citation hover:bg-[var(--accent)] hover:text-white transition whitespace-nowrap"
                      >
                        <FileCheck2 className="w-3 h-3" />
                        View audit
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Flagged */}
        <section className="mb-16">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <span className="label-section">Flagged</span>
              <AlertTriangle className="w-3.5 h-3.5 text-[var(--flag)]" />
            </div>
            <span className="text-xs text-[var(--ink-subtle)]">
              Rule-based client watchlist
            </span>
          </div>
          {data.flagged.length === 0 ? (
            <EmptyNote>No clients need attention right now.</EmptyNote>
          ) : (
            <ul className="divide-y divide-[var(--rule)] border-t border-b border-[var(--rule)]">
              {data.flagged.map((f) => (
                <li key={f.id} className="py-4 flex items-start gap-4">
                  <span className="chip-flag mt-0.5 shrink-0">{f.kind}</span>
                  <div className="flex-1">
                    <div className="text-[15px] font-medium">{f.client}</div>
                    <div className="text-sm text-[var(--ink-muted)]">
                      {f.detail}
                    </div>
                    {f.dueAt && (
                      <div className="text-xs mono text-[var(--ink-subtle)] mt-0.5">
                        {formatDateTime(f.dueAt)}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Footer — deeper links that aren't already in the header nav or stat strip. */}
        <section className="border-t border-[var(--rule)] pt-8 grid grid-cols-2 md:grid-cols-2 gap-6">
          <QuickLink
            href="/reference"
            label="Reference"
            icon={<FileText className="w-4 h-4" />}
            hint="IRS / SEC / FINRA sources"
          />
          <QuickLink
            href="/dashboard/legacy"
            label="Analytics"
            icon={<LayoutDashboard className="w-4 h-4" />}
            hint="Revenue & funnel"
          />
        </section>
      </div>
    </div>
  );
}

/* ---------------- Presentational primitives ---------------- */

function StatCell({
  label,
  value,
  href,
  hint,
}: {
  label: string;
  value: string;
  href?: string;
  hint?: string;
}) {
  const body = (
    <div className="bg-white px-5 py-4 h-full hover:bg-[var(--canvas-subtle)] transition">
      <div className="label-section mb-2">{label}</div>
      <div className="flex items-baseline gap-2">
        <div className="heading-display text-3xl">{value}</div>
        {hint && (
          <div className="text-[10px] mono text-[var(--ink-subtle)] uppercase tracking-wider">
            {hint}
          </div>
        )}
      </div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function DashSection({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span className="label-section">{label}</span>
        <span className="text-[var(--ink-muted)]">{icon}</span>
      </div>
      {children}
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="py-6 border-t border-b border-[var(--rule)] text-sm text-[var(--ink-subtle)] italic">
      {children}
    </div>
  );
}

// Shown on the advisor dashboard when no custodian data exists yet.
// Clicking provisions a mock driver connection and runs an immediate
// sync — the "end-to-end real use" wiring for the M1.5 custodian
// scaffold. Labeled "Demo data" per DEPTH-PLAN failure-mode guard:
// the mock driver is fixtures, not a real custodian.
function DemoCustodianPrompt() {
  const [state, setState] = useState<
    "idle" | "seeding" | "done" | "error"
  >("idle");
  const [err, setErr] = useState<string | null>(null);

  async function seed() {
    setState("seeding");
    setErr(null);
    try {
      const r = await fetch("/api/custodians/seed-demo", {
        method: "POST",
        credentials: "include",
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(j?.error || "Seed failed");
        setState("error");
        return;
      }
      setState("done");
      // Give the user a moment to see "Connected," then reload so the
      // AUM stat picks up.
      setTimeout(() => window.location.reload(), 800);
    } catch (e: any) {
      setErr(e?.message || "Seed failed");
      setState("error");
    }
  }

  return (
    <div
      className="mb-12 flex items-start gap-3 px-4 py-3 border"
      style={{
        borderColor: "var(--rule)",
        background: "var(--canvas-subtle)",
        borderRadius: "var(--r-card)",
      }}
    >
      <div
        className="flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{
          width: 28,
          height: 28,
          borderRadius: "var(--r-chip)",
          background: "var(--accent-soft)",
          color: "var(--accent)",
        }}
      >
        <Database className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm" style={{ color: "var(--ink)" }}>
          No custodian data yet.
        </div>
        <div
          className="text-xs mt-0.5"
          style={{ color: "var(--ink-muted)" }}
        >
          Connect Schwab, Fidelity, or Altruist to populate AUM and
          positions. For now you can seed fixtures to see how it looks —
          everything pulled from the mock driver is labeled{" "}
          <span className="mono">demo data</span>.
        </div>
      </div>
      <button
        type="button"
        onClick={seed}
        disabled={state === "seeding" || state === "done"}
        className="flex-shrink-0 text-xs inline-flex items-center gap-1.5 px-3 py-1.5 transition"
        style={{
          border: "1px solid var(--rule)",
          color: state === "done" ? "var(--verified)" : "var(--ink)",
          background: "var(--canvas)",
          borderRadius: "var(--r-input)",
          opacity: state === "seeding" ? 0.6 : 1,
        }}
      >
        {state === "seeding" && (
          <>
            <Loader2 className="w-3 h-3 animate-spin" />
            Seeding…
          </>
        )}
        {state === "done" && (
          <>
            <CheckCircle2 className="w-3 h-3" />
            Connected
          </>
        )}
        {(state === "idle" || state === "error") && (
          <>
            <Database className="w-3 h-3" />
            Seed demo data
          </>
        )}
      </button>
      {state === "error" && err && (
        <div
          className="w-full text-xs"
          style={{ color: "var(--danger)" }}
        >
          {err}
        </div>
      )}
    </div>
  );
}

function QuickLink({
  href,
  label,
  icon,
  hint,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 p-3 -m-3 rounded-md hover:bg-[var(--canvas-subtle)] transition"
    >
      <span className="mt-0.5 text-[var(--ink-muted)] group-hover:text-[var(--accent)] transition">
        {icon}
      </span>
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-[var(--ink-muted)]">{hint}</div>
      </div>
    </Link>
  );
}
