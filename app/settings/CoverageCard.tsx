"use client";

// app/settings/CoverageCard.tsx
//
// Shows which states and counties have GIS parcel data coverage
// for Site Scan. Helps users understand where void analysis,
// parcel detail, and site scanning work.

const COVERAGE: {
  state: string;
  abbr: string;
  level: "statewide" | "county";
  counties?: string[];
}[] = [
  { state: "Ohio", abbr: "OH", level: "statewide" },
  { state: "Colorado", abbr: "CO", level: "statewide" },
  { state: "Wisconsin", abbr: "WI", level: "statewide" },
  { state: "Montana", abbr: "MT", level: "statewide" },
  { state: "New York", abbr: "NY", level: "statewide" },
  { state: "Arkansas", abbr: "AR", level: "statewide" },
  { state: "Texas", abbr: "TX", level: "statewide" },
  { state: "Florida", abbr: "FL", level: "statewide" },
  { state: "Georgia", abbr: "GA", level: "statewide" },
  { state: "North Carolina", abbr: "NC", level: "statewide" },
  { state: "Virginia", abbr: "VA", level: "statewide" },
  { state: "Tennessee", abbr: "TN", level: "statewide" },
  { state: "Arizona", abbr: "AZ", level: "statewide" },
  { state: "Illinois", abbr: "IL", level: "statewide" },
  {
    state: "Pennsylvania",
    abbr: "PA",
    level: "county",
    counties: ["Allegheny", "Westmoreland", "Butler", "Beaver"],
  },
];

const STATEWIDE_COUNT = COVERAGE.filter((c) => c.level === "statewide").length;
const COUNTY_COUNT = COVERAGE.filter((c) => c.level === "county").reduce(
  (sum, c) => sum + (c.counties?.length || 0),
  0,
);

export default function CoverageCard() {
  return (
    <div className="rounded-xl border border-[var(--rule)] bg-[var(--canvas)] p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-[var(--ink)]">
            Site Scan coverage
          </h3>
          <p className="text-xs text-[var(--ink-muted)] mt-0.5">
            GIS parcel data for void analysis, site scanning, and parcel detail.
          </p>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-[var(--ink-muted)]">
          <span>{STATEWIDE_COUNT} states</span>
          <span>{COUNTY_COUNT} additional counties</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {COVERAGE.map((c) => (
          <div
            key={c.abbr}
            className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-[var(--canvas-subtle)]"
          >
            <span className="text-xs font-mono font-semibold text-[var(--ink)] w-6 shrink-0">
              {c.abbr}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-[var(--ink)]">{c.state}</div>
              {c.level === "statewide" ? (
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Statewide
                </span>
              ) : (
                <div className="mt-0.5">
                  <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    County-level
                  </span>
                  {c.counties && (
                    <div className="text-[10px] text-[var(--ink-muted)] mt-0.5">
                      {c.counties.join(", ")}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 text-[10px] text-[var(--ink-muted)]">
        Coverage expands regularly. Void analysis and listing search work
        nationwide via Google Places and listing APIs regardless of GIS
        coverage. Parcel-level detail (zoning, tax, acreage) requires GIS
        coverage above.
      </div>
    </div>
  );
}
