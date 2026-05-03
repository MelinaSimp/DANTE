"use client";

// PropertiesClient — list + create. Mirrors the table style of
// /admin/workspaces and the inline-create pattern of the contacts
// page. Status is shown as a chip; click a row to open the detail
// page.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Home,
  Loader2,
  Plus,
  X,
  Check,
  Upload,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import { useIsRealtor } from "@/lib/industry/use-industry";
import { RealtorListingsEmpty } from "@/components/empty-states/RealtorEmptyStates";
import { usePageContext } from "@/components/dante/PageContext";

// Augments the Window type so TypeScript stops complaining about the
// IPC bridge our Electron preload exposes. Web users see undefined.
declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      pickAndExtractPdfs: () => Promise<
        Array<{ name: string; text: string; size?: number; error?: string }>
      >;
    };
  }
}

interface IntakeProposed {
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  kind?: string | null;
  list_price_cents?: number | null;
  status?: string | null;
  notes?: string | null;
  citations?: Array<{ field: string; source: string }>;
  warnings?: string[];
}

interface PropertyRow {
  id: string;
  address_line1: string;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  kind: string | null;
  list_price_cents: number | null;
  status: string;
  listed_at: string | null;
  sold_at: string | null;
  updated_at: string;
}

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  pending: "Pending",
  sold: "Sold",
  withdrawn: "Withdrawn",
  off_market: "Off-market",
};

const STATUS_CHIP: Record<string, string> = {
  active:
    "text-[var(--verified)] bg-[var(--verified-soft)] border-[var(--verified)]/30",
  pending:
    "text-[var(--accent)] bg-[var(--accent-soft)] border-[var(--accent)]/30",
  sold:
    "text-[var(--ink-muted)] bg-[var(--canvas-subtle)] border-[var(--rule)]",
  withdrawn:
    "text-[var(--flag)] bg-[var(--flag-soft)] border-[var(--flag)]/30",
  off_market:
    "text-[var(--ink-subtle)] bg-[var(--canvas-subtle)] border-[var(--rule)]",
};

function formatDollars(cents: number | null): string {
  if (cents == null) return "—";
  return `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

export default function PropertiesClient() {
  const router = useRouter();
  const isRealtor = useIsRealtor();
  const [rows, setRows] = useState<PropertyRow[] | null>(null);

  usePageContext({
    title: "Properties",
    subtitle: rows ? `${rows.length} listing${rows.length === 1 ? "" : "s"}` : undefined,
  });
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState<{
    address_line1: string;
    city: string;
    state: string;
    zip: string;
    list_price: string;
    kind: string;
    description: string;
  }>({
    address_line1: "",
    city: "",
    state: "",
    zip: "",
    list_price: "",
    kind: "",
    description: "",
  });

  // Electron-only "Import from desktop" flow.
  const [isElectron, setIsElectron] = useState(false);
  const [importing, setImporting] = useState(false);
  const [intake, setIntake] = useState<{
    proposed: IntakeProposed;
    used_files: string[];
    skipped_files: Array<{ name: string; reason: string }>;
  } | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && window.electronAPI?.isElectron) {
      setIsElectron(true);
    }
  }, []);

  const importFromDesktop = async () => {
    if (!window.electronAPI?.pickAndExtractPdfs) return;
    setImporting(true);
    setError(null);
    try {
      const pdfs = await window.electronAPI.pickAndExtractPdfs();
      if (!pdfs || pdfs.length === 0) {
        setImporting(false);
        return; // user cancelled
      }
      const res = await fetch("/api/properties/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ pdfs }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Intake failed");
      }
      setIntake(await res.json());
    } catch (e: any) {
      setError(e.message || "Intake failed");
    } finally {
      setImporting(false);
    }
  };

  const confirmIntake = async () => {
    if (!intake) return;
    setCreating(true);
    setError(null);
    try {
      const p = intake.proposed;
      const res = await fetch("/api/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          address_line1: p.address_line1 || "(no address found)",
          address_line2: p.address_line2 || null,
          city: p.city || null,
          state: p.state || null,
          zip: p.zip || null,
          beds: typeof p.beds === "number" ? p.beds : null,
          baths: typeof p.baths === "number" ? p.baths : null,
          sqft: typeof p.sqft === "number" ? p.sqft : null,
          kind: p.kind || null,
          list_price_cents:
            typeof p.list_price_cents === "number" ? p.list_price_cents : null,
          status: p.status || "active",
          notes: p.notes || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Save failed");
      }
      const created = await res.json();
      setRows((prev) => (prev ? [created, ...prev] : [created]));
      setIntake(null);
      router.push(`/properties/${created.id}`);
    } catch (e: any) {
      setError(e.message || "Save failed");
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    fetch("/api/properties", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || "Failed to load");
        return r.json();
      })
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch((e) => setError(e.message));
  }, []);

  const submitCreate = async () => {
    if (!draft.address_line1.trim()) {
      setError("Address is required");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const list_price_cents = draft.list_price
        ? Math.round(parseFloat(draft.list_price) * 100)
        : null;
      const res = await fetch("/api/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          address_line1: draft.address_line1,
          city: draft.city || null,
          state: draft.state || null,
          zip: draft.zip || null,
          list_price_cents,
          status: "active",
          kind: draft.kind || null,
          description: draft.description.trim() || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error || "Failed to create");
      }
      const created = await res.json();
      setRows((prev) => (prev ? [created, ...prev] : [created]));
      setDraft({
        address_line1: "",
        city: "",
        state: "",
        zip: "",
        list_price: "",
        kind: "",
        description: "",
      });
      setShowCreate(false);
      router.push(`/properties/${created.id}`);
    } catch (e: any) {
      setError(e.message || "Failed to create");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      {/* Top bar */}
      <div className="sticky top-0 z-10 border-b border-[var(--rule)] bg-[var(--canvas)]/95 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 md:px-10 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm text-[var(--ink-muted)]">
            <Link href="/dashboard" className="hover:text-[var(--ink)] transition">
              Drift
            </Link>
            <span className="text-[var(--ink-subtle)]">/</span>
            <span className="text-[var(--ink)]">Properties</span>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
            Dashboard
          </Link>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 md:px-10 py-10">
        <div className="flex items-baseline justify-between mb-8">
          <div>
            <div className="label-section mb-1">Listings & properties</div>
            <h1 className="heading-display text-4xl text-[var(--ink)]">
              Properties
            </h1>
            <p className="text-sm text-[var(--ink-muted)] mt-1">
              {rows ? `${rows.length} in this workspace` : "Loading…"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isElectron && (
              <button
                onClick={importFromDesktop}
                disabled={importing}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-[4px] border border-[var(--rule)] hover:bg-[var(--canvas-subtle)] text-xs font-medium text-[var(--ink)] transition disabled:opacity-40"
                title="Pick PDFs from your computer; AI extracts the property record."
              >
                {importing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} />
                )}
                {importing ? "Reading PDFs…" : "Import from desktop"}
              </button>
            )}
            <button
              onClick={() => setShowCreate((v) => !v)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-sm font-semibold hover:opacity-90 transition"
            >
              {showCreate ? (
                <>
                  <X className="w-4 h-4" strokeWidth={1.5} /> Cancel
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" strokeWidth={1.5} /> New property
                </>
              )}
            </button>
          </div>
        </div>

        {/* Inline create */}
        {showCreate && (
          <section className="card-flat p-6 mb-8">
            <div className="label-section mb-3">New property</div>
            <div className="grid md:grid-cols-2 gap-3">
              <input
                value={draft.address_line1}
                onChange={(e) =>
                  setDraft({ ...draft, address_line1: e.target.value })
                }
                placeholder="Address (e.g. 123 Main St)"
                className="md:col-span-2 w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]"
              />
              <input
                value={draft.city}
                onChange={(e) => setDraft({ ...draft, city: e.target.value })}
                placeholder="City"
                className="w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  value={draft.state}
                  onChange={(e) => setDraft({ ...draft, state: e.target.value })}
                  placeholder="State"
                  className="w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]"
                />
                <input
                  value={draft.zip}
                  onChange={(e) => setDraft({ ...draft, zip: e.target.value })}
                  placeholder="ZIP"
                  className="w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]"
                />
              </div>
              <input
                value={draft.list_price}
                onChange={(e) =>
                  setDraft({ ...draft, list_price: e.target.value })
                }
                placeholder="List price (USD)"
                type="number"
                step="1000"
                className="w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]"
              />
              <select
                value={draft.kind}
                onChange={(e) => setDraft({ ...draft, kind: e.target.value })}
                className="w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]"
              >
                <option value="">Kind — pick one</option>
                <option value="residential">Residential</option>
                <option value="commercial">Commercial</option>
                <option value="rental">Rental (unlocks lease block)</option>
                <option value="land">Land</option>
                <option value="other">Other</option>
              </select>
              <textarea
                value={draft.description}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
                placeholder="Description — what's in the property: rooms, finishes, condition, recent renovations, neighbourhood notes…"
                rows={3}
                className="md:col-span-2 w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)] resize-y leading-relaxed"
              />
            </div>
            <div className="mt-4 flex items-center gap-3 flex-wrap">
              <button
                onClick={submitCreate}
                disabled={creating}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-sm font-semibold disabled:opacity-50"
              >
                {creating ? (
                  <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                ) : (
                  <Check className="w-4 h-4" strokeWidth={1.5} />
                )}
                {creating ? "Creating…" : "Create property"}
              </button>
              <span className="text-[11px] text-[var(--ink-subtle)] max-w-md">
                After you create, the detail page lets you add features, lease
                terms (when kind is Rental), the transaction-stage pipeline,
                attached documents (PDFs, photos, leases), and link clients
                — buyer, seller, tenant, etc.
              </span>
            </div>
          </section>
        )}

        {error && (
          <div className="mb-4 px-3 py-2 text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger)]/30 rounded-[4px]">
            {error}
          </div>
        )}

        {/* Table */}
        {rows === null ? (
          <div className="flex items-center justify-center py-24">
            <Loader2
              className="w-6 h-6 animate-spin text-[var(--ink-subtle)]"
              strokeWidth={1.5}
            />
          </div>
        ) : rows.length === 0 ? (
          isRealtor ? (
            <div className="card-flat">
              <RealtorListingsEmpty />
            </div>
          ) : (
            <div className="card-flat py-16 text-center">
              <Home
                className="w-8 h-8 text-[var(--ink-subtle)] mx-auto mb-3"
                strokeWidth={1.5}
              />
              <p className="text-sm text-[var(--ink-muted)] mb-4">
                No properties yet — add your first listing.
              </p>
              {!showCreate && (
                <button
                  onClick={() => setShowCreate(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-sm font-semibold hover:opacity-90 transition"
                >
                  <Plus className="w-4 h-4" strokeWidth={1.5} /> New property
                </button>
              )}
            </div>
          )
        ) : (
          <div className="card-flat overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--rule)] bg-[var(--canvas-subtle)]">
                  <tr>
                    <th className="label-section text-left py-4 px-6">Address</th>
                    <th className="label-section text-left py-4 px-4">Status</th>
                    <th className="label-section text-right py-4 px-4">Price</th>
                    <th className="label-section text-left py-4 px-4">Beds / Baths</th>
                    <th className="label-section text-right py-4 px-4">Sqft</th>
                    <th className="label-section text-left py-4 px-4">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr
                      key={p.id}
                      onClick={() => router.push(`/properties/${p.id}`)}
                      className="border-b border-[var(--rule)] hover:bg-[var(--canvas-subtle)] transition cursor-pointer"
                    >
                      <td className="py-4 px-6">
                        <div className="text-sm font-medium text-[var(--ink)]">
                          {p.address_line1}
                          {p.address_line2 ? `, ${p.address_line2}` : ""}
                        </div>
                        <div className="text-[11px] text-[var(--ink-subtle)]">
                          {[p.city, p.state, p.zip].filter(Boolean).join(", ") || "—"}
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                            STATUS_CHIP[p.status] ?? STATUS_CHIP.active
                          }`}
                        >
                          {STATUS_LABEL[p.status] ?? p.status}
                        </span>
                      </td>
                      <td className="py-4 px-4 mono text-right text-[var(--ink)]">
                        {formatDollars(p.list_price_cents)}
                      </td>
                      <td className="py-4 px-4 mono text-[var(--ink-muted)]">
                        {p.beds ?? "—"} / {p.baths ?? "—"}
                      </td>
                      <td className="py-4 px-4 mono text-right text-[var(--ink-muted)]">
                        {p.sqft ? p.sqft.toLocaleString() : "—"}
                      </td>
                      <td className="py-4 px-4 mono text-[var(--ink-subtle)] text-xs">
                        {new Date(p.updated_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Intake review modal */}
      {intake && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/30 backdrop-blur-sm px-4 py-8"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIntake(null);
          }}
        >
          <div className="bg-[var(--canvas)] border border-[var(--rule)] rounded-[6px] shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-[var(--rule)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[var(--accent)]" strokeWidth={1.5} />
                <h3 className="text-sm font-semibold text-[var(--ink)]">
                  Review extracted property
                </h3>
              </div>
              <button
                onClick={() => setIntake(null)}
                className="p-1.5 rounded-[4px] text-[var(--ink-muted)] hover:bg-[var(--canvas-subtle)] transition"
              >
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {intake.proposed.warnings && intake.proposed.warnings.length > 0 && (
                <div className="px-3 py-2 text-xs text-[var(--flag)] bg-[var(--flag-soft)] border border-[var(--flag)]/30 rounded-[4px] space-y-1">
                  {intake.proposed.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <AlertCircle
                        className="w-3.5 h-3.5 shrink-0 mt-0.5"
                        strokeWidth={1.5}
                      />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="text-[11px] text-[var(--ink-subtle)]">
                Read from: {intake.used_files.join(" · ") || "(no files)"}
                {intake.skipped_files.length > 0 && (
                  <>
                    <br />
                    Skipped: {intake.skipped_files.map((s) => `${s.name} (${s.reason})`).join(" · ")}
                  </>
                )}
              </div>
              {/* Field grid (read-only preview; user goes to detail page to edit) */}
              <div className="grid md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                {[
                  { key: "address_line1", label: "Address" },
                  { key: "address_line2", label: "Unit" },
                  { key: "city", label: "City" },
                  { key: "state", label: "State" },
                  { key: "zip", label: "ZIP" },
                  { key: "beds", label: "Beds" },
                  { key: "baths", label: "Baths" },
                  { key: "sqft", label: "Sqft" },
                  { key: "kind", label: "Kind" },
                  {
                    key: "list_price_cents",
                    label: "List price",
                    format: (v: any) =>
                      typeof v === "number" ? `$${(v / 100).toLocaleString()}` : "—",
                  },
                  { key: "status", label: "Status" },
                ].map((f) => {
                  const v = (intake.proposed as any)[f.key];
                  const display = f.format
                    ? f.format(v)
                    : v == null || v === ""
                    ? "—"
                    : String(v);
                  return (
                    <div key={f.key} className="flex items-baseline gap-3">
                      <span className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] min-w-[80px]">
                        {f.label}
                      </span>
                      <span
                        className={
                          v == null || v === ""
                            ? "text-[var(--ink-subtle)] italic"
                            : "text-[var(--ink)]"
                        }
                      >
                        {display}
                      </span>
                    </div>
                  );
                })}
              </div>
              {intake.proposed.notes && (
                <div>
                  <div className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] mb-1">
                    Notes
                  </div>
                  <p className="text-sm text-[var(--ink)]">
                    {intake.proposed.notes}
                  </p>
                </div>
              )}
              {intake.proposed.citations && intake.proposed.citations.length > 0 && (
                <div>
                  <div className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] mb-1">
                    Citations
                  </div>
                  <ul className="text-[11px] text-[var(--ink-muted)] space-y-1">
                    {intake.proposed.citations.map((c, i) => (
                      <li key={i}>
                        <span className="font-medium text-[var(--ink)]">{c.field}</span>
                        {" — "}
                        {c.source}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-[var(--rule)] flex items-center gap-3">
              <button
                onClick={confirmIntake}
                disabled={creating}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-sm font-semibold disabled:opacity-50"
              >
                {creating ? (
                  <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                ) : (
                  <Check className="w-4 h-4" strokeWidth={1.5} />
                )}
                {creating ? "Saving…" : "Save property"}
              </button>
              <span className="text-[11px] text-[var(--ink-subtle)]">
                You'll land on the detail page where you can tweak any field.
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
