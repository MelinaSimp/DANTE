"use client";

import SiteScanSearch from "@/components/site-scan/SiteScanSearch";

export default function SiteScanClient() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-[var(--ink)]">
          Site Scan
        </h1>
        <p className="text-sm text-[var(--ink-muted)] mt-1">
          Search parcels by location, zoning, and size. All data from
          county public records.
        </p>
      </div>
      <SiteScanSearch />
    </div>
  );
}
