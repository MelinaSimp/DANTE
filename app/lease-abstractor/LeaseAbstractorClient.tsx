"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  FileText,
  FileSearch,
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
  Upload,
  Pencil,
  Check,
  X,
  AlertTriangle,
  Settings2,
  Sparkles,
  Globe,
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
  anchor_leverage?: string;
  cross_reference_issues: string[];
  market_context?: string;
}

interface AbstractSummary {
  id: string;
  vault_item_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  tenant_name?: string | null;
  expiration_date?: string | null;
  property_id?: string | null;
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

interface PropertyOption {
  id: string;
  name: string;
  address?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  deal_terms: "Deal Terms",
  financial_terms: "Financial Terms",
  key_clauses: "Key Clauses",
};

const CONFIDENCE_STYLE: Record<string, { cls: string; label: string }> = {
  high: { cls: "text-[var(--verified)] bg-[var(--verified-soft)] border-[var(--verified)]/30", label: "High" },
  medium: { cls: "text-[var(--flag)] bg-[var(--flag-soft)] border-[var(--flag)]/30", label: "Medium" },
  low: { cls: "text-[var(--danger)] bg-[var(--danger-soft)] border-[var(--danger)]/30", label: "Low" },
  not_found: { cls: "text-[var(--ink-muted)] bg-[var(--canvas-subtle)] border-[var(--rule)]", label: "Not found" },
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

function renderCitedValue(value: string | null, onCitationClick: (page: number) => void) {
  if (!value) return <span className="text-[var(--ink-subtle)] italic">--</span>;
  const parts = value.split(/(\[v\d+\])/g);
  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/^\[v(\d+)\]$/);
        if (m) {
          const page = parseInt(m[1], 10);
          return (
            <button
              key={i}
              onClick={() => onCitationClick(page)}
              className="chip-citation mx-0.5 cursor-pointer hover:opacity-80"
              title={`Jump to page ${page}`}
            >
              p.{page}
            </button>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

const inputClass =
  "w-full rounded-[var(--r-input)] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none focus:border-[var(--rule-strong)]";

export default function LeaseAbstractorClient() {
  usePageContext({ title: "Lease Abstractor", subtitle: "Extract structured data from commercial leases" });

  const [vaultItems, setVaultItems] = useState<VaultItem[]>([]);
  const [abstracts, setAbstracts] = useState<AbstractSummary[]>([]);
  const [selectedAbstract, setSelectedAbstract] = useState<AbstractDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(["deal_terms", "financial_terms", "key_clauses"]),
  );
  const [copied, setCopied] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [refinePrompt, setRefinePrompt] = useState(false);
  const [webSearch, setWebSearch] = useState(false);
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [linkingProperty, setLinkingProperty] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [itemsRes, abstractsRes, propsRes] = await Promise.all([
        fetch("/api/vault?kind=document", { credentials: "include" }),
        fetch("/api/lease-abstractor", { credentials: "include" }),
        fetch("/api/properties", { credentials: "include" }).catch(() => null),
      ]);
      if (!itemsRes.ok) throw new Error("Failed to load vault items");
      const items = await itemsRes.json();
      setVaultItems(items);
      if (abstractsRes.ok) {
        setAbstracts(await abstractsRes.json());
      } else {
        setAbstracts([]);
      }
      if (propsRes?.ok) {
        const propsData = await propsRes.json();
        const rawProps = Array.isArray(propsData) ? propsData : propsData.properties || [];
        setProperties(rawProps.map((p: Record<string, unknown>) => ({
          id: p.id as string,
          name: [p.address_line1, p.city, p.state].filter(Boolean).join(", ") || String(p.id).slice(0, 8),
          address: p.address_line1 as string | undefined,
        })));
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
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
        body: JSON.stringify({
          vault_item_id: vaultItemId,
          options: {
            refinePrompt: refinePrompt || undefined,
            webSearch: webSearch || undefined,
          },
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Extraction failed");
      setSelectedAbstract(result);
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const upRes = await fetch("/api/vault/upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const upData = await upRes.json();
      if (!upRes.ok) throw new Error(upData.error || "Upload failed");

      const title = file.name.replace(/\.[^.]+$/, "");
      const createRes = await fetch("/api/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          kind: "document",
          title,
          description: null,
          file_url: upData.url,
          file_size: upData.fileSize,
          file_type: upData.fileType,
          project_id: null,
        }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) throw new Error(createData.error || "Failed to add to vault");

      await loadData();
      if (createData.id) {
        runExtraction(createData.id);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileUpload(file);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const onDragLeave = () => setDragOver(false);

  const handleCitationClick = (page: number) => {
    if (selectedAbstract) {
      window.open(`/vault/${selectedAbstract.vault_item_id}?page=${page}`, "_blank");
    }
  };

  const startEditField = (fieldName: string, currentValue: string | null) => {
    setEditingField(fieldName);
    setEditValue(currentValue || "");
  };

  const saveFieldEdit = async () => {
    if (!selectedAbstract || !editingField) return;
    const updatedFields = selectedAbstract.fields.map((f) =>
      f.name === editingField
        ? { ...f, value: editValue || null, confidence: "high" as const }
        : f,
    );
    setSelectedAbstract({
      ...selectedAbstract,
      fields: updatedFields,
    });
    setEditingField(null);
    setEditValue("");
    // Persist to DB
    try {
      await fetch("/api/lease-abstractor", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: selectedAbstract.id, fields: updatedFields }),
      });
    } catch {
      // Silent fail -- local state is already updated
    }
  };

  const cancelEdit = () => {
    setEditingField(null);
    setEditValue("");
  };

  const linkProperty = async (propertyId: string | null) => {
    if (!selectedAbstract) return;
    setLinkingProperty(true);
    try {
      const res = await fetch("/api/lease-abstractor", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: selectedAbstract.id, property_id: propertyId }),
      });
      if (res.ok) {
        setSelectedAbstract({ ...selectedAbstract, property_id: propertyId });
      }
    } catch {
      // Silent fail
    } finally {
      setLinkingProperty(false);
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

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      {/* Breadcrumb nav */}
      <div className="sticky top-0 z-10 border-b border-[var(--rule)] bg-[var(--canvas)]/95 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 md:px-10 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm text-[var(--ink-muted)]">
            <Link href="/dashboard" className="hover:text-[var(--ink)] transition">
              Drift
            </Link>
            <span className="text-[var(--ink-subtle)]">/</span>
            <span className="text-[var(--ink)]">Lease Abstractor</span>
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

      <div className="max-w-7xl mx-auto px-6 md:px-10 py-8 md:py-10">
        {/* Hero */}
        <div className="mb-8">
          <div className="label-section mb-1.5">Commercial real estate</div>
          <h1 className="heading-display text-3xl md:text-4xl text-[var(--ink)] leading-[1.1]">
            Lease Abstractor
          </h1>
          <p className="text-sm text-[var(--ink-muted)] mt-1.5 max-w-xl">
            Upload a commercial lease and extract structured deal terms, financial
            schedules, and key clauses with AI-powered 3-pass analysis.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 px-3 py-2 text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger)]/30 rounded-[var(--r-input)] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" strokeWidth={1.5} />
            {error}
            <button onClick={() => setError(null)} className="ml-auto p-0.5 hover:opacity-70">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Main two-panel layout */}
        <div className="card-flat overflow-hidden" style={{ minHeight: "calc(100vh - 280px)" }}>
          <div className="flex h-full" style={{ minHeight: "inherit" }}>
            {/* Left panel */}
            <div className={`${selectedAbstract ? "hidden lg:flex" : "flex"} w-full lg:w-[380px] shrink-0 border-r border-[var(--rule)] flex-col`}>
              {/* Upload drop zone */}
              <div
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`m-4 mb-3 rounded-[var(--r-card)] border-2 border-dashed p-5 text-center cursor-pointer transition ${
                  dragOver
                    ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                    : "border-[var(--rule)] hover:border-[var(--rule-strong)] hover:bg-[var(--canvas-subtle)]"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.doc,.txt"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file);
                    e.target.value = "";
                  }}
                />
                {uploading ? (
                  <div className="flex items-center justify-center gap-2 text-[var(--ink-muted)]">
                    <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                    <span className="text-sm">Uploading...</span>
                  </div>
                ) : (
                  <>
                    <div className="rounded-full bg-[var(--canvas-subtle)] border border-[var(--rule)] p-2.5 mx-auto w-fit mb-3">
                      <Upload className="w-4 h-4 text-[var(--ink-muted)]" strokeWidth={1.5} />
                    </div>
                    <p className="text-sm font-medium text-[var(--ink)]">Drop your lease here</p>
                    <p className="text-xs text-[var(--ink-subtle)] mt-0.5">PDF, DOCX, or TXT</p>
                  </>
                )}
              </div>

              {/* Customize */}
              <div className="mx-4 mb-3">
                <button
                  onClick={() => setShowCustomize((v) => !v)}
                  className="flex items-center gap-1.5 w-full px-3 py-2 rounded-[var(--r-input)] text-xs font-medium text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition"
                >
                  <Settings2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                  Customize extraction
                  <ChevronDown className={`w-3 h-3 ml-auto transition-transform ${showCustomize ? "rotate-180" : ""}`} />
                </button>

                {showCustomize && (
                  <div className="mt-2 space-y-2 px-1 pb-1">
                    <label className="flex items-start gap-2.5 cursor-pointer rounded-[var(--r-input)] p-2 hover:bg-[var(--canvas-subtle)] transition">
                      <input
                        type="checkbox"
                        checked={refinePrompt}
                        onChange={(e) => setRefinePrompt(e.target.checked)}
                        className="mt-0.5 rounded border-[var(--rule)]"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--ink)]">
                          <Sparkles className="w-3 h-3 text-[var(--flag)]" strokeWidth={1.5} />
                          Optimize Prompt
                        </div>
                        <p className="text-[11px] text-[var(--ink-muted)] mt-0.5 leading-tight">
                          Tailors extraction to this lease&apos;s terminology for higher accuracy.
                        </p>
                      </div>
                    </label>

                    <label className="flex items-start gap-2.5 cursor-pointer rounded-[var(--r-input)] p-2 hover:bg-[var(--canvas-subtle)] transition">
                      <input
                        type="checkbox"
                        checked={webSearch}
                        onChange={(e) => setWebSearch(e.target.checked)}
                        className="mt-0.5 rounded border-[var(--rule)]"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--ink)]">
                          <Globe className="w-3 h-3 text-[var(--accent)]" strokeWidth={1.5} />
                          Market Context
                        </div>
                        <p className="text-[11px] text-[var(--ink-muted)] mt-0.5 leading-tight">
                          Researches property and tenant for market comparables and credit assessment.
                        </p>
                      </div>
                    </label>

                    {(refinePrompt || webSearch) && (
                      <p className="text-[10px] text-[var(--flag)] px-2">
                        +{refinePrompt && webSearch ? "2" : "1"} AI pass{refinePrompt && webSearch ? "es" : ""} (~10-20s)
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Search */}
              <div className="px-4 pb-3 border-b border-[var(--rule)]">
                <div className="label-section mb-2">Documents</div>
                <div className="relative">
                  <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--ink-subtle)]"
                    strokeWidth={1.5}
                  />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Filter documents..."
                    className={`${inputClass} pl-9`}
                  />
                </div>
              </div>

              {/* Document list */}
              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-5 h-5 animate-spin text-[var(--ink-subtle)]" strokeWidth={1.5} />
                  </div>
                ) : filteredItems.length === 0 ? (
                  <div className="flex flex-col items-center text-center px-6 py-16">
                    <div className="rounded-full bg-[var(--canvas-subtle)] border border-[var(--rule)] p-3 mb-4">
                      <FileSearch className="w-5 h-5 text-[var(--ink-muted)]" strokeWidth={1.5} />
                    </div>
                    <p className="text-sm text-[var(--ink-muted)] max-w-[240px]">
                      {vaultItems.length === 0
                        ? "No documents in vault. Drop a lease above to get started."
                        : "No documents match your search."}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-[var(--rule)]">
                    {filteredItems.map((item) => {
                      const itemAbstracts = abstractsByItem.get(item.id) || [];
                      const latest = itemAbstracts[0];
                      return (
                        <div key={item.id} className="px-4 py-3 hover:bg-[var(--canvas-subtle)] transition">
                          <div className="flex items-start gap-2.5">
                            <FileText
                              className="w-4 h-4 mt-0.5 shrink-0"
                              strokeWidth={1.5}
                              style={{
                                color: item.file_type?.includes("pdf") ? "var(--danger)" : "var(--ink-muted)",
                              }}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-[var(--ink)] truncate">{item.title}</p>
                              <p className="mono text-[11px] text-[var(--ink-subtle)] mt-0.5">
                                {formatSize(item.file_size)} · {formatDate(item.created_at)}
                              </p>
                            </div>
                          </div>

                          <div className="mt-2.5 flex items-center gap-2 ml-6">
                            <button
                              onClick={() => runExtraction(item.id)}
                              disabled={extracting}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--r-input)] bg-[var(--ink)] text-[var(--canvas)] text-xs font-medium hover:opacity-90 disabled:opacity-50 transition"
                            >
                              {extracting ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Zap className="w-3 h-3" strokeWidth={1.5} />
                              )}
                              {extracting ? "Extracting..." : "Extract"}
                            </button>

                            {latest && (
                              <button
                                onClick={() => loadAbstract(latest.id)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--r-input)] border border-[var(--rule)] text-xs font-medium text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition"
                              >
                                {latest.status === "completed" ? (
                                  <CheckCircle2 className="w-3 h-3 text-[var(--verified)]" />
                                ) : latest.status === "failed" ? (
                                  <AlertCircle className="w-3 h-3 text-[var(--danger)]" />
                                ) : (
                                  <Clock className="w-3 h-3 text-[var(--ink-muted)]" />
                                )}
                                View
                              </button>
                            )}
                          </div>

                          {itemAbstracts.length > 1 && (
                            <div className="mt-1.5 ml-6 space-y-0.5">
                              {itemAbstracts.slice(1).map((a) => (
                                <button
                                  key={a.id}
                                  onClick={() => loadAbstract(a.id)}
                                  className="block mono text-[11px] text-[var(--ink-subtle)] hover:text-[var(--ink)] transition"
                                >
                                  {formatDate(a.created_at)} ·{" "}
                                  {a.extraction_seconds != null ? `${a.extraction_seconds.toFixed(1)}s` : ""}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Right panel */}
            <div className={`${selectedAbstract ? "flex" : "hidden lg:flex"} flex-1 flex-col`}>
              {!selectedAbstract ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="flex flex-col items-center text-center px-6">
                    <div className="rounded-full bg-[var(--canvas-subtle)] border border-[var(--rule)] p-3 mb-5">
                      <FileText className="w-5 h-5 text-[var(--ink-muted)]" strokeWidth={1.5} />
                    </div>
                    <div className="text-[10px] tracking-[0.16em] uppercase text-[var(--ink-subtle)] mb-2">
                      Get started
                    </div>
                    <p className="text-sm text-[var(--ink-muted)] max-w-sm">
                      Select a document and run extraction, or drop a lease in the panel on the left.
                    </p>
                  </div>
                </div>
              ) : selectedAbstract.status === "failed" ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="flex flex-col items-center text-center px-6">
                    <div className="rounded-full bg-[var(--danger-soft)] border border-[var(--danger)]/30 p-3 mb-5">
                      <AlertCircle className="w-5 h-5 text-[var(--danger)]" strokeWidth={1.5} />
                    </div>
                    <p className="text-sm font-medium text-[var(--ink)] mb-1">Extraction failed</p>
                    <p className="text-sm text-[var(--ink-muted)] max-w-md">
                      {selectedAbstract.error_message || "Unknown error"}
                    </p>
                  </div>
                </div>
              ) : selectedAbstract.status !== "completed" ? (
                <div className="flex-1 flex items-center justify-center text-[var(--ink-muted)]">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" strokeWidth={1.5} />
                  <span className="text-sm">Processing (3-pass extraction)...</span>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto">
                  {/* Header bar */}
                  <div className="sticky top-0 z-10 bg-[var(--canvas)]/95 backdrop-blur border-b border-[var(--rule)] px-5 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setSelectedAbstract(null)}
                        className="lg:hidden p-1.5 rounded-[var(--r-input)] hover:bg-[var(--canvas-subtle)] transition"
                      >
                        <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
                      </button>
                      <div>
                        <h2 className="text-sm font-semibold text-[var(--ink)]">
                          Lease Abstract
                        </h2>
                        <p className="mono text-[11px] text-[var(--ink-subtle)]">
                          {selectedAbstract.fields.length} fields · {selectedAbstract.extraction_seconds?.toFixed(1)}s · {selectedAbstract.model}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={copyJSON}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--r-input)] border border-[var(--rule)] text-xs text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition"
                      >
                        <Copy className="w-3 h-3" strokeWidth={1.5} />
                        {copied ? "Copied" : "JSON"}
                      </button>
                      <button
                        onClick={exportCSV}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--r-input)] border border-[var(--rule)] text-xs text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition"
                      >
                        <Download className="w-3 h-3" strokeWidth={1.5} />
                        CSV
                      </button>
                      <button
                        onClick={async () => {
                          if (!selectedAbstract) return;
                          try {
                            const sections = (["deal_terms", "financial_terms", "key_clauses"] as const).map((cat) => {
                              const fields = selectedAbstract.fields.filter((f) => f.category === cat);
                              const body = fields
                                .map((f) => `${f.name}: ${(f.value ?? "N/A").replace(/\[v\d+\]/g, "").trim()} (${f.confidence})`)
                                .join("\n");
                              return { heading: CATEGORY_LABELS[cat], body };
                            });
                            if (selectedAbstract.context_analysis) {
                              const ca = selectedAbstract.context_analysis;
                              let contextBody = `Tenant favorability: ${ca.tenant_favorable_assessment}`;
                              if (ca.key_risks.length > 0) contextBody += `\n\nKey risks:\n${ca.key_risks.map((r) => `- ${r}`).join("\n")}`;
                              if (ca.unusual_clauses.length > 0) contextBody += `\n\nUnusual clauses:\n${ca.unusual_clauses.map((c) => `- ${c}`).join("\n")}`;
                              if (ca.cross_reference_issues.length > 0) contextBody += `\n\nCross-reference issues:\n${ca.cross_reference_issues.map((i) => `- ${i}`).join("\n")}`;
                              sections.push({ heading: "Context Analysis", body: contextBody });
                            }
                            const res = await fetch("/api/lease-abstractor/export-pdf", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ abstractId: selectedAbstract.id, sections }),
                            });
                            if (!res.ok) throw new Error("PDF export failed");
                            const blob = await res.blob();
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `lease-abstract-${selectedAbstract.id.slice(0, 8)}.pdf`;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                          } catch (e) {
                            console.error("[pdf-export]", e);
                          }
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--r-input)] border border-[var(--rule)] text-xs text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition"
                      >
                        <Download className="w-3 h-3" strokeWidth={1.5} />
                        PDF
                      </button>
                    </div>
                  </div>

                  {/* Confidence summary + key metrics */}
                  {(() => {
                    const fields = selectedAbstract.fields;
                    const high = fields.filter((f) => f.confidence === "high").length;
                    const med = fields.filter((f) => f.confidence === "medium").length;
                    const low = fields.filter((f) => f.confidence === "low").length;
                    const notFound = fields.filter((f) => f.confidence === "not_found").length;
                    const total = fields.length || 1;

                    // Pull key deal metrics from fields
                    const findField = (name: string) =>
                      fields.find((f) => f.name.toLowerCase().includes(name.toLowerCase()))?.value ?? null;
                    const tenant = findField("Tenant") || findField("tenant name");
                    const landlord = findField("Landlord") || findField("landlord name");
                    const premises = findField("Premises") || findField("property");
                    const commenceDate = findField("Commencement") || findField("start date");
                    const expiryDate = findField("Expiration") || findField("end date");
                    const baseRent = findField("Base Rent") || findField("rent schedule");
                    const leaseType = findField("Lease Type") || findField("type");

                    return (
                      <div className="px-5 pt-5 pb-3 space-y-4">
                        {/* Confidence bar */}
                        <div className="rounded-lg border border-[var(--rule)] p-3 bg-[var(--canvas-subtle,rgba(0,0,0,0.015))]">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] uppercase tracking-wider font-medium text-[var(--ink-subtle)]">
                              Extraction Confidence
                            </span>
                            <span className="text-xs text-[var(--ink-muted)]">
                              {high} high, {med} medium, {low} low, {notFound} missing
                            </span>
                          </div>
                          <div className="flex h-2 rounded-full overflow-hidden bg-[var(--rule)]">
                            {high > 0 && (
                              <div
                                className="bg-emerald-500 transition-all"
                                style={{ width: `${(high / total) * 100}%` }}
                                title={`${high} high confidence`}
                              />
                            )}
                            {med > 0 && (
                              <div
                                className="bg-amber-400 transition-all"
                                style={{ width: `${(med / total) * 100}%` }}
                                title={`${med} medium confidence`}
                              />
                            )}
                            {low > 0 && (
                              <div
                                className="bg-red-400 transition-all"
                                style={{ width: `${(low / total) * 100}%` }}
                                title={`${low} low confidence`}
                              />
                            )}
                          </div>
                        </div>

                        {/* Key metrics strip */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                          {[
                            { label: "Tenant", value: tenant },
                            { label: "Landlord", value: landlord },
                            { label: "Premises", value: premises },
                            { label: "Lease Type", value: leaseType },
                            { label: "Commencement", value: commenceDate },
                            { label: "Expiration", value: expiryDate },
                            { label: "Base Rent", value: baseRent },
                          ]
                            .filter((m) => m.value)
                            .slice(0, 4)
                            .map((m) => (
                              <div
                                key={m.label}
                                className="rounded-lg border border-[var(--rule)] p-3 bg-[var(--surface,#fff)]"
                              >
                                <div className="text-[10px] uppercase tracking-wider font-medium text-[var(--ink-subtle)] mb-1">
                                  {m.label}
                                </div>
                                <div className="text-sm font-medium text-[var(--ink)] truncate" title={m.value ?? ""}>
                                  {(m.value ?? "").replace(/\[v\d+\]/g, "").trim() || "--"}
                                </div>
                              </div>
                            ))}
                        </div>

                        {/* Property linking */}
                        {properties.length > 0 && (
                          <div className="rounded-lg border border-[var(--rule)] p-3 bg-[var(--canvas-subtle,rgba(0,0,0,0.015))]">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] uppercase tracking-wider font-medium text-[var(--ink-subtle)]">
                                Linked Property
                              </span>
                              {linkingProperty && <Loader2 className="w-3 h-3 animate-spin text-[var(--ink-subtle)]" />}
                            </div>
                            <select
                              value={selectedAbstract.property_id || ""}
                              onChange={(e) => linkProperty(e.target.value || null)}
                              disabled={linkingProperty}
                              className="mt-1.5 w-full rounded-[var(--r-input)] border border-[var(--rule)] bg-[var(--canvas)] px-2.5 py-1.5 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)] disabled:opacity-50"
                            >
                              <option value="">-- Not linked --</option>
                              {properties.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name || p.address || p.id.slice(0, 8)}
                                </option>
                              ))}
                            </select>
                            {selectedAbstract.property_id && (
                              <div className="mt-1 text-[10px] text-[var(--ink-subtle)]">
                                Lease expiry notifications will use this property link.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Field table by category */}
                  <div className="px-5 py-5">
                    {(["deal_terms", "financial_terms", "key_clauses"] as const).map((cat) => {
                      const fields = fieldsByCategory[cat] || [];
                      if (fields.length === 0) return null;
                      const expanded = expandedCategories.has(cat);
                      return (
                        <div key={cat} className="mb-5">
                          <button
                            onClick={() => toggleCategory(cat)}
                            className="flex items-center gap-1.5 mb-2.5 label-section hover:text-[var(--ink)] transition"
                          >
                            {expanded ? (
                              <ChevronDown className="w-3.5 h-3.5" strokeWidth={1.5} />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.5} />
                            )}
                            {CATEGORY_LABELS[cat]} ({fields.length})
                          </button>

                          {expanded && (
                            <div className="rounded-[var(--r-card)] border border-[var(--rule)] overflow-hidden">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b border-[var(--rule)] bg-[var(--canvas-subtle)]">
                                    <th className="text-left py-2 px-3 label-section w-[180px]">Field</th>
                                    <th className="text-left py-2 px-3 label-section">Value</th>
                                    <th className="text-left py-2 px-3 label-section w-[80px]">Conf.</th>
                                    <th className="w-[36px]" />
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--rule)]">
                                  {fields.map((f, i) => {
                                    const conf = CONFIDENCE_STYLE[f.confidence] || CONFIDENCE_STYLE.low;
                                    const isEditing = editingField === f.name;
                                    return (
                                      <tr key={`${f.name}-${i}`} className="group hover:bg-[var(--canvas-subtle)]/50 transition">
                                        <td className="py-2.5 px-3 text-[var(--ink-muted)] align-top text-xs whitespace-nowrap">
                                          {f.name}
                                        </td>
                                        <td className="py-2.5 px-3 text-[var(--ink)] align-top">
                                          {isEditing ? (
                                            <div className="flex items-center gap-1.5">
                                              <input
                                                type="text"
                                                value={editValue}
                                                onChange={(e) => setEditValue(e.target.value)}
                                                onKeyDown={(e) => {
                                                  if (e.key === "Enter") saveFieldEdit();
                                                  if (e.key === "Escape") cancelEdit();
                                                }}
                                                autoFocus
                                                className={`flex-1 ${inputClass} py-1`}
                                              />
                                              <button onClick={saveFieldEdit} className="p-0.5 text-[var(--verified)] hover:opacity-70">
                                                <Check className="w-3.5 h-3.5" strokeWidth={1.5} />
                                              </button>
                                              <button onClick={cancelEdit} className="p-0.5 text-[var(--ink-muted)] hover:text-[var(--ink)]">
                                                <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                                              </button>
                                            </div>
                                          ) : (
                                            renderCitedValue(f.value, handleCitationClick)
                                          )}
                                        </td>
                                        <td className="py-2.5 px-3 align-top">
                                          <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-[var(--r-chip)] border ${conf.cls}`}>
                                            {conf.label}
                                          </span>
                                        </td>
                                        <td className="py-2.5 px-1 align-top">
                                          {!isEditing && (
                                            <button
                                              onClick={() => startEditField(f.name, f.value)}
                                              className="p-1 rounded-[var(--r-input)] text-[var(--ink-subtle)] opacity-0 group-hover:opacity-100 hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition"
                                              title="Edit"
                                            >
                                              <Pencil className="w-3 h-3" strokeWidth={1.5} />
                                            </button>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Context analysis */}
                  {selectedAbstract.context_analysis && (() => {
                    const ca = selectedAbstract.context_analysis!;
                    return (
                      <div className="px-5 pb-5">
                        <div className="label-section mb-3">Context Analysis</div>

                        <div className="space-y-3">
                          <div className="p-3 rounded-[var(--r-card)] border border-[var(--rule)] bg-[var(--canvas-subtle)]">
                            <p className="label-section mb-1">Tenant Favorability</p>
                            <p className="text-sm text-[var(--ink)] leading-relaxed">{ca.tenant_favorable_assessment}</p>
                          </div>

                          {ca.anchor_leverage && (
                            <div className="p-3 rounded-[var(--r-card)] border border-[var(--rule)] bg-[var(--canvas-subtle)]">
                              <p className="label-section mb-1">Anchor / Co-Tenancy Leverage</p>
                              <p className="text-sm text-[var(--ink)] leading-relaxed">{ca.anchor_leverage}</p>
                            </div>
                          )}

                          {ca.market_context && (
                            <div className="p-3 rounded-[var(--r-card)] border border-[var(--accent)]/20 bg-[var(--accent-soft)]">
                              <p className="label-section mb-1 flex items-center gap-1.5 text-[var(--accent)]">
                                <Globe className="w-3 h-3" strokeWidth={1.5} />
                                Market Context
                              </p>
                              <p className="text-sm text-[var(--ink)] leading-relaxed whitespace-pre-line">{ca.market_context}</p>
                            </div>
                          )}

                          {ca.key_risks.length > 0 && (
                            <div className="p-3 rounded-[var(--r-card)] border border-[var(--rule)]">
                              <p className="label-section mb-2">Key Risks</p>
                              <ul className="space-y-1.5">
                                {ca.key_risks.map((r, i) => (
                                  <li key={i} className="text-sm text-[var(--ink)] flex items-start gap-2">
                                    <span className="text-[var(--ink-subtle)] shrink-0 mt-0.5">-</span>
                                    {r}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {ca.unusual_clauses.length > 0 && (
                            <div className="p-3 rounded-[var(--r-card)] border border-[var(--rule)]">
                              <p className="label-section mb-2">Unusual Clauses</p>
                              <ul className="space-y-1.5">
                                {ca.unusual_clauses.map((c, i) => (
                                  <li key={i} className="text-sm text-[var(--ink)] flex items-start gap-2">
                                    <span className="text-[var(--ink-subtle)] shrink-0 mt-0.5">-</span>
                                    {c}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {ca.cross_reference_issues.length > 0 && (
                            <div className="p-3 rounded-[var(--r-card)] border border-[var(--flag)]/30 bg-[var(--flag-soft)]">
                              <p className="label-section mb-2 flex items-center gap-1.5 text-[var(--flag)]">
                                <AlertTriangle className="w-3.5 h-3.5" strokeWidth={1.5} />
                                Cross-Reference Issues
                              </p>
                              <ul className="space-y-1.5">
                                {ca.cross_reference_issues.map((issue, i) => (
                                  <li key={i} className="text-sm text-[var(--ink)] flex items-start gap-2">
                                    <span className="text-[var(--flag)] shrink-0 mt-0.5">-</span>
                                    {issue}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>

                        {/* Token usage */}
                        <div className="mt-4 pt-3 border-t border-[var(--rule)] flex items-center gap-4 mono text-[11px] text-[var(--ink-subtle)]">
                          <span>Input: {selectedAbstract.input_tokens.toLocaleString()} tokens</span>
                          <span>Output: {selectedAbstract.output_tokens.toLocaleString()} tokens</span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Disclaimer */}
                  <div className="px-5 pb-6">
                    <div className="px-3 py-2 rounded-[var(--r-card)] bg-[var(--canvas-subtle)] border border-[var(--rule)] text-[11px] text-[var(--ink-muted)] leading-relaxed">
                      AI-generated abstract. Review by qualified professional recommended.
                      Extracted values should be verified against the source document before
                      use in any transaction, negotiation, or legal proceeding.
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
