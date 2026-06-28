"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Plus, Trash2, Send, ExternalLink, Check, X, Ban, FileText, Eye } from "lucide-react";
import { reportError } from "@/lib/report-error";

interface InvoiceSummary {
  id: string;
  number: string | null;
  company: string;
  email: string | null;
  status: string;
  total: number;
  currency: string;
  created: number;
  due_date: number | null;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
}

interface InvoiceDetail extends InvoiceSummary {
  memo: string | null;
  payment_method_types: string[];
  lines: Array<{ description: string; quantity: number | null; amount: number }>;
}

interface LineItem {
  description: string;
  quantity: number;
  unit_amount: string; // dollars, as text for the input
}

const STATUS_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: "Draft", color: "var(--ink-muted)", bg: "var(--canvas-subtle)" },
  open: { label: "Sent · awaiting payment", color: "var(--flag)", bg: "var(--flag-soft)" },
  paid: { label: "Paid", color: "var(--verified)", bg: "var(--verified-soft)" },
  void: { label: "Void", color: "var(--ink-subtle)", bg: "var(--canvas-subtle)" },
  uncollectible: { label: "Uncollectible", color: "var(--danger)", bg: "var(--danger-soft)" },
};

// Field styling WITHOUT a width, so line-item rows can set their own widths
// (flex-1 / w-16) without colliding with w-full.
const baseField =
  "px-3 py-2 rounded-[4px] bg-[var(--canvas)] border border-[var(--rule)] text-[var(--ink)] text-sm placeholder:text-[var(--ink-subtle)] focus:outline-none focus:border-[var(--accent)] transition";
const inputClass = "w-full " + baseField;

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [preview, setPreview] = useState<InvoiceDetail | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Form state
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [dueDays, setDueDays] = useState(30);
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState<LineItem[]>([{ description: "", quantity: 1, unit_amount: "" }]);

  const loadInvoices = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/invoices", { credentials: "include" });
      const data = await res.json();
      if (!res.ok) { setLoadError(data.error || "Failed to load invoices"); return; }
      setInvoices(data.invoices);
      setLoadError(null);
    } catch (e) {
      reportError("admin/invoices: load")(e);
      setLoadError("Network error loading invoices");
    }
  }, []);

  const openPreview = useCallback(async (id: string) => {
    setPreviewLoading(true);
    setPreview(null);
    try {
      const res = await fetch(`/api/admin/invoices/${id}`, { credentials: "include" });
      const data = await res.json();
      if (res.ok) setPreview(data.invoice);
      else setToast({ type: "error", message: data.error || "Failed to load preview" });
    } catch {
      setToast({ type: "error", message: "Network error" });
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  useEffect(() => { loadInvoices(); }, [loadInvoices]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const total = lines.reduce((s, l) => s + (Number(l.unit_amount) || 0) * (l.quantity || 1), 0);

  const updateLine = (i: number, patch: Partial<LineItem>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines((ls) => [...ls, { description: "", quantity: 1, unit_amount: "" }]);
  const removeLine = (i: number) => setLines((ls) => (ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls));

  const createDraft = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/admin/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          company_name: company,
          email,
          due_days: dueDays,
          memo: memo || undefined,
          line_items: lines.map((l) => ({
            description: l.description,
            quantity: l.quantity,
            unit_amount: Number(l.unit_amount) || 0,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setToast({ type: "error", message: data.error || "Failed to create" }); return; }
      setToast({ type: "success", message: `Draft created for ${company}` });
      setCompany(""); setEmail(""); setMemo(""); setDueDays(30);
      setLines([{ description: "", quantity: 1, unit_amount: "" }]);
      await loadInvoices();
      if (data.invoice?.id) openPreview(data.invoice.id);
    } catch {
      setToast({ type: "error", message: "Network error" });
    } finally {
      setCreating(false);
    }
  };

  const sendInvoice = async (id: string, company: string) => {
    if (!confirm(`Finalize and email this invoice to ${company}? This cannot be undone.`)) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/invoices/${id}/send`, { method: "POST", credentials: "include" });
      const data = await res.json();
      if (!res.ok) { setToast({ type: "error", message: data.error || "Failed to send" }); return; }
      setToast({ type: "success", message: `Invoice sent to ${company}` });
      await loadInvoices();
    } catch {
      setToast({ type: "error", message: "Network error" });
    } finally {
      setBusyId(null);
    }
  };

  const voidInvoice = async (id: string, status: string) => {
    const verb = status === "draft" ? "delete this draft" : "void this invoice";
    if (!confirm(`Are you sure you want to ${verb}?`)) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/invoices/${id}/void`, { method: "POST", credentials: "include" });
      const data = await res.json();
      if (!res.ok) { setToast({ type: "error", message: data.error || "Failed" }); return; }
      setToast({ type: "success", message: status === "draft" ? "Draft deleted" : "Invoice voided" });
      await loadInvoices();
    } catch {
      setToast({ type: "error", message: "Network error" });
    } finally {
      setBusyId(null);
    }
  };

  const fmtMoney = (n: number, cur: string) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: cur || "USD" }).format(n);
  const fmtDate = (unix: number | null) =>
    unix ? new Date(unix * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

  const canCreate =
    company.trim() &&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) &&
    lines.some((l) => l.description.trim() && Number(l.unit_amount) > 0);

  return (
    <div className="px-8 py-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <div className="label-section mb-2">Admin</div>
        <h1 className="heading-display text-4xl text-[var(--ink)] mb-1">Invoices</h1>
        <p className="text-[var(--ink-muted)] text-sm">
          Create an invoice for a company and send it via Stripe. They pay by card or ACH bank
          transfer; funds pay out to your connected bank account. Drafts aren&apos;t emailed until you send them.
        </p>
      </div>

      {/* New invoice */}
      <div className="card-flat p-5 mb-8">
        <div className="label-section mb-4">New invoice</div>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-[11px] text-[var(--ink-subtle)] mb-1 block">Company name</label>
            <input className={inputClass} value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Realty LLC" />
          </div>
          <div>
            <label className="text-[11px] text-[var(--ink-subtle)] mb-1 block">Billing email</label>
            <input className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ap@acme.com" />
          </div>
        </div>

        {/* Line items */}
        <label className="text-[11px] text-[var(--ink-subtle)] mb-1.5 block">Line items</label>
        <div className="space-y-2 mb-3">
          {lines.map((l, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                className={baseField + " flex-1 min-w-0"}
                value={l.description}
                onChange={(e) => updateLine(i, { description: e.target.value })}
                placeholder="Description (e.g. Drift platform — June 2026)"
              />
              <input
                className={baseField + " w-16 text-center shrink-0"}
                type="number" min={1}
                value={l.quantity}
                onChange={(e) => updateLine(i, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                title="Quantity"
              />
              <div className="relative w-32 shrink-0">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-subtle)] text-sm">$</span>
                <input
                  className={baseField + " w-full pl-6"}
                  type="number" min={0} step="0.01"
                  value={l.unit_amount}
                  onChange={(e) => updateLine(i, { unit_amount: e.target.value })}
                  placeholder="0.00"
                  title="Unit price"
                />
              </div>
              <button
                onClick={() => removeLine(i)}
                disabled={lines.length === 1}
                className="p-2 text-[var(--ink-subtle)] hover:text-[var(--danger)] disabled:opacity-30 disabled:cursor-not-allowed"
                title="Remove line"
              >
                <Trash2 className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>
          ))}
        </div>
        <button onClick={addLine} className="flex items-center gap-1.5 text-xs text-[var(--accent)] hover:opacity-80 mb-4">
          <Plus className="h-3.5 w-3.5" strokeWidth={1.5} /> Add line
        </button>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-[11px] text-[var(--ink-subtle)] mb-1 block">Payment terms (days until due)</label>
            <input className={inputClass} type="number" min={0} value={dueDays} onChange={(e) => setDueDays(Math.max(0, Number(e.target.value) || 0))} />
          </div>
          <div>
            <label className="text-[11px] text-[var(--ink-subtle)] mb-1 block">Memo (optional, shown on invoice)</label>
            <input className={inputClass} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Thank you for your business" />
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-[var(--rule)] pt-4">
          <div className="text-sm text-[var(--ink-muted)]">
            Total: <span className="font-semibold text-[var(--ink)]">{fmtMoney(total, "USD")}</span>
          </div>
          <button
            onClick={createDraft}
            disabled={!canCreate || creating}
            className="py-2 px-5 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-sm font-medium hover:opacity-90 transition disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} /> : <FileText className="h-4 w-4" strokeWidth={1.5} />}
            Create draft
          </button>
        </div>
        {!canCreate && (
          <p className="text-[11px] text-[var(--ink-subtle)] mt-2 text-right">
            {!company.trim()
              ? "Enter a company name to continue."
              : !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())
                ? "Enter a valid billing email."
                : "Add a description and an amount over $0 to at least one line."}
          </p>
        )}
      </div>

      {/* Invoice list */}
      <div className="label-section mb-3">Recent invoices</div>
      {loadError ? (
        <div className="card-flat p-4 text-sm" style={{ color: "var(--danger)", background: "var(--danger-soft)", borderColor: "var(--danger)" }}>
          {loadError}
        </div>
      ) : invoices === null ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-[var(--ink-subtle)]" strokeWidth={1.5} />
        </div>
      ) : invoices.length === 0 ? (
        <div className="card-flat p-6 text-center text-sm text-[var(--ink-muted)]">No invoices yet.</div>
      ) : (
        <div className="card-flat divide-y divide-[var(--rule)]">
          {invoices.map((inv) => {
            const s = STATUS_STYLE[inv.status] || STATUS_STYLE.draft;
            return (
              <div key={inv.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[var(--ink)] truncate">{inv.company}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-[3px]" style={{ color: s.color, background: s.bg }}>{s.label}</span>
                  </div>
                  <div className="text-[11px] text-[var(--ink-subtle)] mono mt-0.5">
                    {inv.number || "draft"} · {inv.email || "no email"} · due {fmtDate(inv.due_date)}
                  </div>
                </div>
                <div className="text-sm font-semibold text-[var(--ink)] tabular-nums shrink-0">
                  {fmtMoney(inv.total, inv.currency)}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openPreview(inv.id)} title="Preview"
                    className="p-2 text-[var(--ink-muted)] hover:text-[var(--ink)] rounded-[4px] hover:bg-[var(--canvas-subtle)]">
                    <Eye className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                  {inv.hosted_invoice_url && (
                    <a href={inv.hosted_invoice_url} target="_blank" rel="noopener noreferrer" title="View hosted invoice"
                      className="p-2 text-[var(--ink-muted)] hover:text-[var(--ink)] rounded-[4px] hover:bg-[var(--canvas-subtle)]">
                      <ExternalLink className="h-4 w-4" strokeWidth={1.5} />
                    </a>
                  )}
                  {inv.status === "draft" && (
                    <button onClick={() => sendInvoice(inv.id, inv.company)} disabled={busyId === inv.id} title="Finalize & send"
                      className="p-2 text-[var(--accent)] hover:opacity-80 rounded-[4px] hover:bg-[var(--canvas-subtle)] disabled:opacity-40">
                      {busyId === inv.id ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} /> : <Send className="h-4 w-4" strokeWidth={1.5} />}
                    </button>
                  )}
                  {(inv.status === "draft" || inv.status === "open") && (
                    <button onClick={() => voidInvoice(inv.id, inv.status)} disabled={busyId === inv.id} title={inv.status === "draft" ? "Delete draft" : "Void invoice"}
                      className="p-2 text-[var(--ink-muted)] hover:text-[var(--danger)] rounded-[4px] hover:bg-[var(--danger-soft)] disabled:opacity-40">
                      <Ban className="h-4 w-4" strokeWidth={1.5} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(preview || previewLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(20,20,24,.28)", backdropFilter: "blur(3px)" }} onMouseDown={() => setPreview(null)}>
          <div className="card-flat w-full max-w-lg mx-4 max-h-[88vh] overflow-y-auto" style={{ background: "var(--surface,#fff)" }} onMouseDown={(e) => e.stopPropagation()}>
            {previewLoading || !preview ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-[var(--ink-subtle)]" strokeWidth={1.5} /></div>
            ) : (
              <>
                <div className="flex items-center gap-2 px-5 py-3 border-b border-[var(--rule)]">
                  <div className="label-section flex-1">Invoice preview</div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-[3px]" style={{ color: (STATUS_STYLE[preview.status] || STATUS_STYLE.draft).color, background: (STATUS_STYLE[preview.status] || STATUS_STYLE.draft).bg }}>
                    {(STATUS_STYLE[preview.status] || STATUS_STYLE.draft).label}
                  </span>
                  <button onClick={() => setPreview(null)} className="p-1.5 text-[var(--ink-muted)] hover:text-[var(--ink)] rounded-[4px]"><X className="h-4 w-4" strokeWidth={1.5} /></button>
                </div>
                <div className="px-5 py-4 space-y-4">
                  <div>
                    <div className="label-section mb-1">Bill to</div>
                    <div className="text-sm text-[var(--ink)]">{preview.company}</div>
                    <div className="text-[11px] text-[var(--ink-muted)]">{preview.email || "—"}</div>
                  </div>
                  <div>
                    <div className="label-section mb-2">Line items</div>
                    <div className="border border-[var(--rule)] rounded-[6px] overflow-hidden">
                      {preview.lines.length === 0 ? (
                        <div className="px-3 py-3 text-[11px] text-[var(--ink-muted)] text-center">No line items.</div>
                      ) : (
                        preview.lines.map((l, i) => (
                          <div key={i} className="flex items-center gap-2 px-3 py-2 border-b border-[var(--rule)] last:border-b-0">
                            <span className="text-[13px] text-[var(--ink)] flex-1 min-w-0">{l.description}</span>
                            {l.quantity != null && <span className="text-[11px] text-[var(--ink-subtle)] shrink-0">x{l.quantity}</span>}
                            <span className="text-[13px] text-[var(--ink)] tabular-nums shrink-0">{fmtMoney(l.amount, preview.currency)}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t border-[var(--rule)] pt-3">
                    <span className="text-sm font-medium text-[var(--ink-muted)]">Total</span>
                    <span className="text-base font-semibold text-[var(--ink)] tabular-nums">{fmtMoney(preview.total, preview.currency)}</span>
                  </div>
                  {preview.memo && (
                    <div><div className="label-section mb-1">Memo</div><div className="text-[12px] text-[var(--ink-muted)]">{preview.memo}</div></div>
                  )}
                  <div className="text-[11px] text-[var(--ink-subtle)]">
                    Due {fmtDate(preview.due_date)} · Pays by {preview.payment_method_types.map((t) => t === "us_bank_account" ? "ACH bank transfer" : t === "card" ? "card" : t).join(", ") || "card"}
                  </div>
                  {preview.status === "draft" && (
                    <div className="text-[11px] px-3 py-2 rounded-[4px]" style={{ background: "var(--flag-soft)", color: "var(--flag)" }}>
                      This is a draft — it has not been emailed. Review, then send.
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--rule)]">
                  {preview.hosted_invoice_url && (
                    <a href={preview.hosted_invoice_url} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--accent)] hover:opacity-80 flex items-center gap-1 mr-auto">
                      <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.5} /> Hosted invoice
                    </a>
                  )}
                  <button onClick={() => setPreview(null)} className="px-4 py-2 rounded-[4px] text-sm text-[var(--ink-muted)] hover:bg-[var(--canvas-subtle)]">Close</button>
                  {preview.status === "draft" && (
                    <button onClick={() => { const p = preview; setPreview(null); sendInvoice(p.id, p.company); }} disabled={busyId === preview.id}
                      className="px-4 py-2 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-sm font-medium hover:opacity-90 flex items-center gap-2 disabled:opacity-40">
                      <Send className="h-4 w-4" strokeWidth={1.5} /> Send invoice
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50">
          <div className="card-flat flex items-center gap-2 px-4 py-3 rounded-[4px] text-sm font-medium"
            style={{
              background: toast.type === "success" ? "var(--verified-soft)" : "var(--danger-soft)",
              borderColor: toast.type === "success" ? "var(--verified)" : "var(--danger)",
              color: toast.type === "success" ? "var(--verified)" : "var(--danger)",
            }}>
            {toast.type === "success" ? <Check className="h-4 w-4" strokeWidth={1.5} /> : <X className="h-4 w-4" strokeWidth={1.5} />}
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}
