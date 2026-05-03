"use client";

// app/admin/compliance/ComplianceExportClient.tsx
//
// Date range picker + contact filter + Generate. Calls
// /api/admin/compliance/export and pops the JSON download.
//
// Enterprise-only — when hasFeature=false we render a tier-upgrade
// prompt with a deep link to /settings/billing instead of the form.

import { useState } from "react";
import Link from "next/link";
import { Download, Lock } from "lucide-react";

const SEVEN_YEARS_AGO = () =>
  new Date(Date.now() - 7 * 365 * 86400 * 1000).toISOString().slice(0, 10);

interface Props {
  hasFeature: boolean;
  currentTier: string;
  contacts: Array<{ id: string; name: string | null }>;
}

export default function ComplianceExportClient({ hasFeature, currentTier, contacts }: Props) {
  const [contactId, setContactId] = useState<string>("");
  const [fromDate, setFromDate] = useState<string>(SEVEN_YEARS_AGO());
  const [toDate, setToDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setError(null);
    setBusy(true);
    try {
      const body = {
        contact_id: contactId || undefined,
        from_date: new Date(fromDate).toISOString(),
        to_date: new Date(toDate).toISOString(),
      };
      const res = await fetch("/api/admin/compliance/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setError(err.error ?? `request_failed_${res.status}`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-pack-${contactId ? "contact" : "workspace"}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  };

  if (!hasFeature) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="rounded-[6px] border border-[var(--rule)] bg-[var(--canvas-subtle)] p-8 text-center">
          <Lock className="w-6 h-6 mx-auto mb-3 text-[var(--ink-muted)]" strokeWidth={1.5} />
          <h2 className="font-display text-xl text-[var(--ink)] mb-2">
            Compliance export is an Enterprise feature
          </h2>
          <p className="text-sm text-[var(--ink-muted)] mb-5">
            Generate examiner-ready audit packs for any contact or your full workspace, scoped to a
            date range. Currently on the <span className="font-medium">{currentTier}</span> plan.
          </p>
          <Link
            href="/settings/billing"
            className="inline-block px-4 py-2 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-sm font-semibold hover:opacity-90 transition"
          >
            View Enterprise plan
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 md:px-8 py-10">
      <h1 className="font-display text-3xl text-[var(--ink)] mb-2">Compliance audit pack</h1>
      <p className="text-sm text-[var(--ink-muted)] mb-8 leading-relaxed">
        Generates a JSON bundle of every memory, chat message, conversation, document, agent
        output, and audit-log entry within the date range. Scope to a single contact or leave
        blank for a workspace-wide pack.
      </p>

      <div className="space-y-5">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)] mb-2">
            Contact (optional)
          </label>
          <select
            value={contactId}
            onChange={(e) => setContactId(e.target.value)}
            className="w-full px-3 py-2 rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] text-sm"
          >
            <option value="">— Workspace-wide —</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name ?? c.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)] mb-2">
              From
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full px-3 py-2 rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)] mb-2">
              To
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full px-3 py-2 rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] text-sm"
            />
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-[4px] border border-amber-300 bg-amber-50 text-amber-800 text-sm">
            {error}
          </div>
        )}

        <button
          onClick={generate}
          disabled={busy}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
        >
          <Download className="w-4 h-4" strokeWidth={1.5} />
          {busy ? "Generating…" : "Generate audit pack"}
        </button>

        <p className="text-xs text-[var(--ink-subtle)] mt-2 leading-relaxed">
          The export itself is recorded in your audit log. Downloads in JSON; convert to PDF
          via the print viewer if your examiner requires it.
        </p>
      </div>
    </div>
  );
}
