"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronDown,
  ThumbsUp,
  ThumbsDown,
  Bookmark,
  Info,
  Mail,
  Share2,
  X,
} from "lucide-react";

// Mock data matching the Vise-style screenshots
const MOCK_HOUSEHOLD = {
  id: "cooper-household",
  name: "Cooper Household",
  clients: 4,
  accounts: 5,
  totalValue: "$7.5M",
};

const MOCK_CLIENTS = [
  {
    id: "diane-cooper",
    name: "Diane Cooper",
    accounts: 1,
    totalValue: "$1.3M",
  },
];

const SECTIONS = [
  { id: "account-overview", label: "Account Overview" },
  { id: "asset-allocation", label: "Asset Allocation" },
  { id: "performance", label: "Performance" },
  { id: "transition-progress", label: "Transition Progress" },
  { id: "recent-activity", label: "Recent Activity" },
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

export default function ClientDetailsOverviewClient() {
  const [view, setView] = useState<View>("select");
  const [selected, setSelected] = useState<SelectedEntity>(null);
  const [activeSection, setActiveSection] = useState(SECTIONS[0].id);
  const [timeFilter, setTimeFilter] = useState<"YTD" | "MTD" | "QTD" | "All Time">("YTD");

  const handleSelectHousehold = () => {
    setSelected({
      type: "household",
      id: MOCK_HOUSEHOLD.id,
      name: MOCK_HOUSEHOLD.name,
    });
    setView("overview");
  };

  const handleSelectClient = (client: (typeof MOCK_CLIENTS)[0]) => {
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

  // ——— Selection screen (household vs client bars) ———
  if (view === "select") {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-[#f5f5f7] text-[#151515]">
        <div className="mx-auto max-w-2xl px-6 py-12">
          <p className="text-center text-sm text-[#151515]/60">{formatTime()}</p>
          <h1 className="mt-2 text-center text-2xl font-bold text-[#151515]">
            Prepare a report for the household or a client?
          </h1>

          <div className="mt-10 space-y-4">
            {/* Household bar */}
            <button
              type="button"
              onClick={handleSelectHousehold}
              className="flex w-full items-center justify-between rounded-2xl border border-[#e5e7eb] bg-[#ffffff] px-5 py-4 text-left shadow-sm transition hover:border-[#3166bf]/40 hover:bg-[#fafafa]"
            >
              <div className="flex items-center gap-4">
                <span className="flex h-5 w-5 shrink-0 rounded border-2 border-[#d1d5db]" aria-hidden />
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

            <p className="text-center text-sm text-[#6b7280]">Select a client</p>

            {/* Client bar(s) */}
            {MOCK_CLIENTS.map((client) => (
              <button
                key={client.id}
                type="button"
                onClick={() => handleSelectClient(client)}
                className="flex w-full items-center justify-between rounded-2xl border border-[#e5e7eb] bg-[#ffffff] px-5 py-4 text-left shadow-sm transition hover:border-[#3166bf]/40 hover:bg-[#fafafa]"
              >
                <div className="flex items-center gap-4">
                  <span className="flex h-5 w-5 shrink-0 rounded border-2 border-[#d1d5db]" aria-hidden />
                  <span className="text-lg font-semibold text-[#151515]">{client.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-[#eff6ff] px-3 py-1 text-sm text-[#2563eb]">
                    {client.accounts} account
                  </span>
                  <span className="rounded-full bg-[#ecfdf5] px-3 py-1 text-sm font-medium text-[#059669]">
                    {client.totalValue}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ——— Overview page (sidebar + main content with bars) ———
  const displayName = selected?.name ?? "Client";

  return (
    <div className="min-h-[calc(100vh-4rem)] flex bg-[#f5f5f7] text-[#151515]">
      {/* Left sidebar */}
      <aside className="w-64 shrink-0 border-r border-[#e5e7eb] bg-[#ffffff] p-4">
        <button
          type="button"
          onClick={handleGoBack}
          className="mb-6 flex items-center gap-2 text-sm font-medium text-[#151515] hover:text-[#3166bf]"
        >
          <ArrowLeft className="h-4 w-4" />
          Go Back
        </button>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#6b7280]">Sections</p>
        <nav className="space-y-0.5">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveSection(s.id)}
              className={`block w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium transition ${
                activeSection === s.id
                  ? "bg-[#eff6ff] text-[#2563eb]"
                  : "text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#151515]"
              }`}
            >
              {s.label}
            </button>
          ))}
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

                {/* Chart area placeholder (bars below) */}
                <div className="rounded-xl border border-[#e5e7eb] bg-[#fafafa] p-6">
                  <div className="mb-2 text-xs font-medium text-[#6b7280]">Account value over time</div>
                  <div className="flex h-48 items-end gap-2">
                    {[72, 68, 75, 70, 78, 82, 76, 85, 88, 84, 90, 100].map((h, i) => (
                      <div
                        key={i}
                        className="flex-1 rounded-t bg-[#3166bf]/80 transition hover:bg-[#3166bf]"
                        style={{ height: `${h}%` }}
                        title={`${h}%`}
                      />
                    ))}
                  </div>
                  <div className="mt-2 flex justify-between text-xs text-[#6b7280]">
                    <span>Jan</span>
                    <span>Dec</span>
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
                    <div className="mt-3 flex h-32 w-32 items-center justify-center rounded-full border-4 border-[#e5e7eb] bg-[#fafafa]">
                      <div className="h-24 w-24 rounded-full border-[8px] border-[#6366f1] border-t-[#22c55e] border-r-[#3b82f6]" />
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
                          className="rounded-lg bg-[#eff6ff] px-2.5 py-1 text-sm font-medium text-[#2563eb]"
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
                        <span className="w-40 text-sm text-[#374151]">{row.name}</span>
                        <div className="flex-1">
                          <div className="flex gap-1">
                            <div
                              className="h-5 rounded bg-[#3b82f6]"
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

            {activeSection !== "account-overview" && activeSection !== "asset-allocation" && (
              <div className="mt-8 rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-8 text-center">
                <p className="text-[#6b7280]">
                  {SECTIONS.find((s) => s.id === activeSection)?.label} content will appear here.
                </p>
              </div>
            )}

            {/* Footer actions */}
            <div className="mt-8 flex items-center justify-between border-t border-[#e5e7eb] pt-4">
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
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-lg border border-[#e5e7eb] bg-[#f9fafb] px-4 py-2 text-sm font-medium text-[#151515] hover:bg-[#f3f4f6]"
                >
                  <Mail className="h-4 w-4" />
                  Copy into Email
                </button>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-lg border border-[#e5e7eb] bg-[#f9fafb] px-4 py-2 text-sm font-medium text-[#151515] hover:bg-[#f3f4f6]"
                >
                  <Share2 className="h-4 w-4" />
                  Share
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
