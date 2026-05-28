"use client";

// app/dante/VoidAnalysisBlock.tsx
//
// Interactive void analysis dashboard rendered from a ```void_analysis
// fenced block. The model emits structured JSON; this component renders:
//
//   1. Site header with Google Maps embed + animated ring overlay
//   2. Category density bar chart with threshold markers
//   3. Expandable void cards with tenant recommendations
//   4. Demographics key metrics strip
//   5. Rent comp range chart
//
// Design language: grayscale palette, glass panels, var(--ink)/var(--rule)
// CSS variables, consistent with ReasoningBlock and MapBlock styling.

import { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ReferenceLine,
} from "recharts";
import {
  MapPin,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Building2,
  Users,
  DollarSign,
  Target,
} from "lucide-react";

// ── Data schema ──────────────────────────────────────────────────

export interface VoidAnalysisData {
  site: {
    address: string;
    lat?: number;
    lng?: number;
    zoning?: string;
    acreage?: number;
    assessed_value?: number;
  };
  demographics?: {
    population_1mi?: number;
    population_3mi?: number;
    households_3mi?: number;
    median_hhi?: number;
    median_age?: number;
    daytime_pop?: number;
    owner_occupancy?: number;
  };
  categories: Array<{
    name: string;
    count_1mi: number;
    count_3mi: number;
    threshold: number;
    status: "void" | "underserved" | "adequate" | "saturated";
  }>;
  voids: Array<{
    category: string;
    count_3mi: number;
    evidence: string;
    opportunity_level: "HIGH" | "MEDIUM" | "LOW";
    demand_met: boolean;
    recommended_tenants?: Array<{
      brand: string;
      sf_requirement?: string;
      rationale?: string;
      verified_absent: boolean;
    }>;
  }>;
  rent_comps?: Array<{
    type: string;
    low: number;
    mid: number;
    high: number;
  }>;
  competitive_supply?: Array<{
    name: string;
    distance_mi: number;
    sf_available?: number;
    risk: "high" | "moderate" | "low";
  }>;
}

export function parseVoidAnalysisBlock(raw: string): VoidAnalysisData | null {
  // Try strict JSON first
  let data: Record<string, unknown> | null = null;
  try {
    data = JSON.parse(raw);
  } catch {
    // Lenient parse: strip trailing commas, comments, and other
    // JSON5-ish patterns that models commonly emit.
    try {
      const cleaned = raw
        .replace(/,\s*([}\]])/g, "$1")         // trailing commas
        .replace(/\/\/[^\n]*/g, "")             // single-line comments
        .replace(/\/\*[\s\S]*?\*\//g, "")       // block comments
        .replace(/\b(NaN|undefined)\b/g, "null") // invalid JS literals
        .replace(/'/g, '"');                     // single quotes
      data = JSON.parse(cleaned);
    } catch {
      return null;
    }
  }

  // Minimal validation — must have site.address and categories array
  if (
    !data?.site ||
    !(data.site as Record<string, unknown>)?.address ||
    !Array.isArray(data?.categories)
  ) {
    return null;
  }
  return data as unknown as VoidAnalysisData;
}

// ── Main component ──────────────────────────────────────────────

export default function VoidAnalysisBlock({ data }: { data: VoidAnalysisData }) {
  return (
    <div className="my-6 space-y-4">
      {/* Site header + map */}
      <SiteHeader site={data.site} demographics={data.demographics} />

      {/* Category density chart */}
      {data.categories.length > 0 && (
        <CategoryDensityChart categories={data.categories} />
      )}

      {/* Void cards */}
      {data.voids.length > 0 && (
        <VoidCardsSection voids={data.voids} />
      )}

      {/* Rent comps */}
      {data.rent_comps && data.rent_comps.length > 0 && (
        <RentCompChart comps={data.rent_comps} />
      )}

      {/* Competitive supply */}
      {data.competitive_supply && data.competitive_supply.length > 0 && (
        <CompetitiveSupply supply={data.competitive_supply} />
      )}
    </div>
  );
}

// ── Site header ─────────────────────────────────────────────────

function SiteHeader({
  site,
  demographics,
}: {
  site: VoidAnalysisData["site"];
  demographics?: VoidAnalysisData["demographics"];
}) {
  const q = encodeURIComponent(site.address);
  const z = 14; // Trade area overview zoom
  const src = `https://www.google.com/maps?q=${q}&z=${z}&output=embed`;

  return (
    <div className="rounded-lg border border-[var(--rule)] overflow-hidden bg-[var(--surface,#fff)]">
      {/* Map with animated ring overlay */}
      <div className="relative" style={{ height: 220 }}>
        <div
          className="absolute inset-0"
          style={{ filter: "grayscale(1) contrast(1.05)" }}
        >
          <iframe
            src={src}
            width="100%"
            height="100%"
            style={{ border: 0 }}
            allowFullScreen={false}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            title={`Trade area — ${site.address}`}
          />
        </div>

        {/* Animated ring overlay */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          {/* 3-mile ring */}
          <div
            className="absolute rounded-full border-2 border-[var(--ink)]/20 animate-ring-expand-3mi"
            style={{ width: 180, height: 180 }}
          />
          {/* 1-mile ring */}
          <div
            className="absolute rounded-full border-2 border-[var(--ink)]/40 animate-ring-expand-1mi"
            style={{ width: 80, height: 80 }}
          />
          {/* Center dot */}
          <div className="absolute w-3 h-3 rounded-full bg-[var(--ink)] animate-pulse-slow" />
        </div>

        {/* Address chip */}
        <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white/90 backdrop-blur-sm border border-black/[0.06] shadow-sm">
          <MapPin className="w-3 h-3 text-[var(--ink-muted)]" strokeWidth={1.5} />
          <span className="text-[11px] font-medium text-[var(--ink)] max-w-[280px] truncate">
            {site.address}
          </span>
        </div>

        {/* Zoning + acreage chip */}
        {(site.zoning || site.acreage) && (
          <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white/90 backdrop-blur-sm border border-black/[0.06] shadow-sm">
            <Building2 className="w-3 h-3 text-[var(--ink-muted)]" strokeWidth={1.5} />
            <span className="text-[11px] font-medium text-[var(--ink)]">
              {[site.zoning, site.acreage ? `${site.acreage} ac` : null]
                .filter(Boolean)
                .join(" | ")}
            </span>
          </div>
        )}

        {/* Bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[var(--surface,#fff)] to-transparent pointer-events-none" />
      </div>

      {/* Demographics strip */}
      {demographics && (
        <div className="px-4 py-3 border-t border-[var(--rule)] grid grid-cols-4 gap-3">
          {demographics.households_3mi != null && (
            <MetricPill
              icon={<Users className="w-3.5 h-3.5" />}
              label="Households (3mi)"
              value={demographics.households_3mi.toLocaleString()}
            />
          )}
          {demographics.population_3mi != null && !demographics.households_3mi && (
            <MetricPill
              icon={<Users className="w-3.5 h-3.5" />}
              label="Population (3mi)"
              value={demographics.population_3mi.toLocaleString()}
            />
          )}
          {demographics.median_hhi != null && (
            <MetricPill
              icon={<DollarSign className="w-3.5 h-3.5" />}
              label="Median HHI"
              value={`$${(demographics.median_hhi / 1000).toFixed(0)}K`}
            />
          )}
          {demographics.median_age != null && (
            <MetricPill
              icon={<Users className="w-3.5 h-3.5" />}
              label="Median Age"
              value={demographics.median_age.toString()}
            />
          )}
          {demographics.daytime_pop != null && (
            <MetricPill
              icon={<Target className="w-3.5 h-3.5" />}
              label="Daytime Pop"
              value={demographics.daytime_pop.toLocaleString()}
            />
          )}
        </div>
      )}
    </div>
  );
}

function MetricPill({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-[var(--canvas-subtle,rgba(0,0,0,0.025))]">
      <div className="text-[var(--ink-muted)]">{icon}</div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-[var(--ink-subtle)] truncate">
          {label}
        </div>
        <div className="text-sm font-semibold text-[var(--ink)] tabular-nums">
          {value}
        </div>
      </div>
    </div>
  );
}

// ── Category density chart ──────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  void: "#dc2626",       // red-600
  underserved: "#f59e0b", // amber-500
  adequate: "#6b7280",   // gray-500
  saturated: "#374151",  // gray-700
};

function CategoryDensityChart({
  categories,
}: {
  categories: VoidAnalysisData["categories"];
}) {
  const chartData = useMemo(
    () =>
      categories.map((c) => ({
        name: c.name,
        count: c.count_3mi,
        threshold: c.threshold,
        status: c.status,
        fill: STATUS_COLORS[c.status] || "#6b7280",
      })),
    [categories],
  );

  const tip = {
    background: "var(--surface, #fff)",
    border: "1px solid var(--rule, #e5e7eb)",
    borderRadius: 6,
    fontSize: 12,
    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
  };

  return (
    <section className="rounded-lg border border-[var(--rule)] overflow-hidden bg-[var(--surface,#fff)]">
      <header className="flex items-center gap-2 px-5 py-3 border-b border-[var(--rule)] bg-[var(--canvas-subtle,rgba(0,0,0,0.025))]">
        <TrendingDown className="w-4 h-4 text-[var(--ink-muted)]" strokeWidth={1.5} />
        <div>
          <div className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)]">
            Supply Analysis
          </div>
          <div className="text-sm font-medium text-[var(--ink)]">
            Business Density by Category (3-Mile Ring)
          </div>
        </div>
      </header>

      <div className="px-4 py-4" style={{ height: Math.max(280, categories.length * 36) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 4, right: 40, bottom: 4, left: 8 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--rule, #e5e7eb)"
              horizontal={false}
            />
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: "var(--ink-muted, #6b7280)" }}
              axisLine={{ stroke: "var(--rule, #e5e7eb)" }}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 11, fill: "var(--ink-muted, #6b7280)" }}
              axisLine={false}
              tickLine={false}
              width={100}
            />
            <Tooltip
              contentStyle={tip}
              formatter={(value: number, _name: string, props: any) => {
                const d = props.payload;
                return [
                  `${value} businesses (threshold: ${d.threshold})`,
                  d.status.toUpperCase(),
                ];
              }}
            />
            {/* Threshold reference lines — one per category */}
            {chartData.map((d, i) => (
              <ReferenceLine
                key={i}
                x={d.threshold}
                stroke="#9ca3af"
                strokeDasharray="4 2"
                strokeWidth={1}
                ifOverflow="extendDomain"
              />
            ))}
            <Bar dataKey="count" radius={[0, 3, 3, 0]} maxBarSize={24} animationDuration={800}>
              {chartData.map((e, i) => (
                <Cell key={i} fill={e.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="px-5 py-2.5 border-t border-[var(--rule)] flex items-center gap-4 text-[10px] text-[var(--ink-muted)]">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: STATUS_COLORS.void }} />
          Void (0-1)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: STATUS_COLORS.underserved }} />
          Underserved (2-3)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: STATUS_COLORS.adequate }} />
          Adequate
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: STATUS_COLORS.saturated }} />
          Saturated
        </span>
        <span className="ml-auto flex items-center gap-1">
          <span className="w-4 border-t border-dashed border-gray-400" />
          Expected threshold
        </span>
      </div>
    </section>
  );
}

// ── Void cards ──────────────────────────────────────────────────

function VoidCardsSection({ voids }: { voids: VoidAnalysisData["voids"] }) {
  return (
    <section className="rounded-lg border border-[var(--rule)] overflow-hidden bg-[var(--surface,#fff)]">
      <header className="flex items-center gap-2 px-5 py-3 border-b border-[var(--rule)] bg-[var(--canvas-subtle,rgba(0,0,0,0.025))]">
        <AlertTriangle className="w-4 h-4 text-[var(--ink-muted)]" strokeWidth={1.5} />
        <div>
          <div className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)]">
            Confirmed Gaps
          </div>
          <div className="text-sm font-medium text-[var(--ink)]">
            {voids.length} Void{voids.length !== 1 ? "s" : ""} Identified
          </div>
        </div>
      </header>

      <div className="divide-y divide-[var(--rule)]">
        {voids.map((v, i) => (
          <VoidCard key={i} void_={v} />
        ))}
      </div>
    </section>
  );
}

function VoidCard({ void_ }: { void_: VoidAnalysisData["voids"][0] }) {
  const [expanded, setExpanded] = useState(false);

  const levelColor = {
    HIGH: "text-red-600 bg-red-50",
    MEDIUM: "text-amber-600 bg-amber-50",
    LOW: "text-gray-600 bg-gray-100",
  }[void_.opportunity_level] || "text-gray-600 bg-gray-100";

  const hasTenants = void_.recommended_tenants && void_.recommended_tenants.length > 0;

  // Opportunity description based on level + category
  const opportunityDesc = {
    HIGH: `This is a significant gap in the trade area. No or very few ${void_.category.toLowerCase()} options exist within the 3-mile ring, creating strong demand for new entrants. The absence of competition in this category typically signals unmet consumer demand.`,
    MEDIUM: `Limited ${void_.category.toLowerCase()} supply exists in the trade area but falls short of typical market thresholds. Additional businesses in this category could serve the existing population without excessive competitive pressure.`,
    LOW: `Some ${void_.category.toLowerCase()} supply exists but additional operators may be supportable depending on specific format and positioning. Market entry carries moderate risk.`,
  }[void_.opportunity_level] || "";

  return (
    <div className="px-5 py-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 text-left group"
      >
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-[var(--ink-muted)] flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-[var(--ink-muted)] flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[var(--ink)] group-hover:underline">
              {void_.category}
            </span>
            <span
              className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${levelColor}`}
            >
              {void_.opportunity_level}
            </span>
            {void_.count_3mi != null && (
              <span className="text-[11px] text-[var(--ink-muted)]">
                ({void_.count_3mi} within 3mi)
              </span>
            )}
          </div>
          <div className="text-xs text-[var(--ink-muted)] mt-0.5 truncate">
            {void_.evidence}
          </div>
        </div>
        {!void_.demand_met && (
          <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded flex-shrink-0">
            Below demand threshold
          </span>
        )}
      </button>

      {/* Expanded content — always shows opportunity context */}
      {expanded && (
        <div className="mt-3 ml-6 space-y-3">
          {/* Opportunity context — always shown */}
          <div className="px-3 py-2.5 rounded-md bg-[var(--canvas-subtle,rgba(0,0,0,0.02))] border border-[var(--rule)]/50">
            <div className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] mb-1">
              Opportunity Assessment
            </div>
            <p className="text-[11px] text-[var(--ink-muted)] leading-relaxed">
              {opportunityDesc}
            </p>
            <div className="mt-2 flex items-center gap-3 text-[10px] text-[var(--ink-subtle)]">
              <span>Supply within 3mi: <span className="font-semibold text-[var(--ink)]">{void_.count_3mi}</span></span>
              {void_.demand_met ? (
                <span className="text-green-700">Demand threshold met</span>
              ) : (
                <span className="text-amber-600">Below demand threshold</span>
              )}
            </div>
          </div>

          {/* Recommended tenants — shown when available */}
          {hasTenants && (
            <div className="space-y-2">
              <div className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] mb-1.5">
                Tenant Candidates (verified absent from trade area)
              </div>
              {void_.recommended_tenants!.map((t, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 px-3 py-2 rounded-md bg-[var(--canvas-subtle,rgba(0,0,0,0.02))] border border-[var(--rule)]/50"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-[var(--ink)]">
                        {t.brand}
                      </span>
                      {t.verified_absent ? (
                        <span className="text-[9px] text-green-700 bg-green-50 px-1 py-0.5 rounded">
                          Verified absent
                        </span>
                      ) : (
                        <span className="text-[9px] text-amber-600 bg-amber-50 px-1 py-0.5 rounded">
                          Present nearby
                        </span>
                      )}
                    </div>
                    {t.sf_requirement && (
                      <span className="text-[11px] text-[var(--ink-muted)]">
                        Typical requirement: {t.sf_requirement} SF
                      </span>
                    )}
                    {t.rationale && (
                      <p className="text-[11px] text-[var(--ink-muted)] mt-0.5 leading-relaxed">
                        {t.rationale}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* No tenants fallback — still shows useful guidance */}
          {!hasTenants && (
            <div className="px-3 py-2 rounded-md bg-[var(--canvas-subtle,rgba(0,0,0,0.02))] border border-[var(--rule)]/50">
              <div className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] mb-1">
                Next Steps
              </div>
              <p className="text-[11px] text-[var(--ink-muted)] leading-relaxed">
                Specific tenant recommendations require additional market data including household income distribution, traffic counts, and competitive proximity analysis. The void identification above is based on existing business density within the trade area rings.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Rent comp chart ─────────────────────────────────────────────

function RentCompChart({ comps }: { comps: NonNullable<VoidAnalysisData["rent_comps"]> }) {
  const chartData = useMemo(
    () =>
      comps.map((c) => ({
        name: c.type,
        low: c.low,
        mid: c.mid - c.low,
        high: c.high - c.mid,
        displayLow: `$${c.low}`,
        displayMid: `$${c.mid}`,
        displayHigh: `$${c.high}`,
      })),
    [comps],
  );

  const tip = {
    background: "var(--surface, #fff)",
    border: "1px solid var(--rule, #e5e7eb)",
    borderRadius: 6,
    fontSize: 12,
    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
  };

  return (
    <section className="rounded-lg border border-[var(--rule)] overflow-hidden bg-[var(--surface,#fff)]">
      <header className="flex items-center gap-2 px-5 py-3 border-b border-[var(--rule)] bg-[var(--canvas-subtle,rgba(0,0,0,0.025))]">
        <DollarSign className="w-4 h-4 text-[var(--ink-muted)]" strokeWidth={1.5} />
        <div>
          <div className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)]">
            Market Rents
          </div>
          <div className="text-sm font-medium text-[var(--ink)]">
            NNN Asking Rents ($/SF/Year)
          </div>
        </div>
      </header>

      <div className="px-4 py-4" style={{ height: Math.max(200, comps.length * 40) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 4, right: 40, bottom: 4, left: 8 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--rule, #e5e7eb)"
              horizontal={false}
            />
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: "var(--ink-muted, #6b7280)" }}
              axisLine={{ stroke: "var(--rule, #e5e7eb)" }}
              tickLine={false}
              tickFormatter={(v) => `$${v}`}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 11, fill: "var(--ink-muted, #6b7280)" }}
              axisLine={false}
              tickLine={false}
              width={120}
            />
            <Tooltip
              contentStyle={tip}
              formatter={(_v: number, name: string, props: any) => {
                const d = props.payload;
                return [`$${d.low} - $${d.low + d.mid} - $${d.low + d.mid + d.high}/SF`, "Range"];
              }}
            />
            {/* Stacked bars: low | mid | high */}
            <Bar dataKey="low" stackId="rent" fill="#e5e7eb" radius={[3, 0, 0, 3]} maxBarSize={20} />
            <Bar dataKey="mid" stackId="rent" fill="#6b7280" maxBarSize={20} />
            <Bar dataKey="high" stackId="rent" fill="#374151" radius={[0, 3, 3, 0]} maxBarSize={20} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

// ── Competitive supply ──────────────────────────────────────────

function CompetitiveSupply({
  supply,
}: {
  supply: NonNullable<VoidAnalysisData["competitive_supply"]>;
}) {
  const riskColor = {
    high: "text-red-600 bg-red-50",
    moderate: "text-amber-600 bg-amber-50",
    low: "text-green-700 bg-green-50",
  };

  return (
    <section className="rounded-lg border border-[var(--rule)] overflow-hidden bg-[var(--surface,#fff)]">
      <header className="flex items-center gap-2 px-5 py-3 border-b border-[var(--rule)] bg-[var(--canvas-subtle,rgba(0,0,0,0.025))]">
        <TrendingUp className="w-4 h-4 text-[var(--ink-muted)]" strokeWidth={1.5} />
        <div>
          <div className="text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)]">
            Competition
          </div>
          <div className="text-sm font-medium text-[var(--ink)]">
            Competitive Supply Within 3 Miles
          </div>
        </div>
      </header>

      <div className="divide-y divide-[var(--rule)]/50">
        {supply.map((s, i) => (
          <div
            key={i}
            className="px-5 py-2.5 flex items-center gap-3 hover:bg-[var(--canvas-subtle,rgba(0,0,0,0.015))] transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-[var(--ink)] truncate">
                {s.name}
              </div>
              <div className="text-[11px] text-[var(--ink-muted)]">
                {s.distance_mi.toFixed(1)} mi away
                {s.sf_available ? ` | ${s.sf_available.toLocaleString()} SF available` : ""}
              </div>
            </div>
            <span
              className={`text-[10px] font-medium uppercase px-1.5 py-0.5 rounded ${riskColor[s.risk] || riskColor.low}`}
            >
              {s.risk}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
