"use client";

// Harvey-styled advisor dashboard — the default landing for authenticated
// users. Four sections mirror how an advisor actually starts their day:
//
//   • Today            — next calendar items with "prep" links
//   • Awaiting review  — compliance flags + drafts pending sign-off
//   • Recent           — latest call recordings with audit chips
//   • Needs attention  — relationship signals (clients going quiet, etc.)
//
// The earlier "Flagged" section advertised RMD / age-band / suitability
// kinds that didn't exist — only the "stale" signal was real. Rather
// than ship three empty compliance promises we can't honour, the
// section now reflects what it actually does: surface relationships at
// risk. Real compliance flags will come back under their own section
// once custodian data is wired.
//
// The custodian/AUM integration was removed: a real Schwab/Fidelity/
// Altruist integration is weeks of OAuth + approval work per provider,
// and a mock-only "Seed demo data" prompt was more confusing than
// useful. If that layer comes back it should land as a separate
// concern with a real driver, not a stub.

import { useMemo, useState } from "react";
import Link from "next/link";
import { pickGreeting, pickSubtitle } from "@/lib/dashboard/greetings";
import { getIndustryConfig } from "@/lib/industry/config";
import AppShell from "@/components/shell/AppShell";
import EntityAsk from "@/components/dante/EntityAsk";
import AnalysesFeed from "@/components/dashboard/AnalysesFeed";
import { usePageContext } from "@/components/dante/PageContext";
import {
  ArrowUpRight,
  FileCheck2,
  X,
  Bell,
  FileText,
  Eye,
  Activity,
  Zap,
  MailOpen,
  MessageSquare,
  Send,
  Building2,
  Play,
  Clock,
  Mail,
  FolderOpen,
  MessageCircle,
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

// The dashboard only surfaces one flag kind today — "stale", meaning a
// client we haven't touched in 60 days. RMD / age-band / suitability
// would require custodian data (DOB, account_type, balance) that Drift
// doesn't have yet. Added back when that data lands.
type Flag = {
  id: string;
  kind: "stale";
  client: string;
  detail: string;
  dueAt?: string | null;
};

type NoticedDraft = {
  id: string;
  subject: string | null;
  reason: string | null;
  send_at: string | null;
  contact_name: string | null;
  property_address: string | null;
  doc_kind: string | null;
};

type NoticedExpiring = {
  id: string;
  property_id: string;
  title: string;
  doc_kind: string;
  expires_at: string;
  property_address: string | null;
};

// Generic notices written by the daily cron into dante_noticed.
// Different shape from the two streams above because target_kind is
// polymorphic — could be a contact, a vault item, a property doc.
type NoticedCitation = {
  source_kind?: string;
  source_id?: string;
  source_url?: string;
  source_title?: string;
  quote?: string;
};

type NoticedItem = {
  id: string;
  kind: string;
  severity: "info" | "attention" | "urgent";
  title: string;
  body: string;
  target_kind: string | null;
  target_id: string | null;
  created_at: string;
  citations?: NoticedCitation[];
};

type WorkflowResult = {
  id: string;
  workflow_id: string;
  workflow_name: string;
  status: string;
  error: string | null;
  summary: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
};

type UsageInsight = {
  id: string;
  kind: "usage_pattern" | "workflow_tip" | "prompt_hint";
  title: string;
  body: string;
};

type ActivityItem = {
  id: string;
  kind: "workflow" | "email_in" | "email_out" | "sms_in" | "sms_out";
  headline: string;
  detail: string | null;
  status?: string | null;
  timestamp: string;
};

type DashboardData = {
  advisorName: string;
  workspaceName: string;
  industry?: string;
  isSuperadmin?: boolean;
  features: string[];
  today: Meeting[];
  awaitingReview: number;
  recentCalls: CallNote[];
  flagged: Flag[];
  recentActivity?: ActivityItem[];
  workflowResults?: WorkflowResult[];
  stats: {
    clients: number;
    properties: number;
    calls7d: number;
    documents: number;
    activeWorkflows: number;
    totalWorkflows: number;
    verifiedPct: number | null;
  };
  enabledWorkflows?: { id: string; name: string }[];
  noticedToday?: {
    pendingDraftsCount: number;
    topDrafts: NoticedDraft[];
    expiringDocsCount: number;
    topExpiring: NoticedExpiring[];
    items?: NoticedItem[];
  };
  usageInsights?: UsageInsight[];
  recentChats?: { id: string; title: string; updatedAt: string }[];
  digest?: {
    emailsToday: number;
    emailsUrgent: number;
    vaultUploadsWeek: number;
  };
  upcomingDeadlines?: {
    id: string;
    kind: "expiring_doc" | "draft_send" | "scheduled_workflow";
    label: string;
    detail: string | null;
    date: string;
    href: string | null;
  }[];
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
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
  const firstName = useMemo(
    () => data.advisorName.split(" ")[0] || "there",
    [data.advisorName]
  );

  usePageContext({
    title: "Dashboard",
    subtitle: `${data.stats.clients} client${data.stats.clients === 1 ? "" : "s"} · ${data.stats.calls7d} call${data.stats.calls7d === 1 ? "" : "s"} this week`,
  });

  // Greeting + subtitle rotate from pools in lib/dashboard/greetings
  // seeded on (firstName, today's date). Same copy all day, fresh
  // tomorrow. useMemo so the hash doesn't recompute on every render.
  const rawGreeting = useMemo(() => pickGreeting(firstName), [firstName]);
  // Some greetings are questions ("Long day?", "Not done yet?"). Move
  // that trailing punctuation to the end of the whole phrase so we say
  // "Long day, Adharsh?" instead of "Long day? Adharsh."
  const trailingMatch = rawGreeting.match(/[?!]+$/);
  const greeting = trailingMatch ? rawGreeting.slice(0, -trailingMatch[0].length) : rawGreeting;
  const greetingTerminator = trailingMatch ? trailingMatch[0] : ".";
  const hasCompliance = data.features.includes("compliance_scanner");
  const meetings = data.today.length;
  const review = hasCompliance ? data.awaitingReview : 0;
  const subtitle = useMemo(
    () => pickSubtitle(firstName, meetings, review),
    [firstName, meetings, review],
  );

  return (
    <AppShell
      workspaceName={data.workspaceName}
      industry={data.industry}
      features={data.features}
      isSuperadmin={data.isSuperadmin}
    >
      <div className="text-[var(--ink)]">
        {/* Top nav has been replaced by the persistent left sidebar
            in AppShell. Sign-out, settings, and module nav now live
            in the sidebar; this page just renders the dashboard
            content. */}

      <div className="max-w-6xl mx-auto px-6 md:px-8 py-8 md:py-10">
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
            {greeting}, {firstName}{greetingTerminator}
          </h1>
          <p className="prose-body text-[var(--ink-muted)] max-w-2xl">
            {subtitle}
          </p>
        </div>

        {/* WhatChanged removed — its content (regulatory analysis
            findings) now folds into the "What [assistant] noticed
            today" bento panel as regulatory_relevant items. One
            consolidated surface for everything Dante saw,
            instead of one hero box + one bento panel doing the same
            job. The dashboard endpoint pulls latest regulatory briefs
            and merges them into noticedItems with click-through to
            the source regulator URL. */}

        {/* Stat strip — compact workspace-level numbers. Keeps the
            dashboard from feeling barren when activity streams are
            empty. Each cell links to its dedicated page. */}
        <div className="grid grid-cols-4 gap-3 mb-3">
          <Link href="/contacts" className="group">
            <div className="glass-card glass-card-hover px-4 py-3 transition">
              <div className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] mb-1">Contacts</div>
              <div className="heading-display text-2xl">{data.stats.clients}</div>
            </div>
          </Link>
          <Link href="/workflows" className="group">
            <div className="glass-card glass-card-hover px-4 py-3 transition">
              <div className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] mb-1">Workflows</div>
              <div className="flex items-baseline gap-1.5">
                <span className="heading-display text-2xl">{data.stats.activeWorkflows}</span>
                {data.stats.totalWorkflows > data.stats.activeWorkflows && (
                  <span className="text-xs text-[var(--ink-subtle)]">/ {data.stats.totalWorkflows}</span>
                )}
              </div>
            </div>
          </Link>
          <Link href="/vault" className="group">
            <div className="glass-card glass-card-hover px-4 py-3 transition">
              <div className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] mb-1">Documents</div>
              <div className="heading-display text-2xl">{data.stats.documents}</div>
            </div>
          </Link>
          <div className="glass-card px-4 py-3">
            <div className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] mb-1">Calls this week</div>
            <div className="heading-display text-2xl">{data.stats.calls7d}</div>
          </div>
        </div>

        {/* Recent analyses + portfolio signals — real, data-driven feed. */}
        <AnalysesFeed />

        {/* Digest bar -- compact email + vault summary. */}
        {data.digest && (data.digest.emailsToday > 0 || data.digest.vaultUploadsWeek > 0) && (
          <div className="glass-card px-4 py-3 flex items-center gap-5 text-xs text-[var(--ink-muted)] mb-3">
            {data.digest.emailsToday > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" strokeWidth={1.5} />
                {data.digest.emailsToday} email{data.digest.emailsToday === 1 ? "" : "s"} today
                {data.digest.emailsUrgent > 0 && (
                  <span className="text-[var(--flag)] font-medium">
                    ({data.digest.emailsUrgent} urgent)
                  </span>
                )}
              </span>
            )}
            {data.digest.vaultUploadsWeek > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <FolderOpen className="w-3.5 h-3.5" strokeWidth={1.5} />
                {data.digest.vaultUploadsWeek} document{data.digest.vaultUploadsWeek === 1 ? "" : "s"} uploaded this week
              </span>
            )}
          </div>
        )}

        {/* Upcoming deadlines — merged timeline of the nearest
            expirations, draft send dates, and scheduled workflows.
            Gives a cross-cutting view of what's coming up. */}
        {data.upcomingDeadlines && data.upcomingDeadlines.length > 0 && (
          <div className="mb-3">
            <div className="flex items-center gap-1.5 mb-3">
              <Clock className="w-3.5 h-3.5 text-[var(--ink-muted)]" strokeWidth={1.5} />
              <span className="label-section">Upcoming deadlines</span>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {data.upcomingDeadlines.map((d) => {
                const inner = (
                  <div className="glass-card glass-card-hover px-4 py-3 min-w-[180px] transition">
                    <div className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] mb-1.5">
                      {d.kind === "expiring_doc" ? "Expires" : d.kind === "draft_send" ? "Sends" : "Runs"}{" "}
                      {formatRelativeDate(d.date)}
                    </div>
                    <div className="text-sm font-medium text-[var(--ink)] truncate">{d.label}</div>
                    {d.detail && (
                      <div className="text-[11px] text-[var(--ink-muted)] truncate mt-0.5">{d.detail}</div>
                    )}
                  </div>
                );
                return d.href ? (
                  <Link key={d.id} href={d.href} className="shrink-0">{inner}</Link>
                ) : (
                  <div key={d.id} className="shrink-0">{inner}</div>
                );
              })}
            </div>
          </div>
        )}

        {/* Two-column dashboard layout. */}
        {(() => {
          const n = data.noticedToday;
          const assistantName = getIndustryConfig(data.industry).assistantName;
          return (
            <div className="grid lg:grid-cols-2 gap-3 mb-12">
              {/* Left column: What Dante Noticed Today */}
              <section className="glass-card p-5 flex flex-col min-h-[320px]">
                <div className="flex items-center gap-2 mb-4">
                  <Eye className="w-3.5 h-3.5 text-[var(--ink-muted)]" strokeWidth={1.5} />
                  <span className="label-section">What {assistantName} noticed today</span>
                </div>
                <div className="space-y-4 flex-1">
                  {/* Usage insights -- patterns, warnings, suggestions */}
                  {data.usageInsights && data.usageInsights.length > 0 && (
                    <div className="space-y-2">
                      {data.usageInsights.map((insight) => (
                        <div
                          key={insight.id}
                          className={`px-3 py-2.5 rounded-[4px] bg-[var(--canvas-subtle)] border-l-2 ${
                            insight.kind === "prompt_hint"
                              ? "border-[var(--flag)]"
                              : insight.kind === "workflow_tip"
                                ? "border-[var(--accent)]"
                                : "border-[var(--rule-strong)]"
                          }`}
                        >
                          <div className="text-sm font-medium text-[var(--ink)]">{insight.title}</div>
                          <div className="text-[12px] text-[var(--ink-muted)] mt-0.5">{insight.body}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Noticed items -- cron-materialized observations */}
                  {n && <NoticedItemsList items={n.items || []} assistantName={assistantName} />}

                  {/* Pending drafts -- only when there are actual drafts */}
                  {n && n.topDrafts.length > 0 && (
                    <div>
                      <div className="flex items-baseline justify-between mb-3 gap-3">
                        <div>
                          <div className="text-sm font-medium text-[var(--ink)]">
                            {n.pendingDraftsCount} draft{n.pendingDraftsCount === 1 ? "" : "s"} awaiting review
                          </div>
                          <div className="text-[11px] text-[var(--ink-muted)] mt-0.5">
                            Auto-proposed reminders. Nothing sends until you approve.
                          </div>
                        </div>
                        <Link
                          href="/reminders"
                          className="inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:underline whitespace-nowrap"
                        >
                          Review all
                          <ArrowUpRight className="w-3 h-3" strokeWidth={1.5} />
                        </Link>
                      </div>
                      <ul className="space-y-2">
                        {n.topDrafts.map((d) => (
                          <li key={d.id}>
                            <Link
                              href="/reminders"
                              className="block group rounded-[4px] border border-[var(--rule)] hover:border-[var(--rule-strong)] p-3 transition"
                            >
                              <div className="flex items-start gap-3">
                                <Bell
                                  className="w-3.5 h-3.5 text-[var(--ink-muted)] mt-0.5 shrink-0"
                                  strokeWidth={1.5}
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm text-[var(--ink)] truncate">
                                    <EntityAsk
                                      kind="draft"
                                      id={d.id}
                                      label={d.subject || "(no subject)"}
                                    >
                                      {d.subject || "(no subject)"}
                                    </EntityAsk>
                                  </div>
                                  <div className="text-[11px] text-[var(--ink-subtle)] truncate mt-0.5 flex items-center gap-2 flex-wrap">
                                    {d.contact_name && <span>{d.contact_name}</span>}
                                    {d.property_address && (
                                      <span className="inline-flex items-center gap-1">
                                        <span className="text-[var(--ink-subtle)]">.</span>
                                        <span>{d.property_address}</span>
                                      </span>
                                    )}
                                    {d.doc_kind && (
                                      <span className="mono uppercase tracking-wider">
                                        . {d.doc_kind}
                                      </span>
                                    )}
                                    {d.send_at && (
                                      <span>
                                        <span className="text-[var(--ink-subtle)]">.</span>{" "}
                                        send {formatRelativeDate(d.send_at)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Expiring documents -- only when there are actual items */}
                  {n && n.topExpiring.length > 0 && (
                    <div>
                      <div className="flex items-baseline justify-between mb-3 gap-3">
                        <div>
                          <div className="text-sm font-medium text-[var(--ink)]">
                            {n.expiringDocsCount} document{n.expiringDocsCount === 1 ? "" : "s"} expiring soon
                          </div>
                          <div className="text-[11px] text-[var(--ink-muted)] mt-0.5">
                            Contracts, renewals, and other dated documents in the next month.
                          </div>
                        </div>
                      </div>
                      <ul className="space-y-2">
                        {n.topExpiring.map((e) => (
                          <li key={e.id}>
                            <Link
                              href={`/vault`}
                              className="block group rounded-[4px] border border-[var(--rule)] hover:border-[var(--rule-strong)] p-3 transition"
                            >
                              <div className="flex items-start gap-3">
                                <FileText
                                  className="w-3.5 h-3.5 text-[var(--ink-muted)] mt-0.5 shrink-0"
                                  strokeWidth={1.5}
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm text-[var(--ink)] truncate">
                                    <EntityAsk
                                      kind="document"
                                      id={e.id}
                                      label={e.title}
                                    >
                                      {e.title}
                                    </EntityAsk>
                                  </div>
                                  <div className="text-[11px] text-[var(--ink-subtle)] truncate mt-0.5 flex items-center gap-2 flex-wrap">
                                    <span className="mono uppercase tracking-wider">
                                      {e.doc_kind}
                                    </span>
                                    {e.property_address && (
                                      <span>. {e.property_address}</span>
                                    )}
                                    <span>
                                      . expires {formatRelativeDate(e.expires_at)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Quiet state -- only if truly nothing to show */}
                  {(!data.usageInsights || data.usageInsights.length === 0) &&
                    (!n || ((n.items || []).length === 0 && n.topDrafts.length === 0 && n.topExpiring.length === 0)) && (
                    <div className="flex-1 flex items-center justify-center py-8">
                      <div className="text-center">
                        <Eye className="w-5 h-5 text-[var(--ink-subtle)] mx-auto mb-2" strokeWidth={1.5} />
                        <div className="text-sm text-[var(--ink-muted)]">
                          {assistantName} is watching your workspace.
                        </div>
                        <div className="text-[11px] text-[var(--ink-subtle)] mt-1">
                          Insights, drafts, and alerts will show up here.
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* Right column: Recent Activity */}
              <section className="glass-card p-5 flex flex-col min-h-[320px]">
                <div className="flex items-center gap-2 mb-4">
                  <Activity className="w-3.5 h-3.5 text-[var(--ink-muted)]" strokeWidth={1.5} />
                  <span className="label-section">Recent activity</span>
                  {data.workflowResults && data.workflowResults.length > 0 && (
                    <Link
                      href="/workflows"
                      className="ml-auto inline-flex items-center gap-1 text-xs text-[var(--ink-muted)] hover:text-[var(--ink)]"
                    >
                      All workflows
                      <ArrowUpRight className="w-3 h-3" strokeWidth={1.5} />
                    </Link>
                  )}
                </div>
                <div className="space-y-4 flex-1">
                  {/* Workflow results */}
                  {data.workflowResults && data.workflowResults.length > 0 && (
                    <div>
                      <div className="text-[11px] mono uppercase tracking-wider text-[var(--ink-muted)] mb-2 flex items-center gap-1.5">
                        <Zap className="w-3 h-3" strokeWidth={1.5} />
                        Workflow results
                      </div>
                      <ul className="divide-y divide-[var(--rule)] border-t border-[var(--rule)]">
                        {data.workflowResults.slice(0, 6).map((wr) => (
                          <li key={wr.id} className="py-3">
                            <div className="flex items-start gap-3">
                              <div className="mt-0.5 shrink-0">
                                <Zap
                                  className={`w-4 h-4 ${
                                    wr.status === "failed"
                                      ? "text-[var(--danger)]"
                                      : wr.status === "completed"
                                        ? "text-[var(--verified)]"
                                        : "text-[var(--accent)]"
                                  }`}
                                  strokeWidth={1.5}
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-baseline gap-2 mb-0.5">
                                  <div className="text-sm font-medium truncate">
                                    {wr.workflow_name}
                                  </div>
                                  <span
                                    className={`mono uppercase tracking-wider text-[10px] shrink-0 ${
                                      wr.status === "completed"
                                        ? "text-[var(--verified)]"
                                        : wr.status === "failed"
                                          ? "text-[var(--danger)]"
                                          : "text-[var(--accent)]"
                                    }`}
                                  >
                                    {wr.status}
                                  </span>
                                  <div className="text-xs mono text-[var(--ink-subtle)] shrink-0 ml-auto">
                                    {formatRelativeDate(wr.finished_at || wr.created_at)}
                                  </div>
                                </div>
                                {wr.summary ? (
                                  <div className="text-sm text-[var(--ink-muted)] leading-relaxed whitespace-pre-line line-clamp-3">
                                    {wr.summary}
                                  </div>
                                ) : wr.error ? (
                                  <div className="text-sm text-[var(--danger)] line-clamp-2">
                                    {wr.error}
                                  </div>
                                ) : (
                                  <div className="text-sm text-[var(--ink-subtle)] italic">
                                    No output recorded.
                                  </div>
                                )}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Your workflows -- quick-run cards when there's no
                      activity yet. Gives the right column something
                      actionable instead of an empty placeholder. */}
                  {(!data.workflowResults || data.workflowResults.length === 0) &&
                    (!data.recentActivity || data.recentActivity.length === 0) &&
                    data.enabledWorkflows && data.enabledWorkflows.length > 0 && (
                    <div>
                      <div className="text-[11px] mono uppercase tracking-wider text-[var(--ink-muted)] mb-2 flex items-center gap-1.5">
                        <Zap className="w-3 h-3" strokeWidth={1.5} />
                        Your workflows
                      </div>
                      <ul className="space-y-2">
                        {data.enabledWorkflows.map((wf) => (
                          <li key={wf.id}>
                            <Link
                              href={`/dante/workflows/${wf.id}`}
                              className="flex items-center gap-3 px-3 py-2.5 rounded-[4px] border border-[var(--rule)] hover:border-[var(--rule-strong)] bg-[var(--canvas)] transition group"
                            >
                              <Zap className="w-4 h-4 text-[var(--accent)] shrink-0" strokeWidth={1.5} />
                              <span className="text-sm font-medium text-[var(--ink)] truncate flex-1">{wf.name}</span>
                              <span className="text-[11px] text-[var(--ink-muted)] group-hover:text-[var(--accent)] transition flex items-center gap-1 shrink-0">
                                <Play className="w-3 h-3" strokeWidth={1.5} />
                                Run
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Activity feed */}
                  {data.recentActivity && data.recentActivity.length > 0 && (
                    <ul className="divide-y divide-[var(--rule)] border-t border-[var(--rule)]">
                      {data.recentActivity.slice(0, 12).map((a) => (
                        <li key={a.id} className="py-3">
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 shrink-0">
                              <ActivityIcon kind={a.kind} status={a.status} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline gap-2 mb-0.5">
                                <div className="text-sm font-medium truncate">
                                  {a.headline}
                                </div>
                                <div className="text-xs mono text-[var(--ink-subtle)] shrink-0">
                                  {formatRelativeDate(a.timestamp)}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-[var(--ink-muted)]">
                                <ActivityLabel kind={a.kind} />
                                {a.detail && (
                                  <>
                                    <span className="text-[var(--ink-subtle)]">.</span>
                                    <span className="truncate">{a.detail}</span>
                                  </>
                                )}
                                {a.kind === "workflow" && a.status && (
                                  <span
                                    className={`mono uppercase tracking-wider text-[10px] ${
                                      a.status === "completed"
                                        ? "text-[var(--verified)]"
                                        : a.status === "failed"
                                          ? "text-[var(--danger)]"
                                          : "text-[var(--accent)]"
                                    }`}
                                  >
                                    {a.status}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Recent calls */}
                  {data.recentCalls.length > 0 && (
                    <div>
                      <div className="text-[11px] mono uppercase tracking-wider text-[var(--ink-muted)] mb-2 flex items-center gap-1.5">
                        <FileCheck2 className="w-3 h-3" strokeWidth={1.5} />
                        Recent calls
                      </div>
                      <ul className="divide-y divide-[var(--rule)] border-t border-[var(--rule)]">
                        {data.recentCalls.slice(0, 4).map((c) => (
                          <li key={c.id} className="py-3">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-baseline gap-2 mb-1">
                                  <div className="text-sm font-medium truncate">
                                    {c.contact_name || "Unknown"}
                                  </div>
                                  <div className="text-xs mono text-[var(--ink-subtle)]">
                                    {formatRelativeDate(c.created_at)}
                                  </div>
                                </div>
                                <div className="text-sm text-[var(--ink-muted)] line-clamp-1">
                                  {c.body
                                    .replace(/^Call with [^\n]*\n?/, "")
                                    .slice(0, 180)}
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
                    </div>
                  )}

                  {/* Recent Dante conversations */}
                  {data.recentChats && data.recentChats.length > 0 && (
                    <div>
                      <div className="text-[11px] mono uppercase tracking-wider text-[var(--ink-muted)] mb-2 flex items-center gap-1.5">
                        <MessageCircle className="w-3 h-3" strokeWidth={1.5} />
                        Recent conversations
                      </div>
                      <ul className="space-y-1.5">
                        {data.recentChats.map((chat) => (
                          <li key={chat.id}>
                            <Link
                              href={`/dante?chat=${chat.id}`}
                              className="flex items-center gap-3 px-3 py-2 rounded-[4px] border border-[var(--rule)] hover:border-[var(--rule-strong)] bg-[var(--canvas)] transition group"
                            >
                              <MessageCircle className="w-3.5 h-3.5 text-[var(--ink-subtle)] shrink-0" strokeWidth={1.5} />
                              <span className="text-sm text-[var(--ink)] truncate flex-1">
                                {chat.title}
                              </span>
                              <span className="text-[11px] mono text-[var(--ink-subtle)] shrink-0">
                                {formatRelativeDate(chat.updatedAt)}
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Quiet state -- only if truly nothing to show */}
                  {(!data.workflowResults || data.workflowResults.length === 0) &&
                    (!data.recentActivity || data.recentActivity.length === 0) &&
                    (!data.enabledWorkflows || data.enabledWorkflows.length === 0) &&
                    data.recentCalls.length === 0 &&
                    (!data.recentChats || data.recentChats.length === 0) && (
                    <div className="flex-1 flex items-center justify-center py-8">
                      <div className="text-center">
                        <Activity className="w-5 h-5 text-[var(--ink-subtle)] mx-auto mb-2" strokeWidth={1.5} />
                        <div className="text-sm text-[var(--ink-muted)]">
                          No activity yet.
                        </div>
                        <div className="text-[11px] text-[var(--ink-subtle)] mt-1">
                          Workflow results, emails, and calls will appear here.
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </div>
          );
        })()}

      </div>
    </div>
    </AppShell>
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
    <div className="bg-[var(--canvas)] px-5 py-4 h-full hover:bg-[var(--canvas-subtle)] transition">
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

/* ---------------- Activity feed helpers ---------------- */

function ActivityIcon({ kind, status }: { kind: ActivityItem["kind"]; status?: string | null }) {
  const base = "w-4 h-4";
  switch (kind) {
    case "workflow":
      return (
        <Zap
          className={`${base} ${
            status === "failed"
              ? "text-[var(--danger)]"
              : status === "completed"
                ? "text-[var(--verified)]"
                : "text-[var(--accent)]"
          }`}
          strokeWidth={1.5}
        />
      );
    case "email_in":
      return <MailOpen className={`${base} text-[var(--accent)]`} strokeWidth={1.5} />;
    case "email_out":
      return <Send className={`${base} text-[var(--ink-muted)]`} strokeWidth={1.5} />;
    case "sms_in":
      return <MessageSquare className={`${base} text-[var(--accent)]`} strokeWidth={1.5} />;
    case "sms_out":
      return <MessageSquare className={`${base} text-[var(--ink-muted)]`} strokeWidth={1.5} />;
    default:
      return <Activity className={`${base} text-[var(--ink-subtle)]`} strokeWidth={1.5} />;
  }
}

function ActivityLabel({ kind }: { kind: ActivityItem["kind"] }) {
  const labels: Record<ActivityItem["kind"], string> = {
    workflow: "Workflow",
    email_in: "Received",
    email_out: "Sent",
    sms_in: "SMS received",
    sms_out: "SMS sent",
  };
  return (
    <span className="mono uppercase tracking-wider text-[10px] text-[var(--ink-subtle)]">
      {labels[kind]}
    </span>
  );
}

/* ---------------- Noticed items list ----------------
 * Generic dante_noticed cards. Severity-coloured rule on the left,
 * title + body, dismiss-on-X. Click-through resolves by target_kind
 * to the right route (contact, vault item, property doc, reminder).
 */

function noticedHref(item: NoticedItem): string | null {
  if (!item.target_kind || !item.target_id) return null;
  switch (item.target_kind) {
    case "contact":
      return `/client-details-overview?contact=${item.target_id}`;
    case "property_document":
      return `/vault?doc=${item.target_id}`;
    case "vault_item":
      return `/dante/archive?item=${item.target_id}`;
    case "reminder":
      return `/reminders?id=${item.target_id}`;
    case "regulatory_url":
      // For regulatory notices, target_id IS the source URL —
      // open the regulator's page directly. Used by items that
      // came from the regulatory_briefs merge in the dashboard
      // endpoint (replaced the standalone WhatChanged surface).
      return item.target_id;
    case "workflow_proposal":
      // Pending workflow proposal — clicking opens the workflow
      // editor so the user can review the graph and steps before
      // accepting. The Accept button next to the card flips
      // proposal_state directly without navigating.
      return `/dante/workflows/${item.target_id}`;
    default:
      return null;
  }
}

function severityClass(sev: NoticedItem["severity"]): string {
  if (sev === "urgent") return "border-l-2 border-[var(--danger)]";
  if (sev === "attention") return "border-l-2 border-[var(--accent)]";
  return "border-l-2 border-[var(--rule)]";
}

function NoticedItemsList({
  items,
  assistantName,
}: {
  items: NoticedItem[];
  assistantName: string;
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const visible = items.filter((i) => !hidden.has(i.id));
  if (visible.length === 0) return null;

  async function dismiss(id: string) {
    setHidden((s) => {
      const next = new Set(s);
      next.add(id);
      return next;
    });
    try {
      // Workflow proposals project on-the-fly with synthetic ids
      // ("proposal:<uuid>"); decline routes to the proposal endpoint
      // instead of the noticed/handle endpoint (which expects a
      // dante_noticed row id). Persisted notices use the stable
      // dante_noticed handle path.
      if (id.startsWith("proposal:")) {
        const wfId = id.slice("proposal:".length);
        await fetch(`/api/dante/workflows/${wfId}/proposal`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "decline" }),
        });
      } else {
        await fetch(`/api/dante/noticed/${id}/handle`, { method: "POST" });
      }
    } catch {
      // optimistic dismiss; if the network call fails the card will
      // reappear on next fetch — acceptable.
    }
  }

  async function acceptProposal(id: string) {
    if (!id.startsWith("proposal:")) return;
    const wfId = id.slice("proposal:".length);
    setHidden((s) => {
      const next = new Set(s);
      next.add(id);
      return next;
    });
    try {
      await fetch(`/api/dante/workflows/${wfId}/proposal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept" }),
      });
    } catch {
      // Leave the card hidden optimistically; the next dashboard
      // fetch will re-show it if the accept failed.
    }
  }

  return (
    <div className="mb-5 pb-5 border-b border-[var(--rule)]">
      <div className="text-[11px] mono uppercase tracking-wider text-[var(--ink-muted)] mb-2">
        {assistantName} noticed
      </div>
      <ul className="space-y-2">
        {visible.slice(0, 6).map((item) => {
          const href = noticedHref(item);
          // Per-client regulatory notices carry a regulation citation
          // so the advisor can jump from "X affects Mrs. Chen" to the
          // underlying SEC/Federal Register page in one click. Find
          // the first regulation-shaped citation and surface it as a
          // secondary link below the body.
          const regCitation = item.citations?.find(
            (c) => c.source_kind === "regulation" && c.source_url,
          );
          const inner = (
            <div className={`flex items-start gap-3 px-3 py-2.5 ${severityClass(item.severity)} bg-[var(--canvas-subtle)] rounded-r-[4px]`}>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-[var(--ink)] truncate">{item.title}</div>
                {item.body && (
                  <div className="text-[12px] text-[var(--ink-muted)] mt-0.5 line-clamp-2">{item.body}</div>
                )}
                {regCitation && (
                  <a
                    href={regCitation.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-block mt-1 text-[11px] text-[var(--accent)] hover:underline"
                  >
                    View regulation →
                  </a>
                )}
                {item.kind === "workflow_suggested" && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void acceptProposal(item.id);
                    }}
                    className="inline-block mt-1.5 mr-2 px-2 py-0.5 text-[11px] rounded-[4px] bg-[var(--accent)] text-white hover:opacity-90 transition"
                  >
                    Accept
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void dismiss(item.id);
                }}
                aria-label={item.kind === "workflow_suggested" ? "Decline" : "Dismiss"}
                className="p-1 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-soft)] transition"
              >
                <X className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            </div>
          );
          // Regulatory items point at an external regulator URL — render
          // as an <a target="_blank"> so the page opens in the browser
          // (or the OS handler on Electron) instead of trying to route
          // internally.
          const isExternal = item.target_kind === "regulatory_url";
          return (
            <li key={item.id}>
              {href ? (
                isExternal ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block hover:bg-[var(--canvas-subtle-hover,var(--canvas-subtle))] transition rounded-[4px]"
                  >
                    {inner}
                  </a>
                ) : (
                  <Link href={href} className="block hover:bg-[var(--canvas-subtle-hover,var(--canvas-subtle))] transition rounded-[4px]">
                    {inner}
                  </Link>
                )
              ) : (
                inner
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
