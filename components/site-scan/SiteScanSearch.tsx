"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import ParcelCard from "./ParcelCard";

interface SearchResult {
  location_resolved: string;
  county: string;
  state: string;
  results_count: number;
  detail_coverage: string;
  parcels: Array<{
    parcel_number: string;
    address: string;
    zoning: string;
    zoning_desc?: string;
    acreage: number;
    assessed_value?: number;
    land_use?: string;
  }>;
  source: string;
  accessed_at: string;
  caveat: string;
  error?: string;
}

export default function SiteScanSearch() {
  const [query, setQuery] = useState("");
  const [zoning, setZoning] = useState("");
  const [acreageMin, setAcreageMin] = useState("");
  const [acreageMax, setAcreageMax] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const body: any = { location: query.trim() };
      if (zoning.trim()) {
        body.zoning = zoning
          .split(",")
          .map((z) => z.trim())
          .filter(Boolean);
      }
      if (acreageMin) body.acreage_min = Number(acreageMin);
      if (acreageMax) body.acreage_max = Number(acreageMax);

      const res = await fetch("/api/site-scan/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setResult(data);
      }
    } catch {
      setError("Search failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none focus:border-[var(--rule-strong)]";

  return (
    <div className="space-y-8">
      <form onSubmit={handleSearch} className="space-y-3">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--ink-subtle)]"
              strokeWidth={1.5}
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Address, city, or zip code..."
              className={`${inputClass} pl-9`}
            />
          </div>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition"
          >
            {loading ? (
              <span className="inline-block w-4 h-4 border-2 border-[var(--canvas)]/30 border-t-[var(--canvas)] rounded-full animate-spin" />
            ) : (
              <Search className="w-3.5 h-3.5" strokeWidth={1.5} />
            )}
            {loading ? "Searching..." : "Search"}
          </button>
        </div>
        <div className="flex gap-3">
          <input
            type="text"
            value={zoning}
            onChange={(e) => setZoning(e.target.value)}
            placeholder="Zoning (e.g. retail, C-2)"
            className={`${inputClass} !w-48`}
          />
          <input
            type="number"
            value={acreageMin}
            onChange={(e) => setAcreageMin(e.target.value)}
            placeholder="Min acres"
            className={`${inputClass} !w-28`}
          />
          <input
            type="number"
            value={acreageMax}
            onChange={(e) => setAcreageMax(e.target.value)}
            placeholder="Max acres"
            className={`${inputClass} !w-28`}
          />
        </div>
      </form>

      {error && (
        <div className="px-3 py-2 text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger)]/30 rounded-[4px] flex items-center gap-2">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div className="label-section">
              {result.results_count} parcels near{" "}
              {result.location_resolved}
            </div>
            <p className="text-xs text-[var(--ink-subtle)] font-mono">
              {result.detail_coverage}
            </p>
          </div>
          <div className="space-y-3">
            {result.parcels.map((p) => (
              <ParcelCard
                key={p.parcel_number}
                parcel={p}
                source={result.source}
                accessedAt={result.accessed_at}
                clickable={false}
              />
            ))}
          </div>
          <p className="text-xs text-[var(--ink-subtle)]">
            {result.caveat}
          </p>
        </div>
      )}
    </div>
  );
}
