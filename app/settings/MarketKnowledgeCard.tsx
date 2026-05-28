"use client";

// MarketKnowledgeCard — per-workspace market intelligence that feeds
// into Dante's void analysis and CRE analysis.
//
// This is where the broker (or Drift onboarding) inputs local market
// knowledge: rent ranges, known competitors, demographics, traffic
// counts, zoning nuances, active developments. Dante uses this as
// ground truth during analysis so it doesn't hallucinate or recommend
// businesses that already exist in the trade area.
//
// The content is injected into Dante's system prompt as factual
// context — not behavioral directives.

import { useEffect, useState, useCallback } from "react";
import { MapPin } from "lucide-react";
import TetrisLoading from "@/components/ui/tetris-loader";

const PLACEHOLDER = `Example market intelligence:

Market: Northeast Ohio, Lake County corridor
Primary trade areas: Willoughby, Mentor, Eastlake, Wickliffe

Rent ranges (NNN):
- Inline retail: $12-16/SF
- Restaurant/QSR: $14-18/SF
- Medical office: $18-24/SF
- Second-gen restaurant: $10-14/SF

Key competitors within our coverage area:
- Willoughby Commons (120K SF, mostly occupied, anchored by Giant Eagle)
- Mentor Commons (85K SF, 15% vacancy, losing tenants to SOM Center corridor)
- Great Lakes Mall site (under redevelopment, unclear timeline)

Demographics notes:
- Lake County median HHI ~$78K, skews older (median age 45+)
- Strong daytime population from manufacturing (Lincoln Electric, Lubrizol)
- Population stable but aging — healthcare demand increasing
- Owner-occupancy rate 62%+ (limits turnover but supports services)

Traffic:
- Euclid Ave (US-20): 18,000-24,000 ADT depending on segment
- SOM Center Rd: 12,000 ADT at Euclid intersection
- RT-2 (Lakeland Fwy): 25,000 ADT but limited access points

Known gaps / local intel:
- No urgent care east of SOM Center Road
- Pet services severely underserved in Willoughby proper
- Dental offices clustered on Mentor Ave — void in Willoughby Hills
- Two restaurant closures on Euclid Ave in 2025 (Thai Garden, Arby's)

Zoning notes:
- G-B (General Business) along Euclid Ave — permits most retail/medical
- Willoughby Hills requires conditional use for drive-through
- Eastlake has simplified permitting for medical office conversions`;

const MAX_LEN = 8000;

export default function MarketKnowledgeCard() {
  const [content, setContent] = useState("");
  const [saved, setSaved] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/workspace/market-context")
      .then((r) => r.json())
      .then((d) => {
        setContent(d.market_context || "");
        setSaved(d.market_context || "");
      })
      .finally(() => setLoading(false));
  }, []);

  const isDirty = content !== saved;

  const save = useCallback(async () => {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/workspace/market-context", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ market_context: content }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setStatus(d.error || "Save failed");
      } else {
        setSaved(content);
        setStatus("Saved");
        setTimeout(() => setStatus(null), 2000);
      }
    } catch (e: any) {
      setStatus(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }, [content]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <TetrisLoading size="sm" speed="fast" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Explanation */}
      <div className="rounded-md border border-[var(--rule)] bg-[var(--canvas-subtle)] p-4">
        <div className="flex items-center gap-2 mb-2">
          <MapPin className="w-4 h-4 text-[var(--ink-muted)]" strokeWidth={1.5} />
          <div className="text-xs uppercase tracking-wide text-[var(--ink-subtle)]">
            Market intelligence
          </div>
        </div>
        <div className="text-sm text-[var(--ink)] leading-relaxed">
          Local market knowledge that Dante uses as ground truth during void
          analysis and CRE analysis. This is what an analyst would know about
          your market — rent ranges, competitors, demographics, traffic counts,
          zoning nuances, and known gaps. Different for every market.
        </div>
        <div className="text-xs text-[var(--ink-muted)] mt-2">
          Dante cross-references this against real-time Google Places data
          during every analysis. Having accurate local context here is the
          difference between a credible report and an embarrassing one.
        </div>
      </div>

      {/* Editor */}
      <div className="rounded-md border border-[var(--rule)] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--rule)] bg-[var(--canvas-subtle)]">
          <span className="text-xs text-[var(--ink-muted)]">
            {content.length.toLocaleString()} / {MAX_LEN.toLocaleString()} characters
          </span>
          {isDirty && (
            <span className="text-[10px] mono uppercase tracking-wider text-amber-600">
              Unsaved changes
            </span>
          )}
        </div>
        <textarea
          value={content}
          onChange={(e) => {
            if (e.target.value.length <= MAX_LEN) {
              setContent(e.target.value);
            }
          }}
          placeholder={PLACEHOLDER}
          rows={20}
          className="w-full px-4 py-3 bg-[var(--canvas)] text-[var(--ink)] text-sm font-mono leading-relaxed resize-y focus:outline-none placeholder:text-[var(--ink-subtle)]/40"
          spellCheck={false}
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving || !isDirty}
          className="px-4 py-2 text-sm rounded-md bg-[var(--accent)] text-white hover:opacity-90 transition disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save changes"}
        </button>
        {isDirty && (
          <button
            onClick={() => setContent(saved)}
            disabled={saving}
            className="px-4 py-2 text-sm rounded-md border border-[var(--rule)] text-[var(--ink-muted)] hover:text-[var(--ink)] transition disabled:opacity-50"
          >
            Discard
          </button>
        )}
        {status && (
          <span className={`text-xs ${status === "Saved" ? "text-green-600" : "text-red-600"}`}>
            {status}
          </span>
        )}
      </div>

      {/* Guidance sections */}
      <div className="grid grid-cols-2 gap-3 mt-2">
        <GuidanceCard
          title="Rent ranges"
          items={[
            "NNN asking rents by property type",
            "CAM/taxes ranges if known",
            "Recent lease deal comparables",
            "Which areas are trending up/down",
          ]}
        />
        <GuidanceCard
          title="Competition"
          items={[
            "Major shopping centers + anchors",
            "Vacancy rates by submarket",
            "Active developments or redevelopments",
            "Recent closures or openings",
          ]}
        />
        <GuidanceCard
          title="Demographics"
          items={[
            "Median household income range",
            "Population trends (growing, stable, declining)",
            "Daytime vs residential population",
            "Age and income distribution skews",
          ]}
        />
        <GuidanceCard
          title="Local nuances"
          items={[
            "Zoning restrictions or conditional use rules",
            "Traffic counts on key arterials",
            "Known service gaps or unmet demand",
            "Political/community factors affecting development",
          ]}
        />
      </div>
    </div>
  );
}

function GuidanceCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md border border-[var(--rule)]/50 p-3">
      <div className="text-xs font-medium text-[var(--ink)] mb-1.5">{title}</div>
      <ul className="space-y-0.5">
        {items.map((item, i) => (
          <li key={i} className="text-[11px] text-[var(--ink-muted)] leading-relaxed">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
