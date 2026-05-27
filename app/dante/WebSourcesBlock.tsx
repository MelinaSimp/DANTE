"use client";

// app/dante/WebSourcesBlock.tsx
//
// Perplexity-style web sources panel. The model emits a ```sources
// fenced block with a JSON array of { n, title, url, domain }
// objects. This component renders them as:
//
//   Collapsed: a row of small domain-initial circles + "N sources"
//   Expanded:  a clean list with domain icons, titles, and links
//
// Design closely mirrors Perplexity's source chips — compact,
// scannable, and unobtrusive. Favicon circles use the first letter
// of the domain and a deterministic neutral tone.

import { useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";

export interface WebSource {
  /** 1-based reference number matching inline [1], [2] markers. */
  n: number;
  title: string;
  url: string;
  /** Bare domain — "loopnet.com", "city-data.com", etc. */
  domain: string;
}

export function parseSourcesBlock(raw: string): WebSource[] | null {
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data) || data.length === 0) return null;
    const sources: WebSource[] = [];
    for (const item of data) {
      if (typeof item.url !== "string") continue;
      sources.push({
        n: typeof item.n === "number" ? item.n : sources.length + 1,
        title: typeof item.title === "string" ? item.title : item.domain || item.url,
        url: item.url,
        domain:
          typeof item.domain === "string"
            ? item.domain
            : extractDomain(item.url),
      });
    }
    return sources.length > 0 ? sources : null;
  } catch {
    return null;
  }
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Deterministic neutral colour palette for domain circles —
// cycles through muted grays so every circle looks intentional
// without introducing colour noise into the Drift UI.
const DOMAIN_TONES = [
  "bg-stone-100 text-stone-600 border-stone-200",
  "bg-zinc-100 text-zinc-600 border-zinc-200",
  "bg-slate-100 text-slate-600 border-slate-200",
  "bg-neutral-100 text-neutral-600 border-neutral-200",
  "bg-gray-100 text-gray-600 border-gray-200",
] as const;

function domainTone(domain: string): string {
  let hash = 0;
  for (let i = 0; i < domain.length; i++) {
    hash = ((hash << 5) - hash + domain.charCodeAt(i)) | 0;
  }
  return DOMAIN_TONES[Math.abs(hash) % DOMAIN_TONES.length];
}

function domainInitial(domain: string): string {
  // Strip TLD-like suffixes and take the first letter of the main
  // name segment: "loopnet.com" -> "L", "city-data.com" -> "C"
  const parts = domain.split(".");
  const main = parts.length > 1 ? parts[parts.length - 2] : parts[0];
  return (main?.[0] || "S").toUpperCase();
}

function shortDomain(domain: string): string {
  // "www.loopnet.com" -> "loopnet.com", "city-data.com" -> "city-data"
  const d = domain.replace(/^www\./, "");
  const parts = d.split(".");
  if (parts.length <= 2) return parts[0];
  return parts.slice(0, -1).join(".");
}

export default function WebSourcesBlock({ sources }: { sources: WebSource[] }) {
  const [open, setOpen] = useState(false);

  // De-duplicate by domain for the preview circles
  const seenDomains = new Set<string>();
  const uniqueByDomain = sources.filter((s) => {
    if (seenDomains.has(s.domain)) return false;
    seenDomains.add(s.domain);
    return true;
  });

  return (
    <div className="mt-5">
      {/* Collapsed pill — domain circles + count */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-full border border-[var(--rule)] px-3 py-1.5 hover:bg-[var(--canvas-subtle)] transition"
      >
        <span className="flex -space-x-1.5">
          {uniqueByDomain.slice(0, 5).map((s) => (
            <span
              key={s.domain}
              className={`w-5 h-5 rounded-full border-2 border-[var(--canvas)] flex items-center justify-center text-[9px] font-semibold ${domainTone(s.domain)}`}
              title={s.domain}
            >
              {domainInitial(s.domain)}
            </span>
          ))}
          {uniqueByDomain.length > 5 && (
            <span className="w-5 h-5 rounded-full bg-[var(--canvas-subtle)] border-2 border-[var(--canvas)] flex items-center justify-center text-[9px] font-medium text-[var(--ink-subtle)]">
              +{uniqueByDomain.length - 5}
            </span>
          )}
        </span>
        <span className="text-xs text-[var(--ink-muted)]">
          {sources.length} source{sources.length === 1 ? "" : "s"}
        </span>
        {open ? (
          <ChevronDown className="w-3 h-3 text-[var(--ink-subtle)]" />
        ) : (
          <ChevronRight className="w-3 h-3 text-[var(--ink-subtle)]" />
        )}
      </button>

      {/* Expanded list */}
      {open && (
        <div className="mt-2 glass-card rounded-lg p-3 space-y-1">
          {sources.map((s) => (
            <a
              key={s.n}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2.5 px-2 py-2 -mx-1 rounded-md hover:bg-[var(--neu-hover)] transition group"
            >
              <span
                className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-semibold shrink-0 mt-0.5 ${domainTone(s.domain)}`}
              >
                {domainInitial(s.domain)}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-[var(--ink)] truncate group-hover:underline">
                  {s.title}
                </div>
                <div className="text-[10px] text-[var(--ink-subtle)] truncate flex items-center gap-1">
                  {shortDomain(s.domain)}
                  <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition" />
                </div>
              </div>
              <span className="text-[10px] font-medium text-[var(--ink-subtle)] bg-[var(--canvas-subtle)] rounded px-1.5 py-0.5 shrink-0">
                {s.n}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
