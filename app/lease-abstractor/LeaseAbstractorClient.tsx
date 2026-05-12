"use client";

// LeaseAbstractorClient — two-panel lease abstraction UI.
// Left: vault document picker + extraction history.
// Right: structured field table + context analysis.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  FileText,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Search,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Clock,
  Zap,
  ArrowLeft,
} from "lucide-react";
import { usePageContext } from "@/components/dante/PageContext";

interface VaultItem {
  id: string;
  title: string;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
}

interface LeaseField {
  name: string;
  category: "deal_terms" | "financial_terms" | "key_clauses";
  value: string | null;
  citation?: string;
  page?: number | null;
  confidence: "high" | "medium" | "low" | "not_found";
}

interface ContextAnalysis {
  tenant_favorable_assessment: string;
  key_risks: string[];
  unusual_clauses: string[];
}

interface AbstractSummary {
  id: string;
  vault_item_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  extraction_seconds: number | null;
  created_at: string;
}

interface AbstractDetail extends AbstractSummary {
  fields: LeaseField[];
  context_analysis: ContextAnalysis | null;
  error_message: string | null;
  model: string;
  input_tokens: number;
  output_tokens: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  deal_terms: "Deal Terms",
  financial_terms: "Financial Terms",
  key_clauses: "Key Clauses",
};

const CONFIDENCE_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  high: { bg: "bg-emerald-50", text: "text-emerald-700", label: "High" },
  medium: { bg: "bg-amber-50", text: "text-amber-700", label: "Medium" },
  low: { bg: "bg-orange-50", text: "text-orange-700", label: "Low" },
  not_found: { bg: "bg-neutral-100", text: "text-neutral-500", label: "Not found" },
};

function formatSize(bytes: number | null) {
  if (!bytes) return "--";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function LeaseAbstractorClient() {
  usePageContext({ title: "Lease Abstractor", subtitle: "Extract structured data from commercial leases" });

  const [vaultItems, setVaultItems] = useState<VaultItem[]>([]);
  const [abstracts, setAbstracts] = useState<AbstractSummary[]>([]);
  const [selectedAbstract, setSelectedAbstract] = useState<AbstractDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(["deal_terms", "financial_terms", "key_clauses"]),
  );
  const [copied, setCopied] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [itemsRes, abstractsRes] = await Promise.all([
        fetch("/api/vault?kind=document", { credentials: "include" }),
        fetch("/api/lease-abstractor", { credentials: "include" }),
      ]);
      if (!itemsRes.ok) throw new Error("Failed to load vault items");
      if (!abstractsRes.ok) throw new Error("Failed to load abstracts");
      setVaultItems(await itemsRes.json());
      setAbstracts(await abstractsRes.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredItems = useMemo(() => {
    if (!search.trim()) return vaultItems;
    const q = search.toLowerCase();
    return vaultItems.filter((i) => i.title.toLowerCase().includes(q));
  }, [vaultItems, search]);

  const abstractsByItem = useMemo(() => {
    const map = new Map<string, AbstractSummary[]>();
    for (const a of abstracts) {
      const arr = map.get(a.vault_item_id) || [];
      arr.push(a);
      map.set(a.vault_item_id, arr);
    }
    return map;
  }, [abstracts]);

  const runExtraction = async (vaultItemId: string) => {
    setExtracting(true);
    setError(null);
    try {
      const res = await fetch("/api/lease-abstractor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ vault_item_id: vaultItemId }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Extraction failed");
      setSelectedAbstract(result);
      await loadData();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setExtracting(false);
    }
  };

  const loadAbstract = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/lease-abstractor?id=${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load abstract");
      setSelectedAbstract(await res.json());
    } catch (e: any) {
      setError(e.message);
    }
  };

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const exportCSV = () => {
    if (!selectedAbstract?.fields.length) return;
    const rows = [["Field", "Category", "Value", "Citation", "Page", "Confidence"]];
    for (const f of selectedAbstract.fields) {
      rows.push([
        f.name,
        f.category,
        f.value ?? "",
        f.citation ?? "",
        f.page != null ? String(f.page) : "",
        f.confidence,
      ]);
    }
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lease-abstract-${selectedAbstract.id.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyJSON = async () => {
    if (!selectedAbstract) return;
    await navigator.clipboard.writeText(JSON.stringify(selectedAbstract, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const fieldsByCategory = useMemo(() => {
    if (!selectedAbstract) return {};
    const map: Record<string, LeaseField[]> = {};
    for (const f of selectedAbstract.fields) {
      (map[f.category] ??= []).push(f);
    }
    return map;
  }, [selectedAbstract]);

  // ── Left panel: document list ──
  const renderLeftPanel = () => (
    <div className="w-full lg:w-[380px] shrink-0 border-r border-[var(--rule)] flex flex-col h-full overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--rule)]">
        <h2 className="text-sm font-semibold text-[var(--ink)]">Vault Documents</h2>
        <div className="mt-2 relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--ink-muted)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter documents..."
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] text-[var(--ink)] placeholder:text-[var(--ink-muted)]"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-[var(--ink-muted)]">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            <span className="text-sm">Loading...</span>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-[var(--ink-muted)]">
            {vaultItems.length === 0
              ? "No documents in vault. Upload a lease to get started."
              : "No documents match your search."}
          </div>
        ) : (
          filteredItems.map((item) => {
            const itemAbstracts = abstractsByItem.get(item.id) || [];
            const latest = itemAbstracts[0];
            return (
              <div key={item.id} className="border-b border-[var(--rule)]">
                <div className="px-4 py-3">
                  <div className="flex items-start gap-2.5">
                    <FileText
                      className="w-4 h-4 mt-0.5 shrink-0"
                      style={{
                        color: item.file_type?.includes("pdf") ? "#D93025" : "var(--ink-muted)",
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--ink)] truncate">{item.title}</p>
                      <p className="text-xs text-[var(--ink-muted)] mt-0.5">
                        {formatSize(item.file_size)} -- {formatDate(item.created_at)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={() => runExtraction(item.id)}
                      disabled={extracting}
                      className="text-xs px-2.5 py-1 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {extracting ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Zap className="w-3 h-3" />
                      )}
                      {extracting ? "Extracting..." : "Extract"}
                    </button>

                    {latest && (
                      <button
                        onClick={() => loadAbstract(latest.id)}
                        className="text-xs px-2.5 py-1 rounded-[4px] border border-[var(--rule)] text-[var(--ink)] hover:bg-[var(--canvas-subtle)] flex items-center gap-1.5"
                      >
                        {latest.status === "completed" ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        ) : latest.status === "failed" ? (
                          <AlertCircle className="w-3 h-3 text-red-500" />
                        ) : (
                          <Clock className="w-3 h-3" />
                        )}
                        View latest
                      </button>
                    )}
                  </div>

                  {itemAbstracts.length > 1 && (
                    <div className="mt-1.5 ml-6">
                      {itemAbstracts.slice(1).map((a) => (
                        <button
                          key={a.id}
                          onClick={() => loadAbstract(a.id)}
                          className="block text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] py-0.5"
                        >
                          {formatDate(a.created_at)} --{" "}
                          {a.extraction_seconds != null ? `${a.extraction_seconds.toFixed(1)}s` : ""}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  // ── Right panel: abstract detail ──
  const renderRightPanel = () => {
    if (!selectedAbstract) {
      return (
        <div className="flex-1 flex items-center justify-center text-[var(--ink-muted)]">
          <div className="text-center">
            <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Select a document and run extraction,</p>
            <p className="text-sm">or view a previous abstract.</p>
          </div>
        </div>
      );
    }

    if (selectedAbstract.status === "failed") {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md px-6">
            <AlertCircle className="w-8 h-8 mx-auto mb-3 text-red-500" />
            <p className="text-sm font-medium text-[var(--ink)]">Extraction failed</p>
            <p className="text-sm text-[var(--ink-muted)] mt-1">
              {selectedAbstract.error_message || "Unknown error"}
            </p>
          </div>
        </div>
      );
    }

    if (selectedAbstract.status !== "completed") {
      return (
        <div className="flex-1 flex items-center justify-center text-[var(--ink-muted)]">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          <span className="text-sm">Processing...</span>
        </div>
      );
    }

    const ca = selectedAbstract.context_analysis;

    return (
      <div className="flex-1 overflow-y-auto">
        {/* Header bar */}
        <div className="sticky top-0 z-10 bg-[var(--canvas)] border-b border-[var(--rule)] px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedAbstract(null)}
              className="lg:hidden p-1 rounded hover:bg-[var(--canvas-subtle)]"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h2 className="text-sm font-semibold text-[var(--ink)]">
                Lease Abstract
              </h2>
              <p className="text-xs text-[var(--ink-muted)]">
                {selectedAbstract.fields.length} fields --{" "}
                {selectedAbstract.extraction_seconds?.toFixed(1)}s --{" "}
                {selectedAbstract.model}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={copyJSON}
              className="text-xs px-2.5 py-1 rounded-[4px] border border-[var(--rule)] text-[var(--ink)] hover:bg-[var(--canvas-subtle)] flex items-center gap-1.5"
            >
              <Copy className="w-3 h-3" />
              {copied ? "Copied" : "JSON"}
            </button>
            <button
              onClick={exportCSV}
              className="text-xs px-2.5 py-1 rounded-[4px] border border-[var(--rule)] text-[var(--ink)] hover:bg-[var(--canvas-subtle)] flex items-center gap-1.5"
            >
              <Download className="w-3 h-3" />
              CSV
            </button>
          </div>
        </div>

        {/* Field table by category */}
        <div className="px-5 py-4">
          {(["deal_terms", "financial_terms", "key_clauses"] as const).map((cat) => {
            const fields = fieldsByCategory[cat] || [];
            if (fields.length === 0) return null;
            const expanded = expandedCategories.has(cat);
            return (
              <div key={cat} className="mb-4">
                <button
                  onClick={() => toggleCategory(cat)}
                  className="flex items-center gap-1.5 mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)] hover:text-[var(--ink)]"
                >
                  {expanded ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" />
                  )}
                  {CATEGORY_LABELS[cat]} ({fields.length})
                </button>

                {expanded && (
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--rule)]">
                        <th className="text-left py-1.5 pr-3 text-xs font-medium text-[var(--ink-muted)] w-[180px]">
                          Field
                        </th>
                        <th className="text-left py-1.5 pr-3 text-xs font-medium text-[var(--ink-muted)]">
                          Value
                        </th>
                        <th className="text-left py-1.5 pr-3 text-xs font-medium text-[var(--ink-muted)] w-[140px]">
                          Citation
                        </th>
                        <th className="text-left py-1.5 text-xs font-medium text-[var(--ink-muted)] w-[70px]">
                          Conf.
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {fields.map((f, i) => {
                        const conf = CONFIDENCE_STYLE[f.confidence] || CONFIDENCE_STYLE.low;
                        return (
                          <tr
                            key={`${f.name}-${i}`}
                            className="border-b border-[var(--rule)] last:border-b-0"
                          >
                            <td className="py-2 pr-3 text-[var(--ink-muted)] align-top whitespace-nowrap">
                              {f.name}
                            </td>
                            <td className="py-2 pr-3 text-[var(--ink)] align-top">
                              {f.value || (
                                <span className="text-[var(--ink-muted)] italic">--</span>
                              )}
                            </td>
                            <td className="py-2 pr-3 text-xs text-[var(--ink-muted)] align-top">
                              {f.citation || "--"}
                              {f.page != null && (
                                <span className="ml-1 text-[var(--ink-muted)]">p.{f.page}</span>
                              )}
                            </td>
                            <td className="py-2 align-top">
                              <span
                                className={`inline-block text-xs px-1.5 py-0.5 rounded ${conf.bg} ${conf.text}`}
                              >
                                {conf.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>

        {/* Context analysis */}
        {ca && (
          <div className="px-5 pb-6">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)] mb-3">
              Context Analysis
            </h3>

            <div className="space-y-3">
              <div className="p-3 rounded-[4px] border border-[var(--rule)] bg-[var(--canvas-subtle)]">
                <p className="text-xs font-medium text-[var(--ink-muted)] mb-1">
                  Tenant Favorability Assessment
                </p>
                <p className="text-sm text-[var(--ink)]">{ca.tenant_favorable_assessment}</p>
              </div>

              {ca.key_risks.length > 0 && (
                <div className="p-3 rounded-[4px] border border-[var(--rule)]">
                  <p className="text-xs font-medium text-[var(--ink-muted)] mb-1.5">Key Risks</p>
                  <ul className="space-y-1">
                    {ca.key_risks.map((r, i) => (
                      <li key={i} className="text-sm text-[var(--ink)] flex items-start gap-2">
                        <span className="text-[var(--ink-muted)] shrink-0 mt-0.5">-</span>
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {ca.unusual_clauses.length > 0 && (
                <div className="p-3 rounded-[4px] border border-[var(--rule)]">
                  <p className="text-xs font-medium text-[var(--ink-muted)] mb-1.5">
                    Unusual Clauses
                  </p>
                  <ul className="space-y-1">
                    {ca.unusual_clauses.map((c, i) => (
                      <li key={i} className="text-sm text-[var(--ink)] flex items-start gap-2">
                        <span className="text-[var(--ink-muted)] shrink-0 mt-0.5">-</span>
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Token usage footer */}
            <div className="mt-4 pt-3 border-t border-[var(--rule)] flex items-center gap-4 text-xs text-[var(--ink-muted)]">
              <span>Input: {selectedAbstract.input_tokens.toLocaleString()} tokens</span>
              <span>Output: {selectedAbstract.output_tokens.toLocaleString()} tokens</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col">
      {error && (
        <div className="mx-4 mt-3 px-3 py-2 rounded-[4px] bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* On mobile, show list or detail based on selection */}
        <div className={`${selectedAbstract ? "hidden lg:flex" : "flex"} w-full lg:w-auto`}>
          {renderLeftPanel()}
        </div>
        <div className={`${selectedAbstract ? "flex" : "hidden lg:flex"} flex-1`}>
          {renderRightPanel()}
        </div>
      </div>
    </div>
  );
}
