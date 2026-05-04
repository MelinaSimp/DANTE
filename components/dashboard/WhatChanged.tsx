"use client";

// components/dashboard/WhatChanged.tsx
//
// "Since you were last here" — the panel above the dashboard hero.
// Shows the work-units that need the advisor today: drafts in their
// queue, households due for review, OBA attestations, new compliance
// flags, AI-memories awaiting approval, workflows that fired.
//
// Design intent (per panel review of older-RIA audience):
//   • Big, plain language. No icons-as-labels, no clever copy. Each
//     section header is a sentence, not a noun phrase.
//   • Auto-hides when nothing demands attention — no empty state,
//     because an empty state on the dashboard hero feels like the
//     product is broken.
//   • Memo-shaped, not chat-shaped. Each row is a clickable line;
//     the whole component reads top-to-bottom like a one-page
//     briefing.
//   • Drilling-in is the only interaction. No inline actions, no
//     hover states beyond the link affordance. Older advisors won't
//     discover hover-only menus.
//
// The data is fetched from /api/dante/since-last-login. That route
// also bumps last_seen_at as a side effect, so the next render
// shows only newer items in the time-scoped groups.

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

type Group = {
  kind: string;
  title: string;
  count: number;
  href?: string;
  /** Optional secondary action surfaced as a button in the group
   *  header. Used today by regulatory_updates to offer "Ask Dante
   *  what these mean for my book" — clicking dispatches the
   *  drift:open-ask CustomEvent with ask_prompt as the seed. */
  action?: {
    label: string;
    ask_prompt: string;
  };
  items: Array<{
    id: string;
    label: string;
    sublabel?: string | null;
    when?: string | null;
    href?: string;
  }>;
};

type Payload = {
  since: string | null;
  is_first_visit: boolean;
  groups: Group[];
};

async function fetchSinceLastLogin(): Promise<Payload> {
  const res = await fetch("/api/dante/since-last-login", {
    credentials: "include",
  });
  if (!res.ok) throw new Error("since-last-login load failed");
  return (await res.json()) as Payload;
}

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / 86400_000);
  if (diffDays > 0) {
    if (diffDays === 1) return "tomorrow";
    if (diffDays < 7) return `in ${diffDays} days`;
    if (diffDays < 14) return `next week`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  if (diffDays < 0) {
    const ago = -diffDays;
    if (ago === 1) return "yesterday";
    if (ago < 7) return `${ago} days ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  // same day
  const diffHours = Math.round(diffMs / 3_600_000);
  if (diffHours === 0) return "just now";
  if (diffHours > 0) return `in ${diffHours}h`;
  return `${-diffHours}h ago`;
}

function formatSince(iso: string | null): string {
  if (!iso) return "your first visit";
  const d = new Date(iso);
  const now = new Date();
  const diffHours = (now.getTime() - d.getTime()) / 3_600_000;
  if (diffHours < 24) {
    return `your last visit (${d.toLocaleString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    })} today)`;
  }
  if (diffHours < 48) {
    return "yesterday";
  }
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

export default function WhatChanged() {
  const { data, isLoading, error } = useQuery<Payload, Error>({
    queryKey: ["dante", "since-last-login"],
    queryFn: fetchSinceLastLogin,
    // Don't auto-refresh aggressively; this is a session-start surface.
    staleTime: 60_000,
  });

  // Loading / error states are deliberately silent. The dashboard
  // hero rendering should never block on this panel.
  if (isLoading || error || !data) return null;

  const visibleGroups = data.groups.filter((g) => g.items.length > 0);

  // When everything is genuinely quiet, render a small reassurance
  // line instead of nothing. The earlier behavior (return null) was
  // hostile to verification and to the user — a quiet morning is a
  // win, not an absence. Diane should see "All caught up" and feel
  // good about closing the laptop, not wonder if the page broke.
  if (visibleGroups.length === 0) {
    return (
      <section
        aria-label="Since you were last here"
        className="mb-12 border border-[var(--rule)] rounded-md overflow-hidden bg-[var(--surface,#fff)]"
      >
        <div className="px-6 md:px-8 py-5">
          <div className="label-section mb-1">
            Since {formatSince(data.since)}
          </div>
          <h2 className="heading-display text-2xl md:text-3xl">
            All caught up.
          </h2>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">
            No drafts waiting on you, no reviews due in the next week, no
            new flags. Anything that comes in will land here.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Since you were last here"
      className="mb-12 border border-[var(--rule)] rounded-md overflow-hidden bg-[var(--surface,#fff)]"
    >
      <header className="px-6 md:px-8 py-5 border-b border-[var(--rule)] bg-[var(--canvas)]">
        <div className="label-section mb-1">
          Since {formatSince(data.since)}
        </div>
        <h2 className="heading-display text-2xl md:text-3xl">
          {totalLabel(visibleGroups)}
        </h2>
      </header>

      <ul className="divide-y divide-[var(--rule)]">
        {visibleGroups.map((g) => (
          <li key={g.kind} className="px-6 md:px-8 py-5">
            <div className="flex items-baseline justify-between gap-4 mb-3">
              <h3 className="text-base md:text-lg font-medium text-[var(--ink)]">
                {g.title}
                <span className="ml-2 text-sm text-[var(--ink-muted)]">
                  ({g.count})
                </span>
              </h3>
              <div className="flex items-baseline gap-3 shrink-0">
                {g.action && (
                  <button
                    type="button"
                    onClick={() =>
                      window.dispatchEvent(
                        new CustomEvent("drift:open-ask", {
                          detail: { prompt: g.action!.ask_prompt },
                        }),
                      )
                    }
                    className="text-sm font-medium text-[var(--accent,#2563eb)] hover:underline"
                  >
                    {g.action.label} →
                  </button>
                )}
                {g.href && g.count > g.items.length && (
                  <Link
                    href={g.href}
                    className="text-sm text-[var(--accent)] hover:underline"
                  >
                    See all {g.count} →
                  </Link>
                )}
              </div>
            </div>
            <ul className="space-y-2">
              {g.items.map((item) => {
                const inner = (
                  <div className="flex items-baseline justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-[15px] text-[var(--ink)] truncate">
                        {item.label}
                      </div>
                      {item.sublabel && (
                        <div className="text-sm text-[var(--ink-muted)] truncate">
                          {item.sublabel}
                        </div>
                      )}
                    </div>
                    {item.when && (
                      <div className="text-sm text-[var(--ink-muted)] shrink-0 tabular-nums">
                        {formatRelative(item.when)}
                      </div>
                    )}
                  </div>
                );
                // External links (regulatory source URLs) open in a
                // new tab. Internal hrefs (`/contact/...`,
                // `/properties/...`) use Next's Link for client-side
                // nav. Heuristic: starts with http(s):// → external.
                const isExternal =
                  item.href !== undefined && /^https?:\/\//i.test(item.href);
                return (
                  <li key={item.id}>
                    {item.href ? (
                      isExternal ? (
                        <a
                          href={item.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block py-1 -my-1 px-2 -mx-2 rounded hover:bg-[var(--canvas)] transition-colors"
                        >
                          {inner}
                        </a>
                      ) : (
                        <Link
                          href={item.href}
                          className="block py-1 -my-1 px-2 -mx-2 rounded hover:bg-[var(--canvas)] transition-colors"
                        >
                          {inner}
                        </Link>
                      )
                    ) : (
                      <div className="py-1 px-2">{inner}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

function totalLabel(groups: Group[]): string {
  const total = groups.reduce((acc, g) => acc + g.count, 0);
  if (total === 0) return "Caught up.";
  if (total === 1) return "1 thing needs you";
  return `${total} things need you`;
}
