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

  return (
    <div className="space-y-6">
      <form onSubmit={handleSearch} className="space-y-4">
        <div className="flex gap-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Address, city, or zip code..."
            className="flex-1 px-3 py-2 border border-[var(--edge)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="px-4 py-2 bg-[var(--accent)] text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
          >
            <Search className="w-4 h-4" />
            {loading ? "Searching..." : "Search"}
          </button>
        </div>
        <div className="flex gap-3 text-sm">
          <input
            type="text"
            value={zoning}
            onChange={(e) => setZoning(e.target.value)}
            placeholder="Zoning (e.g. retail, C-2)"
            className="px-3 py-1.5 border border-[var(--edge)] rounded text-sm w-48"
          />
          <input
            type="number"
            value={acreageMin}
            onChange={(e) => setAcreageMin(e.target.value)}
            placeholder="Min acres"
            className="px-3 py-1.5 border border-[var(--edge)] rounded text-sm w-28"
          />
          <input
            type="number"
            value={acreageMax}
            onChange={(e) => setAcreageMax(e.target.value)}
            placeholder="Max acres"
            className="px-3 py-1.5 border border-[var(--edge)] rounded text-sm w-28"
          />
        </div>
      </form>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--ink-muted)]">
              {result.results_count} parcels near{" "}
              {result.location_resolved}
            </p>
            <p className="text-xs text-[var(--ink-muted)]">
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
          <p className="text-xs text-[var(--ink-muted)] italic">
            {result.caveat}
          </p>
        </div>
      )}
    </div>
  );
}
