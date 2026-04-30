"use client";

// CCO dashboard. Five sections + records export. Each section
// collapses; counts shown on the section headers. New-row forms
// live inline rather than as drawers — fewer clicks, more keyboard.

import { useCallback, useEffect, useState } from "react";
import {
  ShieldCheck,
  Megaphone,
  FileText,
  Briefcase,
  Star,
  Download,
  Loader2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Plus,
  ChevronRight,
  ChevronDown,
  Sparkles,
  X,
} from "lucide-react";

type Tab = "flags" | "marketing" | "advertising" | "adv" | "oba" | "facts";

const TAB_META: Record<
  Tab,
  { label: string; icon: any; description: string }
> = {
  flags: {
    label: "Compliance flags",
    icon: ShieldCheck,
    description:
      "Findings the scanner raised on outbound emails, notes, and calls.",
  },
  marketing: {
    label: "Marketing reviews",
    icon: Megaphone,
    description:
      "Campaigns / posts / blog drafts awaiting CCO sign-off before send.",
  },
  advertising: {
    label: "Advertising reviews",
    icon: Star,
    description:
      "Testimonials, endorsements, third-party ratings under SEC Marketing Rule.",
  },
  adv: {
    label: "ADV drafts",
    icon: FileText,
    description:
      "Form ADV Part 2A in progress, with LLM-assisted section drafting.",
  },
  oba: {
    label: "Outside business activities",
    icon: Briefcase,
    description:
      "Advisor-disclosed OBAs (board seats, consulting, rentals) with annual attestation cycle.",
  },
  facts: {
    label: "Firm facts",
    icon: FileText,
    description:
      "Firm facts (AUM, services, owners, custodians) used to ground ADV draft generation. Maintain once, reuse across drafts.",
  },
};

// ── Marketing review row ─────────────────────────────────────
interface MarketingRow {
  id: string;
  channel: string;
  title: string;
  body: string;
  intended_audience: string | null;
  intended_send_at: string | null;
  scan_severity: "info" | "warn" | "block" | null;
  status: "pending" | "approved" | "rejected" | "changes_requested";
  review_note: string | null;
  approved_for_use_until: string | null;
  reviewed_at: string | null;
  created_at: string;
  submitted_by?: string;
}

interface AdvertisingRow {
  id: string;
  ad_type: string;
  source: string | null;
  content: string;
  is_compensated: boolean;
  compensation_amount: number | null;
  has_disclosure: boolean;
  disclosure_text: string | null;
  status: "pending" | "approved" | "rejected" | "changes_requested";
  review_note: string | null;
  retention_until: string | null;
  approved_for_use_until: string | null;
  created_at: string;
  submitted_by?: string;
}

interface AdvRow {
  id: string;
  title: string;
  effective_date: string | null;
  status: "draft" | "reviewed" | "filed" | "archived";
  sections: Record<string, { title: string; content: string; last_edited_at: string }>;
  filed_at: string | null;
  notes: string | null;
  updated_at: string;
}

interface ObaRow {
  id: string;
  advisor_name: string;
  activity_name: string;
  activity_type: string | null;
  description: string | null;
  is_compensated: boolean;
  estimated_hours_per_month: number | null;
  start_date: string | null;
  end_date: string | null;
  is_disclosed_to_clients: boolean;
  disclosure_status: "active" | "inactive" | "pending_review";
  last_attested_at: string | null;
  next_attestation_due: string | null;
  notes: string | null;
}

interface FlagRow {
  id: string;
  source_type: string;
  source_id: string;
  layer: string;
  rule_id: string | null;
  severity: "info" | "warn" | "block";
  message: string;
  status: "pending" | "approved" | "dismissed";
  created_at: string;
}

function severityChip(sev: "info" | "warn" | "block" | null) {
  if (!sev)
    return (
      <span className="text-[10px] mono text-[var(--ink-subtle)]">
        not scanned
      </span>
    );
  const colorVar =
    sev === "block"
      ? "var(--danger)"
      : sev === "warn"
      ? "var(--flag, var(--accent))"
      : "var(--ink-subtle)";
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-[2px] mono uppercase tracking-wider"
      style={{ color: colorVar, border: `1px solid ${colorVar}` }}
    >
      {sev === "block" && <AlertTriangle className="w-2.5 h-2.5" />}
      {sev}
    </span>
  );
}

function statusChip(s: string) {
  const map: Record<string, { color: string; label: string }> = {
    pending: { color: "var(--ink-muted)", label: "pending" },
    approved: { color: "var(--verified)", label: "approved" },
    rejected: { color: "var(--danger)", label: "rejected" },
    changes_requested: { color: "var(--flag, var(--accent))", label: "changes" },
    dismissed: { color: "var(--ink-subtle)", label: "dismissed" },
    draft: { color: "var(--ink-muted)", label: "draft" },
    reviewed: { color: "var(--ink)", label: "reviewed" },
    filed: { color: "var(--verified)", label: "filed" },
    archived: { color: "var(--ink-subtle)", label: "archived" },
    active: { color: "var(--verified)", label: "active" },
    inactive: { color: "var(--ink-subtle)", label: "inactive" },
    pending_review: { color: "var(--flag, var(--accent))", label: "pending" },
  };
  const m = map[s] || { color: "var(--ink-muted)", label: s };
  return (
    <span
      className="text-[10px] mono uppercase tracking-wider px-1.5 py-0.5 rounded-[2px]"
      style={{ color: m.color, border: `1px solid ${m.color}` }}
    >
      {m.label}
    </span>
  );
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function ComplianceClient() {
  const [activeTab, setActiveTab] = useState<Tab>("flags");
  const [me, setMe] = useState<{ userId: string; role: string | null; isAdmin: boolean }>({
    userId: "",
    role: null,
    isAdmin: false,
  });
  const [flags, setFlags] = useState<FlagRow[]>([]);
  const [marketing, setMarketing] = useState<(MarketingRow & { submitted_by?: string })[]>([]);
  const [advertising, setAdvertising] = useState<(AdvertisingRow & { submitted_by?: string })[]>([]);
  const [adv, setAdv] = useState<(AdvRow & { created_by?: string })[]>([]);
  const [oba, setOba] = useState<ObaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetch("/api/me", { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((j) => {
        if (j) {
          const role = j.role || null;
          // Owner / admin / cco roles can review
          const isAdmin = role === "owner" || role === "admin" || role === "cco";
          setMe({ userId: j.userId, role, isAdmin });
        }
      })
      .catch(() => {});
  }, []);

  // Inline new-row forms
  const [showNewMarketing, setShowNewMarketing] = useState(false);
  const [showNewAd, setShowNewAd] = useState(false);
  const [showNewAdv, setShowNewAdv] = useState(false);
  const [showNewOba, setShowNewOba] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [fRes, mRes, aRes, vRes, oRes] = await Promise.all([
        fetch("/api/compliance/flags?status=pending&limit=100", {
          credentials: "include",
        }).catch(() => null),
        fetch("/api/compliance/v2/marketing", { credentials: "include" }),
        fetch("/api/compliance/v2/advertising", { credentials: "include" }),
        fetch("/api/compliance/v2/adv", { credentials: "include" }),
        fetch("/api/compliance/v2/oba", { credentials: "include" }),
      ]);
      if (fRes && fRes.ok) {
        const j = await fRes.json();
        setFlags((j.flags || j.rows || []) as FlagRow[]);
      }
      const [m, a, v, o] = await Promise.all([
        mRes.json(),
        aRes.json(),
        vRes.json(),
        oRes.json(),
      ]);
      setMarketing((m.rows || []) as MarketingRow[]);
      setAdvertising((a.rows || []) as AdvertisingRow[]);
      setAdv((v.rows || []) as AdvRow[]);
      setOba((o.rows || []) as ObaRow[]);
    } catch (e: any) {
      setErr(e?.message || "Failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const exportRecords = async (type: string) => {
    setExporting(true);
    try {
      // Default to last 12 months.
      const to = new Date().toISOString();
      const from = new Date(
        Date.now() - 365 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const r = await fetch(
        `/api/compliance/v2/records/export?type=${type}&from=${from.slice(0, 10)}&to=${to.slice(0, 10)}`,
        { credentials: "include" },
      );
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        alert(j?.error || `Export failed (${r.status})`);
        return;
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `compliance-records-${type}-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const counts: Record<Tab, number> = {
    flags: flags.length,
    marketing: marketing.filter((m) => m.status === "pending").length,
    advertising: advertising.filter((a) => a.status === "pending").length,
    adv: adv.filter((a) => a.status === "draft").length,
    oba: oba.filter((o) => {
      if (!o.next_attestation_due) return false;
      return new Date(o.next_attestation_due).getTime() < Date.now() + 30 * 24 * 60 * 60 * 1000;
    }).length,
    facts: 0,
  };

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <div className="max-w-6xl mx-auto px-6 md:px-10 py-10 space-y-8">
        {/* Header */}
        <div className="flex items-baseline justify-between flex-wrap gap-4">
          <div>
            <div className="label-section mb-1">Compliance</div>
            <h1 className="heading-display text-3xl text-[var(--ink)]">
              CCO desk
            </h1>
            <p className="prose-body text-[var(--ink-muted)] mt-1.5 max-w-prose">
              Reactive scanner findings, marketing &amp; advertising review queues,
              ADV drafts, OBA roster, and the books-and-records export.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => exportRecords("all")}
              disabled={exporting}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-[4px] border border-[var(--rule)] hover:bg-[var(--canvas-subtle)] text-xs text-[var(--ink)] disabled:opacity-50"
            >
              {exporting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
              ) : (
                <Download className="w-3.5 h-3.5" strokeWidth={1.5} />
              )}
              Export records (12 mo)
            </button>
          </div>
        </div>

        {err && (
          <div className="text-xs text-[var(--danger)] flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" strokeWidth={1.5} />
            {err}
          </div>
        )}

        {/* Tab strip */}
        <div className="flex items-center gap-2 flex-wrap border-b border-[var(--rule)]">
          {(Object.keys(TAB_META) as Tab[]).map((t) => {
            const Icon = TAB_META[t].icon;
            const active = activeTab === t;
            return (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className="inline-flex items-center gap-1.5 text-sm px-3 py-2 transition border-b-2 -mb-px"
                style={{
                  borderColor: active ? "var(--ink)" : "transparent",
                  color: active ? "var(--ink)" : "var(--ink-muted)",
                  fontWeight: active ? 600 : 400,
                }}
              >
                <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
                {TAB_META[t].label}
                {counts[t] > 0 && (
                  <span
                    className="text-[10px] mono px-1.5 py-0.5 rounded-[2px]"
                    style={{
                      background: "var(--canvas-subtle)",
                      color: "var(--ink)",
                    }}
                  >
                    {counts[t]}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {loading && (
          <div className="text-xs text-[var(--ink-subtle)] flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
            Loading…
          </div>
        )}

        {/* Section: Compliance flags (existing scanner output) */}
        {activeTab === "flags" && (
          <section className="space-y-3">
            <p className="text-xs text-[var(--ink-muted)]">
              {TAB_META.flags.description}
            </p>
            {flags.length === 0 ? (
              <div className="card-flat p-8 text-center text-sm text-[var(--ink-muted)]">
                No pending scanner flags.
              </div>
            ) : (
              <div className="border border-[var(--rule)] rounded-[4px] divide-y divide-[var(--rule)]">
                {flags.map((f) => (
                  <div key={f.id} className="px-3 py-2.5">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      {severityChip(f.severity)}
                      <span className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)]">
                        {f.source_type}
                      </span>
                      <span className="text-xs text-[var(--ink-muted)]">·</span>
                      <span className="text-xs text-[var(--ink-muted)] mono">
                        {f.rule_id || f.layer}
                      </span>
                    </div>
                    <p className="text-sm text-[var(--ink)] mt-1">{f.message}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Section: Marketing reviews */}
        {activeTab === "marketing" && (
          <section className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-xs text-[var(--ink-muted)]">
                {TAB_META.marketing.description}
              </p>
              <button
                onClick={() => setShowNewMarketing(!showNewMarketing)}
                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-[4px] border border-[var(--rule)] hover:bg-[var(--canvas-subtle)]"
              >
                {showNewMarketing ? (
                  <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                ) : (
                  <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
                )}
                {showNewMarketing ? "Cancel" : "Submit for review"}
              </button>
            </div>
            {showNewMarketing && (
              <NewMarketingForm
                onCreated={async () => {
                  setShowNewMarketing(false);
                  await reload();
                }}
              />
            )}
            <MarketingList rows={marketing} reload={reload} me={me} />
          </section>
        )}

        {activeTab === "advertising" && (
          <section className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-xs text-[var(--ink-muted)]">
                {TAB_META.advertising.description}
              </p>
              <button
                onClick={() => setShowNewAd(!showNewAd)}
                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-[4px] border border-[var(--rule)] hover:bg-[var(--canvas-subtle)]"
              >
                {showNewAd ? (
                  <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                ) : (
                  <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
                )}
                {showNewAd ? "Cancel" : "Submit testimonial / endorsement"}
              </button>
            </div>
            {showNewAd && (
              <NewAdvertisingForm
                onCreated={async () => {
                  setShowNewAd(false);
                  await reload();
                }}
              />
            )}
            <AdvertisingList rows={advertising} reload={reload} me={me} />
          </section>
        )}

        {activeTab === "adv" && (
          <section className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-xs text-[var(--ink-muted)]">
                {TAB_META.adv.description}
              </p>
              <button
                onClick={() => setShowNewAdv(!showNewAdv)}
                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-[4px] border border-[var(--rule)] hover:bg-[var(--canvas-subtle)]"
              >
                {showNewAdv ? (
                  <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                ) : (
                  <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
                )}
                {showNewAdv ? "Cancel" : "New ADV draft"}
              </button>
            </div>
            {showNewAdv && (
              <NewAdvForm
                onCreated={async () => {
                  setShowNewAdv(false);
                  await reload();
                }}
              />
            )}
            <AdvList rows={adv} reload={reload} />
          </section>
        )}

        {activeTab === "facts" && (
          <FirmFactsEditor canEdit={me.isAdmin} />
        )}

        {activeTab === "oba" && (
          <section className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-xs text-[var(--ink-muted)]">
                {TAB_META.oba.description}
              </p>
              <button
                onClick={() => setShowNewOba(!showNewOba)}
                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-[4px] border border-[var(--rule)] hover:bg-[var(--canvas-subtle)]"
              >
                {showNewOba ? (
                  <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                ) : (
                  <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
                )}
                {showNewOba ? "Cancel" : "Disclose OBA"}
              </button>
            </div>
            {showNewOba && (
              <NewObaForm
                onCreated={async () => {
                  setShowNewOba(false);
                  await reload();
                }}
              />
            )}
            <ObaList rows={oba} reload={reload} />
          </section>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── New-row forms ─────────────────────────

function NewMarketingForm({ onCreated }: { onCreated: () => void }) {
  const [channel, setChannel] = useState("email_campaign");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState("retail");
  const [saving, setSaving] = useState(false);
  const [scanInfo, setScanInfo] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    setScanInfo(null);
    try {
      const r = await fetch("/api/compliance/v2/marketing", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          title,
          body,
          intended_audience: audience,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        alert(j?.error || "Failed");
        return;
      }
      // Run the scanner immediately so the CCO sees flags on the row.
      const id = j.row?.id;
      if (id) {
        const sr = await fetch(`/api/compliance/v2/marketing/${id}/scan`, {
          method: "POST",
          credentials: "include",
        });
        if (sr.ok) {
          const sj = await sr.json();
          setScanInfo(
            `Scanner: ${sj.flags_count} flag${sj.flags_count === 1 ? "" : "s"}, severity ${sj.highest_severity || "clean"}`,
          );
        }
      }
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card-flat p-4 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          className="text-xs px-2 py-1.5 border border-[var(--rule)] rounded-[4px] bg-[var(--canvas)]"
        >
          <option value="email_campaign">Email campaign</option>
          <option value="social_post">Social post</option>
          <option value="blog">Blog</option>
          <option value="newsletter">Newsletter</option>
          <option value="webinar">Webinar</option>
          <option value="other">Other</option>
        </select>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title / subject"
          className="text-xs px-2 py-1.5 border border-[var(--rule)] rounded-[4px] bg-[var(--canvas)]"
        />
        <select
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
          className="text-xs px-2 py-1.5 border border-[var(--rule)] rounded-[4px] bg-[var(--canvas)]"
        >
          <option value="retail">Retail</option>
          <option value="institutional">Institutional</option>
          <option value="mixed">Mixed</option>
        </select>
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={6}
        placeholder="Paste the marketing copy here…"
        className="w-full text-xs px-2 py-1.5 border border-[var(--rule)] rounded-[4px] bg-[var(--canvas)] resize-y"
      />
      <div className="flex items-center gap-3">
        <button
          onClick={submit}
          disabled={!title || !body || saving}
          className="text-xs inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
          ) : (
            <Sparkles className="w-3 h-3" strokeWidth={1.5} />
          )}
          Submit &amp; scan
        </button>
        {scanInfo && (
          <span className="text-[11px] text-[var(--ink-muted)]">{scanInfo}</span>
        )}
      </div>
    </div>
  );
}

function NewAdvertisingForm({ onCreated }: { onCreated: () => void }) {
  const [adType, setAdType] = useState("testimonial");
  const [source, setSource] = useState("");
  const [content, setContent] = useState("");
  const [isCompensated, setIsCompensated] = useState(false);
  const [hasDisclosure, setHasDisclosure] = useState(false);
  const [disclosureText, setDisclosureText] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      const r = await fetch("/api/compliance/v2/advertising", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ad_type: adType,
          source: source || null,
          content,
          is_compensated: isCompensated,
          has_disclosure: hasDisclosure,
          disclosure_text: disclosureText || null,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        alert(j?.error || "Failed");
        return;
      }
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card-flat p-4 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <select
          value={adType}
          onChange={(e) => setAdType(e.target.value)}
          className="text-xs px-2 py-1.5 border border-[var(--rule)] rounded-[4px] bg-[var(--canvas)]"
        >
          <option value="testimonial">Testimonial (client)</option>
          <option value="endorsement">Endorsement (non-client)</option>
          <option value="case_study">Case study</option>
          <option value="third_party_rating">Third-party rating</option>
          <option value="social_proof">Social proof</option>
          <option value="other">Other</option>
        </select>
        <input
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="Source (who said it / which platform)"
          className="text-xs px-2 py-1.5 border border-[var(--rule)] rounded-[4px] bg-[var(--canvas)]"
        />
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={4}
        placeholder="Testimonial / ad copy"
        className="w-full text-xs px-2 py-1.5 border border-[var(--rule)] rounded-[4px] bg-[var(--canvas)] resize-y"
      />
      <div className="flex items-center gap-4 flex-wrap">
        <label className="text-xs flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={isCompensated}
            onChange={(e) => setIsCompensated(e.target.checked)}
          />
          Compensated
        </label>
        <label className="text-xs flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={hasDisclosure}
            onChange={(e) => setHasDisclosure(e.target.checked)}
          />
          Disclosure attached
        </label>
      </div>
      {hasDisclosure && (
        <textarea
          value={disclosureText}
          onChange={(e) => setDisclosureText(e.target.value)}
          rows={2}
          placeholder="Disclosure text (compensation, conflicts, etc.)"
          className="w-full text-xs px-2 py-1.5 border border-[var(--rule)] rounded-[4px] bg-[var(--canvas)] resize-y"
        />
      )}
      <button
        onClick={submit}
        disabled={!content || saving}
        className="text-xs inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] disabled:opacity-50"
      >
        {saving ? <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} /> : null}
        Submit
      </button>
    </div>
  );
}

function NewAdvForm({ onCreated }: { onCreated: () => void }) {
  const [title, setTitle] = useState("Form ADV Part 2A");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      const r = await fetch("/api/compliance/v2/adv", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          effective_date: effectiveDate || null,
          sections: {},
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        alert(j?.error || "Failed");
        return;
      }
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card-flat p-4 flex items-center gap-3 flex-wrap">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="text-xs px-2 py-1.5 border border-[var(--rule)] rounded-[4px] bg-[var(--canvas)] flex-1 min-w-[240px]"
      />
      <input
        type="date"
        value={effectiveDate}
        onChange={(e) => setEffectiveDate(e.target.value)}
        className="text-xs px-2 py-1.5 border border-[var(--rule)] rounded-[4px] bg-[var(--canvas)]"
      />
      <button
        onClick={submit}
        disabled={!title || saving}
        className="text-xs inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] disabled:opacity-50"
      >
        {saving ? <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} /> : null}
        Create draft
      </button>
    </div>
  );
}

function NewObaForm({ onCreated }: { onCreated: () => void }) {
  const [advisorName, setAdvisorName] = useState("");
  const [activityName, setActivityName] = useState("");
  const [activityType, setActivityType] = useState("consulting");
  const [description, setDescription] = useState("");
  const [isCompensated, setIsCompensated] = useState(false);
  const [estimatedHours, setEstimatedHours] = useState<number | "">("");
  const [startDate, setStartDate] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      const r = await fetch("/api/compliance/v2/oba", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          advisor_name: advisorName,
          activity_name: activityName,
          activity_type: activityType,
          description,
          is_compensated: isCompensated,
          estimated_hours_per_month: estimatedHours || null,
          start_date: startDate || null,
          // Default attestation in 12 months.
          next_attestation_due: new Date(
            Date.now() + 365 * 24 * 60 * 60 * 1000,
          )
            .toISOString()
            .slice(0, 10),
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        alert(j?.error || "Failed");
        return;
      }
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card-flat p-4 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <input
          value={advisorName}
          onChange={(e) => setAdvisorName(e.target.value)}
          placeholder="Advisor name"
          className="text-xs px-2 py-1.5 border border-[var(--rule)] rounded-[4px] bg-[var(--canvas)]"
        />
        <input
          value={activityName}
          onChange={(e) => setActivityName(e.target.value)}
          placeholder="Activity name (e.g. Board of XYZ Charity)"
          className="text-xs px-2 py-1.5 border border-[var(--rule)] rounded-[4px] bg-[var(--canvas)]"
        />
        <select
          value={activityType}
          onChange={(e) => setActivityType(e.target.value)}
          className="text-xs px-2 py-1.5 border border-[var(--rule)] rounded-[4px] bg-[var(--canvas)]"
        >
          <option value="board_seat">Board seat</option>
          <option value="consulting">Consulting</option>
          <option value="rental_property">Rental property</option>
          <option value="speaking">Speaking / writing</option>
          <option value="family_business">Family business</option>
          <option value="other">Other</option>
        </select>
        <input
          type="number"
          value={estimatedHours}
          onChange={(e) =>
            setEstimatedHours(e.target.value ? parseInt(e.target.value, 10) : "")
          }
          placeholder="Hours / month"
          className="text-xs px-2 py-1.5 border border-[var(--rule)] rounded-[4px] bg-[var(--canvas)]"
        />
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="text-xs px-2 py-1.5 border border-[var(--rule)] rounded-[4px] bg-[var(--canvas)]"
        />
        <label className="text-xs flex items-center gap-1.5 px-2">
          <input
            type="checkbox"
            checked={isCompensated}
            onChange={(e) => setIsCompensated(e.target.checked)}
          />
          Compensated
        </label>
      </div>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        placeholder="Description"
        className="w-full text-xs px-2 py-1.5 border border-[var(--rule)] rounded-[4px] bg-[var(--canvas)] resize-y"
      />
      <button
        onClick={submit}
        disabled={!advisorName || !activityName || saving}
        className="text-xs inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] disabled:opacity-50"
      >
        {saving ? <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} /> : null}
        Disclose
      </button>
    </div>
  );
}

// ───────────────────────── Lists ─────────────────────────

function MarketingList({
  rows,
  reload,
  me,
}: {
  rows: MarketingRow[];
  reload: () => void;
  me: { userId: string; isAdmin: boolean };
}) {
  if (rows.length === 0)
    return (
      <div className="card-flat p-8 text-center text-sm text-[var(--ink-muted)]">
        No marketing pieces submitted.
      </div>
    );
  return (
    <div className="border border-[var(--rule)] rounded-[4px] divide-y divide-[var(--rule)]">
      {rows.map((m) => (
        <details key={m.id} className="group">
          <summary className="px-3 py-2.5 flex items-center gap-3 cursor-pointer hover:bg-[var(--canvas-subtle)] list-none">
            <ChevronRight className="w-3.5 h-3.5 text-[var(--ink-subtle)] group-open:hidden" strokeWidth={1.5} />
            <ChevronDown className="w-3.5 h-3.5 text-[var(--ink-subtle)] hidden group-open:inline" strokeWidth={1.5} />
            <div className="flex-1 min-w-0">
              <div className="text-sm text-[var(--ink)] truncate">{m.title}</div>
              <div className="text-[11px] text-[var(--ink-subtle)] mono mt-0.5">
                {m.channel} · {m.intended_audience || "—"} · {formatDate(m.created_at)}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {severityChip(m.scan_severity)}
              {statusChip(m.status)}
            </div>
          </summary>
          <div className="px-6 py-3 bg-[var(--canvas-subtle)] border-t border-[var(--rule)] space-y-3">
            <pre className="text-xs whitespace-pre-wrap text-[var(--ink)] mono">{m.body}</pre>
            <div className="flex items-center gap-2 flex-wrap">
              <ReviewButtons
                resource="marketing"
                id={m.id}
                current={m.status}
                reload={reload}
                canReview={me.isAdmin && m.submitted_by !== me.userId}
                disabledReason={
                  !me.isAdmin
                    ? "Workspace admin role required to review"
                    : m.submitted_by === me.userId
                    ? "Cannot review your own submission (FINRA 2210(b))"
                    : undefined
                }
              />
            </div>
          </div>
        </details>
      ))}
    </div>
  );
}

function AdvertisingList({
  rows,
  reload,
  me,
}: {
  rows: AdvertisingRow[];
  reload: () => void;
  me: { userId: string; isAdmin: boolean };
}) {
  if (rows.length === 0)
    return (
      <div className="card-flat p-8 text-center text-sm text-[var(--ink-muted)]">
        No advertising pieces submitted.
      </div>
    );
  return (
    <div className="border border-[var(--rule)] rounded-[4px] divide-y divide-[var(--rule)]">
      {rows.map((a) => (
        <details key={a.id} className="group">
          <summary className="px-3 py-2.5 flex items-center gap-3 cursor-pointer hover:bg-[var(--canvas-subtle)] list-none">
            <ChevronRight className="w-3.5 h-3.5 text-[var(--ink-subtle)] group-open:hidden" strokeWidth={1.5} />
            <ChevronDown className="w-3.5 h-3.5 text-[var(--ink-subtle)] hidden group-open:inline" strokeWidth={1.5} />
            <div className="flex-1 min-w-0">
              <div className="text-sm text-[var(--ink)] truncate">
                {a.ad_type.replace(/_/g, " ")}
                {a.source ? ` · ${a.source}` : ""}
              </div>
              <div className="text-[11px] text-[var(--ink-subtle)] mono mt-0.5">
                {a.is_compensated ? "compensated" : "uncompensated"} ·{" "}
                {a.has_disclosure ? "disclosed" : "no disclosure"} ·{" "}
                {formatDate(a.created_at)}
              </div>
            </div>
            {statusChip(a.status)}
          </summary>
          <div className="px-6 py-3 bg-[var(--canvas-subtle)] border-t border-[var(--rule)] space-y-3">
            <p className="text-xs text-[var(--ink)] whitespace-pre-wrap">
              {a.content}
            </p>
            {a.has_disclosure && a.disclosure_text && (
              <div className="text-[11px] text-[var(--ink-muted)] border-l-2 border-[var(--rule)] pl-2">
                <span className="mono uppercase tracking-wider">Disclosure: </span>
                {a.disclosure_text}
              </div>
            )}
            {a.is_compensated && !a.has_disclosure && (
              <div className="text-[11px] text-[var(--danger)] inline-flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" strokeWidth={1.5} />
                Compensated without disclosure — Marketing Rule violation risk.
              </div>
            )}
            <ReviewButtons
              resource="advertising"
              id={a.id}
              current={a.status}
              reload={reload}
              canReview={me.isAdmin && a.submitted_by !== me.userId}
              disabledReason={
                !me.isAdmin
                  ? "Workspace admin role required to review"
                  : a.submitted_by === me.userId
                  ? "Cannot review your own submission (FINRA 2210(b))"
                  : undefined
              }
            />
          </div>
        </details>
      ))}
    </div>
  );
}

function AdvList({
  rows,
  reload,
}: {
  rows: AdvRow[];
  reload: () => void;
}) {
  if (rows.length === 0)
    return (
      <div className="card-flat p-8 text-center text-sm text-[var(--ink-muted)]">
        No ADV drafts.
      </div>
    );
  return (
    <div className="space-y-2">
      {rows.map((a) => (
        <AdvDraftCard key={a.id} draft={a} reload={reload} />
      ))}
    </div>
  );
}

function AdvDraftCard({ draft, reload }: { draft: AdvRow; reload: () => void }) {
  const [drafting, setDrafting] = useState<string | null>(null);
  const itemNumbers = Array.from({ length: 19 }, (_, i) => String(i + 1));

  const generate = async (item: string) => {
    setDrafting(item);
    try {
      const r = await fetch(`/api/compliance/v2/adv/${draft.id}/draft-section`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item }),
      });
      const j = await r.json();
      if (!r.ok) {
        alert(j?.error || "Failed");
        return;
      }
      await reload();
    } finally {
      setDrafting(null);
    }
  };

  return (
    <div className="border border-[var(--rule)] rounded-[4px]">
      <div className="px-4 py-3 flex items-center justify-between gap-3 border-b border-[var(--rule)]">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-[var(--ink)]">{draft.title}</div>
          <div className="text-[11px] text-[var(--ink-subtle)] mono mt-0.5">
            Effective {formatDate(draft.effective_date)} · updated {formatDate(draft.updated_at)} ·{" "}
            {Object.keys(draft.sections || {}).length} / 19 sections
          </div>
        </div>
        {statusChip(draft.status)}
      </div>
      <div className="px-4 py-3 grid grid-cols-2 md:grid-cols-5 gap-2">
        {itemNumbers.map((item) => {
          const filled = draft.sections?.[`item_${item}`];
          const isDrafting = drafting === item;
          return (
            <button
              key={item}
              onClick={() => generate(item)}
              disabled={isDrafting}
              className="text-xs px-2 py-2 rounded-[4px] border text-left transition disabled:opacity-50"
              style={{
                borderColor: filled ? "var(--ink)" : "var(--rule)",
                background: filled ? "var(--canvas-subtle)" : "var(--canvas)",
              }}
            >
              <div className="flex items-center gap-1.5">
                {isDrafting ? (
                  <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
                ) : filled ? (
                  <CheckCircle2 className="w-3 h-3 text-[var(--verified)]" strokeWidth={1.5} />
                ) : (
                  <Sparkles className="w-3 h-3 text-[var(--ink-muted)]" strokeWidth={1.5} />
                )}
                <span className="mono">Item {item}</span>
              </div>
              <div className="text-[10px] text-[var(--ink-muted)] truncate mt-0.5">
                {filled?.title || "Generate"}
              </div>
            </button>
          );
        })}
      </div>
      {Object.entries(draft.sections || {})
        .sort(([a], [b]) => parseInt(a.replace("item_", ""), 10) - parseInt(b.replace("item_", ""), 10))
        .map(([k, v]) => (
          <details key={k} className="border-t border-[var(--rule)]">
            <summary className="px-4 py-2 cursor-pointer text-xs flex items-center gap-2 hover:bg-[var(--canvas-subtle)]">
              <ChevronRight className="w-3 h-3 text-[var(--ink-subtle)]" strokeWidth={1.5} />
              <span className="mono uppercase tracking-wider text-[var(--ink-muted)]">
                {k.replace("item_", "Item ")}
              </span>
              <span className="text-[var(--ink)]">— {v.title}</span>
            </summary>
            <pre className="px-4 py-3 text-xs whitespace-pre-wrap text-[var(--ink)] bg-[var(--canvas-subtle)] mono">
              {v.content}
            </pre>
          </details>
        ))}
    </div>
  );
}

function ObaList({
  rows,
  reload,
}: {
  rows: ObaRow[];
  reload: () => void;
}) {
  if (rows.length === 0)
    return (
      <div className="card-flat p-8 text-center text-sm text-[var(--ink-muted)]">
        No OBAs disclosed.
      </div>
    );
  return (
    <div className="border border-[var(--rule)] rounded-[4px] divide-y divide-[var(--rule)]">
      {rows.map((o) => {
        const dueSoon =
          o.next_attestation_due &&
          new Date(o.next_attestation_due).getTime() < Date.now() + 30 * 24 * 60 * 60 * 1000;
        return (
          <div key={o.id} className="px-3 py-2.5">
            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-[var(--ink)]">
                  {o.advisor_name} · {o.activity_name}
                </div>
                <div className="text-[11px] text-[var(--ink-muted)] mt-0.5">
                  {o.activity_type?.replace(/_/g, " ")} ·{" "}
                  {o.is_compensated ? "compensated" : "unpaid"}
                  {o.estimated_hours_per_month
                    ? ` · ${o.estimated_hours_per_month}h/mo`
                    : ""}
                </div>
              </div>
              {statusChip(o.disclosure_status)}
            </div>
            {o.description && (
              <p className="text-xs text-[var(--ink)] mt-1.5">{o.description}</p>
            )}
            <div className="flex items-center gap-3 mt-2 text-[11px] text-[var(--ink-subtle)] mono">
              <span>Started {formatDate(o.start_date)}</span>
              <span>·</span>
              <span
                style={{
                  color: dueSoon ? "var(--danger)" : "var(--ink-subtle)",
                }}
              >
                Attestation due {formatDate(o.next_attestation_due)}
              </span>
            </div>
            <div className="mt-2">
              <ReviewButtons
                resource="oba"
                id={o.id}
                current={o.disclosure_status}
                reload={reload}
                isOba
                canReview={true}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ───────────────────────── Firm facts editor ─────────────────────────

const FACTS_FIELDS: Array<{
  key: string;
  label: string;
  type: "text" | "number" | "date" | "boolean" | "longtext";
  hint?: string;
}> = [
  { key: "firm_legal_name", label: "Firm legal name", type: "text" },
  { key: "firm_dba", label: "Doing-business-as name", type: "text" },
  { key: "firm_address", label: "Office address", type: "longtext" },
  { key: "firm_phone", label: "Phone", type: "text" },
  { key: "firm_website", label: "Website", type: "text" },
  { key: "firm_iard_crd", label: "IARD/CRD #", type: "text", hint: "from FINRA" },
  { key: "aum_regulatory", label: "Regulatory AUM (USD)", type: "number" },
  { key: "aum_discretionary", label: "Discretionary AUM (USD)", type: "number" },
  {
    key: "aum_non_discretionary",
    label: "Non-discretionary AUM (USD)",
    type: "number",
  },
  { key: "aum_as_of", label: "AUM as of", type: "date" },
  { key: "client_count", label: "Client count", type: "number" },
  {
    key: "principal_owners",
    label: "Principal owners",
    type: "longtext",
    hint: "one per line: Name, % ownership",
  },
  { key: "cco_name", label: "CCO name", type: "text" },
  {
    key: "services_offered",
    label: "Services offered",
    type: "longtext",
  },
  {
    key: "primary_custodians",
    label: "Primary custodians",
    type: "text",
    hint: "comma-separated",
  },
  {
    key: "fee_schedule_summary",
    label: "Fee schedule summary",
    type: "longtext",
  },
  { key: "account_minimum_usd", label: "Account minimum (USD)", type: "number" },
  {
    key: "has_material_disciplinary_events",
    label: "Has material disciplinary events?",
    type: "boolean",
  },
  {
    key: "disciplinary_summary",
    label: "Disciplinary summary",
    type: "longtext",
    hint: "if any",
  },
  { key: "is_sec_registered", label: "SEC-registered?", type: "boolean" },
  {
    key: "state_registrations",
    label: "State registrations",
    type: "text",
    hint: "comma-separated state codes",
  },
  { key: "has_performance_fees", label: "Charges performance fees?", type: "boolean" },
  { key: "has_custody", label: "Has custody?", type: "boolean" },
  {
    key: "custody_basis",
    label: "Custody basis",
    type: "text",
    hint: "fee deduction / general partner / qualified custodian only",
  },
  { key: "votes_proxies", label: "Votes proxies?", type: "boolean" },
  { key: "notes", label: "Notes", type: "longtext" },
];

function FirmFactsEditor({ canEdit }: { canEdit: boolean }) {
  const [facts, setFacts] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/compliance/v2/facts", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setFacts((j?.facts as Record<string, any>) || {}))
      .finally(() => setLoading(false));
  }, []);

  const setField = (k: string, v: any) =>
    setFacts((prev) => ({ ...prev, [k]: v }));

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch("/api/compliance/v2/facts", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(facts),
      });
      const j = await r.json();
      if (!r.ok) {
        setErr(j?.error || "Save failed");
        return;
      }
      setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="text-xs text-[var(--ink-subtle)] flex items-center gap-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
        Loading facts…
      </div>
    );
  }

  return (
    <section className="card-flat p-6 space-y-4">
      <div>
        <div className="label-section mb-1">Firm facts</div>
        <h2 className="text-base font-semibold">
          Reused across ADV drafts
        </h2>
        <p className="text-xs text-[var(--ink-muted)] mt-1 max-w-prose">
          The ADV section drafter pulls these to ground each generated
          item. Maintain once; the next ADV cycle re-uses everything.
          Anything left blank lands as <span className="mono">[TO BE COMPLETED]</span>{" "}
          in the draft.
          {!canEdit && (
            <span className="text-[var(--ink-subtle)] block mt-2">
              Read-only — workspace admin role required to edit.
            </span>
          )}
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {FACTS_FIELDS.map((f) => {
          const val = facts[f.key];
          if (f.type === "longtext") {
            return (
              <label key={f.key} className="block md:col-span-2">
                <div className="text-xs font-medium text-[var(--ink-muted)] mb-1.5">
                  {f.label}
                  {f.hint && (
                    <span className="text-[10px] text-[var(--ink-subtle)] font-normal ml-1">
                      — {f.hint}
                    </span>
                  )}
                </div>
                <textarea
                  value={val ?? ""}
                  onChange={(e) => setField(f.key, e.target.value)}
                  rows={2}
                  disabled={!canEdit}
                  className="w-full text-xs px-2 py-1.5 border border-[var(--rule)] rounded-[4px] bg-[var(--canvas)] resize-y disabled:opacity-60"
                />
              </label>
            );
          }
          if (f.type === "boolean") {
            return (
              <label key={f.key} className="flex items-center gap-2 mt-6 select-none">
                <input
                  type="checkbox"
                  checked={!!val}
                  onChange={(e) => setField(f.key, e.target.checked)}
                  disabled={!canEdit}
                  className="w-3.5 h-3.5"
                />
                <span className="text-xs text-[var(--ink)]">{f.label}</span>
              </label>
            );
          }
          return (
            <label key={f.key} className="block">
              <div className="text-xs font-medium text-[var(--ink-muted)] mb-1.5">
                {f.label}
                {f.hint && (
                  <span className="text-[10px] text-[var(--ink-subtle)] font-normal ml-1">
                    — {f.hint}
                  </span>
                )}
              </div>
              <input
                type={f.type === "number" ? "number" : f.type}
                value={val ?? ""}
                onChange={(e) =>
                  setField(
                    f.key,
                    f.type === "number"
                      ? e.target.value === ""
                        ? null
                        : parseFloat(e.target.value)
                      : e.target.value,
                  )
                }
                disabled={!canEdit}
                className="w-full text-xs px-2 py-1.5 border border-[var(--rule)] rounded-[4px] bg-[var(--canvas)] disabled:opacity-60"
              />
            </label>
          );
        })}
      </div>
      {canEdit && (
        <div className="flex items-center gap-3">
          <button
            onClick={save}
            disabled={saving}
            className="text-xs inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
            ) : (
              <CheckCircle2 className="w-3 h-3" strokeWidth={1.5} />
            )}
            {saving ? "Saving…" : "Save firm facts"}
          </button>
          {savedAt && !saving && !err && (
            <span className="text-[11px] text-[var(--verified)]">Saved</span>
          )}
          {err && (
            <span className="text-[11px] text-[var(--danger)]">{err}</span>
          )}
        </div>
      )}
    </section>
  );
}

// ───────────────────────── Review buttons ─────────────────────────

function ReviewButtons({
  resource,
  id,
  current,
  reload,
  isOba,
  canReview = true,
  disabledReason,
}: {
  resource: "marketing" | "advertising" | "adv" | "oba";
  id: string;
  current: string;
  reload: () => void;
  isOba?: boolean;
  canReview?: boolean;
  disabledReason?: string;
}) {
  const [updating, setUpdating] = useState<string | null>(null);

  if (!canReview) {
    return (
      <div className="text-[11px] text-[var(--ink-subtle)] italic">
        {disabledReason || "Review unavailable for this user."}
      </div>
    );
  }

  const update = async (status: string) => {
    setUpdating(status);
    try {
      const body = isOba
        ? { disclosure_status: status }
        : { status };
      if (resource === "oba" && status === "active") {
        (body as any).last_attested_at = new Date().toISOString();
      }
      const r = await fetch(`/api/compliance/v2/${resource}/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        alert(j?.error || "Failed");
        return;
      }
      await reload();
    } finally {
      setUpdating(null);
    }
  };

  if (isOba) {
    return (
      <div className="flex items-center gap-2 text-xs">
        {current !== "active" && (
          <button
            onClick={() => update("active")}
            disabled={updating !== null}
            className="px-2 py-1 rounded-[2px] border border-[var(--rule)] hover:bg-[var(--canvas-subtle)] disabled:opacity-50"
          >
            {updating === "active" ? "…" : "Re-attest"}
          </button>
        )}
        {current !== "inactive" && (
          <button
            onClick={() => update("inactive")}
            disabled={updating !== null}
            className="px-2 py-1 rounded-[2px] border border-[var(--rule)] hover:bg-[var(--canvas-subtle)] disabled:opacity-50"
          >
            {updating === "inactive" ? "…" : "Mark inactive"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      {current !== "approved" && (
        <button
          onClick={() => update("approved")}
          disabled={updating !== null}
          className="px-2 py-1 rounded-[2px] border border-[var(--rule)] hover:bg-[var(--canvas-subtle)] disabled:opacity-50"
        >
          {updating === "approved" ? "…" : "Approve"}
        </button>
      )}
      {current !== "changes_requested" && (
        <button
          onClick={() => update("changes_requested")}
          disabled={updating !== null}
          className="px-2 py-1 rounded-[2px] border border-[var(--rule)] hover:bg-[var(--canvas-subtle)] disabled:opacity-50"
        >
          {updating === "changes_requested" ? "…" : "Request changes"}
        </button>
      )}
      {current !== "rejected" && (
        <button
          onClick={() => update("rejected")}
          disabled={updating !== null}
          className="px-2 py-1 rounded-[2px] border border-[var(--rule)] hover:bg-[var(--canvas-subtle)] text-[var(--danger)] disabled:opacity-50"
        >
          {updating === "rejected" ? "…" : "Reject"}
        </button>
      )}
    </div>
  );
}
