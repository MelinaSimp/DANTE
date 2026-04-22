"use client";

// app/dante/templates/DanteTemplatesClient.tsx
//
// Gallery of pre-built advisor workflows. Reads WORKFLOW_TEMPLATES
// from lib/dante/templates and groups by category. Each card has a
// single "Clone to my workspace" button that POSTs to the clone
// endpoint and, on success, redirects to the freshly-cloned workflow's
// canvas so the user lands directly in the editor.
//
// Archive-aware templates show a "needs archive" pill, and we surface
// a soft warning at the top of the page when the workspace has zero
// indexed documents — the templates will still run, they'll just get
// empty context blocks.

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import DanteGateLink from "@/components/dante/DanteGateLink";
import {
  ArrowLeft, Sparkles, Copy, Loader2, Archive as ArchiveIcon,
  ClipboardList, MailCheck, CalendarClock, Eye, Cake, Coins,
  TrendingDown, CalendarDays, FileSpreadsheet, UserCheck, BookOpen,
  UserPlus, Calculator, Share2, Landmark, RefreshCw, CalendarCheck,
  ScrollText, PiggyBank,
  Zap, AlertCircle, ArrowUpRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { WORKFLOW_TEMPLATES, type WorkflowTemplate } from "@/lib/dante/templates";

// Icon names in the templates module are strings — we resolve them
// against this whitelist so a typo is a compile error, not a runtime
// "undefined is not a function".
const ICONS: Record<string, LucideIcon> = {
  ClipboardList, MailCheck, CalendarClock, Eye, Cake, Coins,
  TrendingDown, CalendarDays, FileSpreadsheet, UserCheck, BookOpen,
  UserPlus, Calculator, Share2, Landmark, RefreshCw, CalendarCheck,
  ScrollText, PiggyBank,
  Sparkles, Zap,
};

function accentClasses(accent: WorkflowTemplate["accent"]): {
  iconWrap: string; dot: string;
} {
  switch (accent) {
    case "verified": return {
      iconWrap: "bg-[var(--verified-soft)] text-[var(--verified)]",
      dot: "bg-[var(--verified)]",
    };
    case "accent": return {
      iconWrap: "bg-[var(--accent-soft)] text-[var(--accent)]",
      dot: "bg-[var(--accent)]",
    };
    case "flag": return {
      iconWrap: "bg-[var(--flag-soft)] text-[var(--flag)]",
      dot: "bg-[var(--flag)]",
    };
    case "ink":
    default: return {
      iconWrap: "bg-[var(--canvas-subtle)] text-[var(--ink)]",
      dot: "bg-[var(--ink)]",
    };
  }
}

// Render category order — keep "Client communication" first since
// it's the most tangible starting point for advisors new to Dante.
const CATEGORY_ORDER: WorkflowTemplate["category"][] = [
  "Client communication",
  "Operations",
  "Compliance",
  "Research",
  "Prospecting",
];

interface Props {
  archiveReady: number;
  canManageArchive: boolean;
}

export default function DanteTemplatesClient({ archiveReady, canManageArchive }: Props) {
  const router = useRouter();
  const [cloningSlug, setCloningSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<WorkflowTemplate["category"], WorkflowTemplate[]>();
    for (const t of WORKFLOW_TEMPLATES) {
      const bucket = map.get(t.category) || [];
      bucket.push(t);
      map.set(t.category, bucket);
    }
    return map;
  }, []);

  const archiveAwareCount = WORKFLOW_TEMPLATES.filter((t) => t.requiresArchive).length;

  async function clone(slug: string) {
    setError(null);
    setCloningSlug(slug);
    try {
      const res = await fetch(`/api/dante/templates/${slug}/clone`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || `Clone failed (${res.status})`);
      }
      const id: string | undefined = json?.workflow?.id;
      if (!id) throw new Error("Clone succeeded but no workflow id returned");
      router.push(`/dante/workflows/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setCloningSlug(null);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--canvas)]">
      {/* Top bar */}
      <div className="sticky top-0 z-20 flex items-center justify-between px-6 md:px-8 py-4 bg-[var(--canvas)] border-b border-[var(--rule)]">
        <div className="flex items-center gap-3">
          <img src="/brand/logo-circle.png" alt="Drift" className="w-6 h-6 rounded-full object-cover" />
          <span className="text-sm font-semibold text-[var(--ink)]">Drift</span>
          <span className="text-xs text-[var(--ink-subtle)]">/</span>
          <DanteGateLink variant="breadcrumb" />
          <span className="text-xs text-[var(--ink-subtle)]">/</span>
          <span className="text-xs text-[var(--ink)]">Templates</span>
        </div>
        <Link href="/dante" className="flex items-center gap-1.5 px-3 py-2 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition text-sm font-medium">
          <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
          <span className="hidden sm:inline">Dante</span>
        </Link>
      </div>

      <div className="px-6 md:px-8 py-12 max-w-[1100px] mx-auto">
        {/* Header */}
        <div className="mb-10">
          <div className="label-section mb-3">Dante · Workflow templates</div>
          <h1 className="heading-display text-4xl text-[var(--ink)] mb-4">
            Starter automations, tuned for financial advisors.
          </h1>
          <p className="text-base text-[var(--ink-muted)] max-w-2xl leading-relaxed">
            Each template is a real, runnable workflow — meeting prep,
            follow-up drafts, QBR reminders, life-event scanners. Clone
            one into your workspace and tweak it in the visual canvas.
            Archive-aware templates cite your firm&apos;s own documents.
          </p>

          <div className="mt-5 flex items-center gap-4 text-xs text-[var(--ink-muted)]">
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} />
              <strong className="font-semibold text-[var(--ink)]">{WORKFLOW_TEMPLATES.length}</strong> templates
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ArchiveIcon className="w-3.5 h-3.5" strokeWidth={1.5} />
              <strong className="font-semibold text-[var(--ink)]">{archiveAwareCount}</strong> archive-aware
            </span>
          </div>
        </div>

        {/* Archive warning — advisory, doesn't block. Copy + CTA vary
            based on who's looking: the owner gets a link to the vault,
            a member gets told to route through their owner (the
            archive is owner-only by design). */}
        {archiveReady === 0 && (
          <div className="mb-8 card-flat p-4 flex items-start gap-3 border-[var(--flag-soft)] bg-[var(--flag-soft)]/50">
            <AlertCircle className="w-4 h-4 text-[var(--flag)] mt-0.5 shrink-0" strokeWidth={1.5} />
            <div className="flex-1 text-sm">
              <div className="font-semibold text-[var(--ink)] mb-0.5">
                {canManageArchive ? "Your archive is empty." : "The firm archive is empty."}
              </div>
              <p className="text-[var(--ink-muted)] leading-relaxed">
                Templates marked <em>needs archive</em> will still run, but
                their <code className="text-[var(--ink)]">archive_lookup</code> steps
                will return empty context — downstream prompts get nothing
                to cite.{" "}
                {canManageArchive
                  ? "Upload some firm documents first and the same templates become far more useful."
                  : "Ask your workspace owner to upload the firm's core documents (IPS, policies, compliance memos) before running these."}
              </p>
              {canManageArchive && (
                <Link href="/dante/archive"
                  className="mt-2 inline-flex items-center gap-1 text-[var(--accent)] hover:underline">
                  Go to archive
                  <ArrowUpRight className="w-3 h-3" strokeWidth={1.5} />
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Error toast */}
        {error && (
          <div className="mb-6 card-flat p-3 flex items-start gap-2 border-[var(--danger-soft)] bg-[var(--danger-soft)]/50">
            <AlertCircle className="w-4 h-4 text-[var(--danger)] mt-0.5 shrink-0" strokeWidth={1.5} />
            <div className="text-sm text-[var(--ink)]">{error}</div>
          </div>
        )}

        {/* Gallery */}
        <div className="space-y-10">
          {CATEGORY_ORDER.map((cat) => {
            const templates = grouped.get(cat);
            if (!templates || templates.length === 0) return null;
            return (
              <section key={cat}>
                <div className="flex items-baseline justify-between mb-4">
                  <h2 className="text-sm font-semibold text-[var(--ink)] uppercase tracking-wider">
                    {cat}
                  </h2>
                  <span className="text-xs text-[var(--ink-subtle)]">
                    {templates.length} template{templates.length === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  {templates.map((t) => {
                    const Icon = ICONS[t.icon] ?? Zap;
                    const a = accentClasses(t.accent);
                    const isCloning = cloningSlug === t.slug;
                    const disabled = cloningSlug !== null;
                    return (
                      <div key={t.slug} className="card-flat p-5 flex flex-col">
                        <div className="flex items-start gap-3 mb-3">
                          <div className={`${a.iconWrap} rounded-[4px] p-2.5 shrink-0`}>
                            <Icon className="w-5 h-5" strokeWidth={1.5} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                              <h3 className="text-[15px] font-semibold text-[var(--ink)]">
                                {t.name}
                              </h3>
                              {t.requiresArchive && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[3px] bg-[var(--accent-soft)] text-[var(--accent)] text-[10px] font-medium">
                                  <ArchiveIcon className="w-2.5 h-2.5" strokeWidth={1.5} />
                                  needs archive
                                </span>
                              )}
                            </div>
                            <div className="inline-flex items-center gap-1 text-[11px] text-[var(--ink-muted)]">
                              <span className={`w-1.5 h-1.5 rounded-full ${a.dot}`} />
                              {t.triggerLabel}
                            </div>
                          </div>
                        </div>

                        <p className="text-sm text-[var(--ink-muted)] leading-relaxed mb-4">
                          {t.description}
                        </p>

                        <div className="mt-auto flex items-center justify-between gap-3">
                          <div className="text-[11px] text-[var(--ink-subtle)]">
                            {t.graph.nodes.length} step{t.graph.nodes.length === 1 ? "" : "s"}
                          </div>
                          <button
                            onClick={() => clone(t.slug)}
                            disabled={disabled}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-xs font-medium hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {isCloning ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
                                Cloning…
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" strokeWidth={1.5} />
                                Clone to my workspace
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
