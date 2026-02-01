"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronDown,
  ThumbsUp,
  ThumbsDown,
  Bookmark,
  Info,
  X,
  Check,
  LayoutDashboard,
  PieChart,
  TrendingUp,
  FileText,
  Upload,
  Trash2,
} from "lucide-react";
import PdfViewerWithAnnotations, { type Annotation } from "@/components/documents/PdfViewerWithAnnotations";
import DocumentSummaryChat from "@/components/documents/DocumentSummaryChat";

// Mock data matching the Vise-style screenshots
const MOCK_HOUSEHOLD = {
  id: "cooper-household",
  name: "Cooper Household",
  clients: 4,
  accounts: 5,
  totalValue: "$7.5M",
};

type Contact = { id: string; name: string; phone?: string; email?: string };

const SECTIONS = [
  { id: "documents", label: "Documents", icon: FileText },
  { id: "account-overview", label: "Account Overview", icon: LayoutDashboard },
  { id: "asset-allocation", label: "Asset Allocation", icon: PieChart },
  { id: "performance", label: "Performance", icon: TrendingUp },
];

type View = "select" | "overview";
type SelectedEntity = { type: "household"; id: string; name: string } | { type: "client"; id: string; name: string } | null;

function formatTime() {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  return `Today ${(h % 12) || 12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

interface ClientDetailsOverviewClientProps {
  initialContacts?: Contact[];
  initialContactId?: string | null;
}

export default function ClientDetailsOverviewClient({
  initialContacts = [],
  initialContactId = null,
}: ClientDetailsOverviewClientProps) {
  const [view, setView] = useState<View>("select");
  const [selected, setSelected] = useState<SelectedEntity>(null);
  const [activeSection, setActiveSection] = useState(SECTIONS[0].id);
  const [timeFilter, setTimeFilter] = useState<"YTD" | "MTD" | "QTD" | "All Time">("YTD");
  const [document, setDocument] = useState<{
    id: string;
    file_name: string;
    url: string;
    extracted_text?: string;
  } | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const contacts = initialContacts;

  useEffect(() => {
    if (initialContactId && contacts.length > 0) {
      const contact = contacts.find((c) => c.id === initialContactId);
      if (contact) {
        setSelected({ type: "client", id: contact.id, name: contact.name });
        setView("overview");
        setActiveSection("documents");
      }
    }
  }, [initialContactId, contacts]);

  const loadDocument = useCallback(async (contactId: string) => {
    const res = await fetch(`/api/documents?contactId=${contactId}`);
    const data = await res.json();
    if (data.document) {
      setDocument({
        id: data.document.id,
        file_name: data.document.file_name,
        url: data.document.url,
        extracted_text: data.document.extracted_text,
      });
      const annRes = await fetch(`/api/documents/annotations?documentId=${data.document.id}`);
      const annData = await annRes.json();
      setAnnotations(annData.annotations ?? []);
    } else {
      setDocument(null);
      setAnnotations([]);
    }
  }, []);

  useEffect(() => {
    setUploadError(null);
    if (selected?.type === "client") {
      loadDocument(selected.id);
    } else {
      setDocument(null);
      setAnnotations([]);
    }
  }, [selected?.type, selected?.id ?? "", loadDocument]);

  const handleSelectHousehold = () => {
    setSelected({
      type: "household",
      id: MOCK_HOUSEHOLD.id,
      name: MOCK_HOUSEHOLD.name,
    });
    setView("overview");
  };

  const handleSelectClient = (client: Contact) => {
    setSelected({
      type: "client",
      id: client.id,
      name: client.name,
    });
    setView("overview");
  };

  const handleGoBack = () => {
    setView("select");
    setSelected(null);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selected || selected.type !== "client") return;
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("contactId", selected.id);
      const res = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Upload failed");
      }
      await loadDocument(selected.id);
      setUploadError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setUploadError(msg);
      console.error(err);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleDeleteDocument = async () => {
    if (!document || !selected) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/documents/${document.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setDocument(null);
      setAnnotations([]);
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(false);
    }
  };

  // Pink/blue halo component (matches frontend)
  const IconHalo = ({ children, className = "", shape = "circle" }: { children: React.ReactNode; className?: string; shape?: "circle" | "square" }) => (
    <div className={`relative ${className}`}>
      <div className={`absolute inset-0 bg-gradient-to-br from-purple-400 via-pink-500 to-blue-500 blur-sm opacity-50 ${shape === "square" ? "rounded-sm" : "rounded-full"}`} aria-hidden />
      <div className="relative">{children}</div>
    </div>
  );

  // ——— Selection screen (household vs client bars) ———
  if (view === "select") {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-[#f5f5f7] text-[#151515]">
        <div className="mx-auto max-w-2xl px-6 py-12">
          <div className="relative">
            <div className="absolute -inset-4 bg-gradient-to-br from-purple-400/20 via-pink-500/20 to-blue-500/20 rounded-3xl blur-2xl -z-10" aria-hidden />
            <p className="text-center text-sm text-[#151515]/60">{formatTime()}</p>
            <h1 className="mt-2 text-center text-2xl font-bold text-[#151515]">
              Prepare a report for the household or a client?
            </h1>
          </div>

          <div className="mt-10 space-y-4 relative">
            {/* Household bar — square with halo */}
            <div className="relative">
              <div className="absolute -inset-1 bg-gradient-to-br from-purple-400/25 via-pink-500/25 to-blue-500/25 blur-md rounded-sm" aria-hidden />
              <button
                type="button"
                onClick={handleSelectHousehold}
                className="relative flex w-full items-center justify-between rounded-sm border border-[#e5e7eb] bg-[#ffffff] px-5 py-4 text-left shadow-sm transition hover:border-[#3166bf]/40 hover:bg-[#fafafa] group"
              >
                <div className="flex items-center gap-4">
                  <IconHalo shape="square" className="flex h-8 w-8 shrink-0 items-center justify-center">
                    <span className="flex h-5 w-5 rounded-sm border-2 border-[#d1d5db] bg-white group-hover:border-[#a78bfa]/50" aria-hidden />
                  </IconHalo>
                  <span className="text-lg font-semibold text-[#151515]">{MOCK_HOUSEHOLD.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-[#f3f4f6] px-3 py-1 text-sm text-[#6b7280]">
                    {MOCK_HOUSEHOLD.clients} clients
                  </span>
                  <span className="rounded-full bg-[#eff6ff] px-3 py-1 text-sm text-[#2563eb]">
                    {MOCK_HOUSEHOLD.accounts} accounts
                  </span>
                  <span className="rounded-full bg-[#ecfdf5] px-3 py-1 text-sm font-medium text-[#059669]">
                    {MOCK_HOUSEHOLD.totalValue}
                  </span>
                </div>
              </button>
            </div>

            <p className="text-center text-sm text-[#6b7280]">Select a client</p>

            {/* Client bar(s) — square with halo */}
            {contacts.length === 0 ? (
              <p className="text-center text-sm text-[#6b7280] py-4">No contacts yet. Add contacts to prepare reports.</p>
            ) : (
            contacts.map((client) => (
              <div key={client.id} className="relative">
                <div className="absolute -inset-1 bg-gradient-to-br from-purple-400/25 via-pink-500/25 to-blue-500/25 blur-md rounded-sm" aria-hidden />
                <button
                  type="button"
                  onClick={() => handleSelectClient(client)}
                  className="relative flex w-full items-center justify-between rounded-sm border border-[#e5e7eb] bg-[#ffffff] px-5 py-4 text-left shadow-sm transition hover:border-[#3166bf]/40 hover:bg-[#fafafa] group"
                >
                <div className="flex items-center gap-4">
                  <IconHalo shape="square" className="flex h-8 w-8 shrink-0 items-center justify-center">
                    <span className="flex h-5 w-5 rounded-sm border-2 border-[#d1d5db] bg-white group-hover:border-[#a78bfa]/50" aria-hidden />
                  </IconHalo>
                  <span className="text-lg font-semibold text-[#151515]">{client.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  {client.phone && (
                    <span className="rounded-full bg-[#eff6ff] px-3 py-1 text-sm text-[#2563eb]">
                      {client.phone}
                    </span>
                  )}
                </div>
              </button>
            </div>
            ))
            )}
          </div>
        </div>
      </div>
    );
  }

  // ——— Overview page (sidebar + main content with bars) ———
  const displayName = selected?.name ?? "Client";

  return (
    <div className="min-h-[calc(100vh-4rem)] flex bg-[#f5f5f7] text-[#151515]">
      {/* Left sidebar — frontend-style glass + pink/blue halo on icons */}
      <aside className="w-64 shrink-0 border-r border-gray-300/10 bg-gray-200/90 p-4 shadow-2xl backdrop-blur-sm">
        <button
          type="button"
          onClick={handleGoBack}
          className="mb-6 flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-[#151515] transition hover:bg-white/30 hover:text-[#3166bf]"
        >
          <IconHalo className="flex h-9 w-9 shrink-0 items-center justify-center">
            <span className="flex items-center justify-center rounded-full bg-white p-2">
              <ArrowLeft className="h-4 w-4 text-gray-600" />
            </span>
          </IconHalo>
          Go Back
        </button>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#6b7280]">Sections</p>
        <nav className="space-y-2">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const isActive = activeSection === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveSection(s.id)}
                className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition ${
                  isActive
                    ? "bg-blue-600/10 text-blue-600"
                    : "text-gray-700 hover:bg-white/30"
                }`}
              >
                <IconHalo className="flex h-9 w-9 shrink-0 items-center justify-center">
                  <span className="flex items-center justify-center rounded-full bg-white p-2">
                    <Icon className={`h-4 w-4 ${isActive ? "text-blue-600" : "text-gray-600"}`} />
                  </span>
                </IconHalo>
                {s.label}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 overflow-auto">
        {/* Top bar */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#e5e7eb] bg-[#ffffff] px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-[#151515]">Overview on {displayName}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-[#6b7280]">{formatTime()}</span>
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-lg border border-[#e5e7eb] bg-[#f9fafb] px-3 py-2 text-sm font-medium text-[#151515] hover:bg-[#f3f4f6]"
            >
              Actions <ChevronDown className="h-4 w-4" />
            </button>
            <Link
              href="/client-details-overview"
              className="rounded-lg p-2 text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#151515]"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </Link>
          </div>
        </div>

        {/* Content card */}
        <div className="mx-6 my-6 max-w-4xl">
          <div className="rounded-2xl border border-[#e5e7eb] bg-[#ffffff] p-6 shadow-sm">
            <p className="text-sm text-[#6b7280]">{formatTime()}</p>
            <h2 className="mt-1 flex items-center gap-2 text-xl font-bold text-[#151515]">
              <span className="text-[#3166bf]">V</span>
              Here&apos;s an overview on {displayName}.
            </h2>
            <p className="mt-3 text-[#374151]">
              {displayName}&apos;s portfolio is performing well with a return
            </p>

            {activeSection === "account-overview" && (
              <div className="mt-8 space-y-6">
                <h3 className="text-xl font-bold text-[#151515]">Account Overview</h3>
                <p className="text-[#374151] leading-relaxed">
                  {displayName}&apos;s portfolio remains strong at $1.25M, reflecting steady growth. She has added $25,000 in
                  contributions to the account in January and has a big distribution coming up of $10,000 for vacation
                  expenses in Q1. This recent contribution bolstered her brokerage account, while withdrawals for
                  personal expenses have been minimal and well within her financial plan.
                </p>

                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div />
                  <div className="flex rounded-lg border border-[#e5e7eb] bg-[#f9fafb] p-0.5">
                    {(["YTD", "MTD", "QTD", "All Time"] as const).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setTimeFilter(f)}
                        className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                          timeFilter === f
                            ? "bg-[#ffffff] text-[#151515] shadow-sm"
                            : "text-[#6b7280] hover:text-[#151515]"
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#6b7280]">Account value</p>
                  <div className="mt-1 flex items-baseline gap-3">
                    <span className="text-3xl font-bold text-[#1e40af]">$1,253,455</span>
                    <span className="text-sm font-medium text-[#059669]">▼3.2% vs. last month</span>
                  </div>
                </div>

                {/* Line graph — white bg, pink/blue halo */}
                <div className="relative overflow-hidden rounded-xl border border-[#e5e7eb] bg-white p-6">
                  <div className="absolute inset-0 bg-gradient-to-br from-purple-400/10 via-pink-500/10 to-blue-500/10 blur-2xl" aria-hidden />
                  <div className="relative">
                    <div className="mb-2 text-xs font-medium text-[#6b7280]">Account value over time</div>
                    <div className="h-48 w-full">
                      <svg viewBox="0 0 400 120" className="h-full w-full" preserveAspectRatio="none">
                        <defs>
                          <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#c084fc" />
                            <stop offset="50%" stopColor="#ec4899" />
                            <stop offset="100%" stopColor="#3b82f6" />
                          </linearGradient>
                          <filter id="lineGlow">
                            <feGaussianBlur stdDeviation="2" result="blur" />
                            <feMerge>
                              <feMergeNode in="blur" />
                              <feMergeNode in="SourceGraphic" />
                            </feMerge>
                          </filter>
                        </defs>
                        <polyline
                          fill="none"
                          stroke="url(#lineGradient)"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          filter="url(#lineGlow)"
                          points={[72, 68, 75, 70, 78, 82, 76, 85, 88, 84, 90, 100]
                            .map((v, i) => `${(i / 11) * 380 + 10},${120 - v}`)
                            .join(" ")}
                        />
                      </svg>
                    </div>
                    <div className="mt-2 flex justify-between text-xs text-[#6b7280]">
                      <span>Jan</span>
                      <span>Dec</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeSection === "asset-allocation" && (
              <div className="mt-8 space-y-6">
                <h3 className="text-xl font-bold text-[#151515]">Asset Allocation</h3>
                <p className="text-[#374151] leading-relaxed">
                  {displayName} is being transitioned into the 75/20/5 portfolio from a 75/25, with a focus on growth,
                  income, capital appreciation, and tax loss harvesting.
                </p>
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-4">
                    <p className="text-xs font-semibold uppercase text-[#6b7280]">Allocation</p>
                    <div className="relative mt-3 h-32 w-32">
                      <div
                        className="absolute inset-0 rounded-full"
                        style={{
                          background: "conic-gradient(#c084fc 0deg 271deg, #ec4899 271deg 343deg, #3b82f6 343deg 360deg)",
                        }}
                      />
                      <div className="absolute inset-[12%] rounded-full bg-[#fafafa]" />
                    </div>
                  </div>
                  <div className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-4">
                    <p className="text-xs font-semibold uppercase text-[#6b7280]">By class</p>
                    <ul className="mt-2 space-y-2 text-sm">
                      <li className="flex justify-between">
                        <span>Equity</span>
                        <span className="font-semibold text-[#151515]">75.2%</span>
                      </li>
                      <li className="flex justify-between">
                        <span>Fixed Income</span>
                        <span className="font-semibold text-[#151515]">20.0%</span>
                      </li>
                      <li className="flex justify-between">
                        <span>Alternatives</span>
                        <span className="font-semibold text-[#151515]">4.8%</span>
                      </li>
                    </ul>
                  </div>
                  <div className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-4">
                    <p className="text-xs font-semibold uppercase text-[#6b7280]">Top holdings</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {["NVDA", "AAPL", "AMZN", "MSFT", "XOM", "META"].map((t) => (
                        <span
                          key={t}
                          className="rounded-lg border border-[#c084fc]/40 bg-gradient-to-r from-purple-400/15 via-pink-500/15 to-blue-500/15 px-2.5 py-1 text-sm font-semibold text-[#6366f1]"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-4">
                  <p className="text-xs font-semibold uppercase text-[#6b7280]">Sectors — Target vs. S&P 500</p>
                  <div className="mt-3 space-y-3">
                    {[
                      { name: "Technology", target: 12.6, sp500: 28.6, diff: -10.7 },
                      { name: "Financial Services", target: 18.2, sp500: 13.1, diff: 5.1 },
                      { name: "Cons. Discretionary", target: 10.1, sp500: 9.2, diff: 0.9 },
                      { name: "Industrials", target: 9.4, sp500: 8.8, diff: 0.6 },
                      { name: "Health Care", target: 8.2, sp500: 12.1, diff: -3.9 },
                    ].map((row) => (
                      <div key={row.name} className="flex items-center gap-4">
                        <span className="w-40 text-sm font-medium text-[#374151]">{row.name}</span>
                        <div className="flex-1">
                          <div className="flex gap-1">
                            <div
                              className="h-5 rounded bg-gradient-to-r from-[#c084fc] via-[#ec4899] to-[#3b82f6]"
                              style={{ width: `${Math.min(100, row.target * 3)}%` }}
                            />
                            <div
                              className="h-5 rounded bg-[#d1d5db]"
                              style={{ width: `${Math.min(100, row.sp500 * 3)}%` }}
                            />
                          </div>
                        </div>
                        <span
                          className={`w-12 text-right text-sm font-medium ${
                            row.diff >= 0 ? "text-[#059669]" : "text-[#dc2626]"
                          }`}
                        >
                          {row.diff >= 0 ? "+" : ""}
                          {row.diff}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeSection === "documents" && (
              <div className="mt-8">
                {selected?.type !== "client" ? (
                  <div className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-8 text-center">
                    <p className="text-[#6b7280]">Select a client to view and annotate documents.</p>
                  </div>
                ) : !document ? (
                  <div className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-8">
                    <p className="text-[#6b7280] mb-4">Upload a PDF for {selected.name}. One primary document per client.</p>
                    {uploadError && (
                      <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        {uploadError}
                        <button
                          type="button"
                          onClick={() => setUploadError(null)}
                          className="ml-2 text-red-500 hover:text-red-700"
                        >
                          ×
                        </button>
                      </div>
                    )}
                    <label className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 cursor-pointer disabled:opacity-50">
                      <Upload className="h-4 w-4" />
                      {uploading ? "Uploading…" : "Upload PDF"}
                      <input
                        type="file"
                        accept="application/pdf"
                        onChange={handleUpload}
                        disabled={uploading}
                        className="hidden"
                      />
                    </label>
                  </div>
                ) : (
                  <div className="rounded-xl border border-[#e5e7eb] bg-white overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2 border-b border-[#e5e7eb] bg-[#f9fafb]">
                      <span className="text-sm font-medium text-[#374151]">{document.file_name}</span>
                      <div className="flex items-center gap-2">
                        <label className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-[#6b7280] hover:bg-[#e5e7eb] cursor-pointer">
                          <Upload className="h-3 w-3" />
                          Replace
                          <input
                            type="file"
                            accept="application/pdf"
                            onChange={handleUpload}
                            disabled={uploading}
                            className="hidden"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={handleDeleteDocument}
                          disabled={deleting}
                          className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          <Trash2 className="h-3 w-3" />
                          Delete
                        </button>
                      </div>
                    </div>
                    {/* Split layout: PDF left, annotations + LLM chat right */}
                    <div className="flex h-[600px]">
                      <div className="flex-1 min-w-0 border-r border-[#e5e7eb]">
                        <PdfViewerWithAnnotations
                          documentId={document.id}
                          fileUrl={document.url}
                          fileName={document.file_name}
                          annotations={annotations}
                          onAnnotationsChange={setAnnotations}
                        />
                      </div>
                      <div className="w-[380px] shrink-0 flex flex-col bg-[#f9fafb]">
                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                          <p className="text-xs font-semibold uppercase tracking-wider text-[#6b7280]">
                            Annotations & comments
                          </p>
                          {annotations.length === 0 ? (
                            <p className="text-sm text-[#6b7280]">
                              Draw a box or highlight on the PDF, then add a comment. The LLM will use these when generating summaries.
                            </p>
                          ) : (
                            annotations
                              .sort((a, b) => (a.page_number - b.page_number) || ((a.created_at || "").localeCompare(b.created_at || "")))
                              .map((ann) => (
                                <div
                                  key={ann.id}
                                  className="flex justify-end"
                                >
                                  <div className="max-w-[90%] rounded-xl px-3 py-2 text-sm bg-blue-600 text-white">
                                    <div className="flex items-center gap-2 text-xs opacity-90">
                                      <Check className="h-3.5 w-3.5 shrink-0" />
                                      <span>Saved · Page {ann.page_number}</span>
                                    </div>
                                    <div className="mt-0.5 whitespace-pre-wrap">
                                      {ann.content || (ann.type === "highlight" ? "(highlighted)" : ann.type)}
                                    </div>
                                  </div>
                                </div>
                              ))
                          )}
                        </div>
                        {selected?.type === "client" && document && (
                          <DocumentSummaryChat contactId={selected.id} clientName={selected.name} />
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeSection !== "account-overview" && activeSection !== "asset-allocation" && activeSection !== "documents" && (
              <div className="mt-8 rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-8 text-center">
                <p className="text-[#6b7280]">
                  {SECTIONS.find((s) => s.id === activeSection)?.label} content will appear here.
                </p>
              </div>
            )}

            {/* Footer actions — Copy/Share removed */}
            <div className="mt-8 flex items-center border-t border-[#e5e7eb] pt-4">
              <div className="flex items-center gap-2">
                <button type="button" className="rounded p-2 text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#151515]">
                  <ThumbsUp className="h-4 w-4" />
                </button>
                <button type="button" className="rounded p-2 text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#151515]">
                  <ThumbsDown className="h-4 w-4" />
                </button>
                <button type="button" className="rounded p-2 text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#151515]">
                  <Bookmark className="h-4 w-4" />
                </button>
                <button type="button" className="rounded p-2 text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#151515]">
                  <Info className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
