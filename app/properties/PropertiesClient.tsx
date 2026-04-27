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
} from "lucide-react";

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
  const [rows, setRows] = useState<PropertyRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState({
    address_line1: "",
    city: "",
    state: "",
    zip: "",
    list_price: "",
  });

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
        }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error || "Failed to create");
      }
      const created = await res.json();
      setRows((prev) => (prev ? [created, ...prev] : [created]));
      setDraft({ address_line1: "", city: "", state: "", zip: "", list_price: "" });
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
                className="md:col-span-2 w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]"
              />
            </div>
            <div className="mt-4 flex items-center gap-3">
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
              <span className="text-[11px] text-[var(--ink-subtle)]">
                You can fill in beds, baths, sqft, and link clients on the
                detail page after creation.
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
    </div>
  );
}
