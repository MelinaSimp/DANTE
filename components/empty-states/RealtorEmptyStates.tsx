// components/empty-states/RealtorEmptyStates.tsx
//
// Phase 3+ panel fix #8 — first-login realtor surfaces.
//
// Tomás: "A realtor's first login still feels advisor-shaped."
//
// Each export here renders a vertical-native empty state for a
// surface a brand-new realtor workspace will hit. They share a
// visual chassis (icon + headline + body + 2 actions) so the
// feel is consistent across surfaces.
//
// Pairs with the equivalents the advisor dashboard already has;
// future work consolidates both verticals into one parameterized
// component once the vertical-spec.ts copy field set is fleshed
// out for empty-state strings.

"use client";

import Link from "next/link";
import {
  Home,
  Users,
  Calendar,
  FileText,
  ArrowRight,
  Upload,
} from "lucide-react";

interface EmptyStateProps {
  primary: { label: string; href: string };
  secondary?: { label: string; href: string };
}

function Chassis({
  icon,
  eyebrow,
  headline,
  body,
  primary,
  secondary,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  headline: string;
  body: string;
} & EmptyStateProps) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-16 max-w-xl mx-auto">
      <div className="rounded-full bg-[var(--canvas-subtle)] border border-[var(--rule)] p-3 mb-5">
        {icon}
      </div>
      <div className="text-[10px] tracking-[0.16em] uppercase text-[var(--ink-subtle)] mb-2">
        {eyebrow}
      </div>
      <h2 className="font-display text-[28px] leading-[1.15] text-[var(--ink)] mb-3">
        {headline}
      </h2>
      <p className="text-sm text-[var(--ink-muted)] leading-relaxed mb-7 max-w-md">
        {body}
      </p>
      <div className="flex items-center gap-3">
        <Link
          href={primary.href}
          className="inline-flex items-center gap-1.5 bg-[var(--ink)] text-[var(--canvas)] px-4 py-2 text-sm font-medium rounded-[4px] hover:opacity-90 transition"
        >
          {primary.label}
          <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.5} />
        </Link>
        {secondary && (
          <Link
            href={secondary.href}
            className="inline-flex items-center text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
          >
            {secondary.label}
          </Link>
        )}
      </div>
    </div>
  );
}

// ── Per-surface empty states ─────────────────────────────────────

export function RealtorListingsEmpty() {
  return (
    <Chassis
      icon={<Home className="w-5 h-5 text-[var(--ink-muted)]" strokeWidth={1.5} />}
      eyebrow="No active listings"
      headline="Your pipeline starts with a listing."
      body="Add a property you're representing — Dante reads the listing agreement, MLS sheet, and disclosures and answers questions like 'what's the exclusivity term' with a citation back to the document."
      primary={{ label: "Add a listing", href: "/properties/new" }}
      secondary={{ label: "Connect MLS (coming soon)", href: "/settings/integrations" }}
    />
  );
}

export function RealtorBuyersEmpty() {
  return (
    <Chassis
      icon={<Users className="w-5 h-5 text-[var(--ink-muted)]" strokeWidth={1.5} />}
      eyebrow="No buyers yet"
      headline="Add a buyer Dante can prep you for."
      body="Once a buyer is in the workspace, every showing recap, every email, every preference goes into Dante's memory — so 'prep me for my 2pm with the Marlows' becomes a one-line ask, not a ten-minute hunt."
      primary={{ label: "Add a buyer", href: "/contacts/new" }}
      secondary={{ label: "Import from CSV", href: "/contacts/import" }}
    />
  );
}

export function RealtorToursEmpty() {
  return (
    <Chassis
      icon={<Calendar className="w-5 h-5 text-[var(--ink-muted)]" strokeWidth={1.5} />}
      eyebrow="No tours scheduled"
      headline="Schedule a showing."
      body="Tours sync with your calendar. After each one, Dante drafts the recap email — fair-housing-scanned and citation-grounded against the buyer's preferences in memory."
      primary={{ label: "Schedule a tour", href: "/appointments/new?kind=tour" }}
      secondary={{ label: "Connect Google Calendar", href: "/settings/integrations" }}
    />
  );
}

export function RealtorVaultEmpty() {
  return (
    <Chassis
      icon={<FileText className="w-5 h-5 text-[var(--ink-muted)]" strokeWidth={1.5} />}
      eyebrow="Vault is empty"
      headline="Upload your first listing agreement."
      body="Dante reads the documents you upload — listing agreements, buyer-broker agreements, leases, disclosures, MLS sheets — and cites them by name and page when you ask. Page numbers are verified; quotes are checked against the source."
      primary={{ label: "Upload a document", href: "/dante/archive?upload=1" }}
      secondary={{ label: "See what's supported", href: "/help/vault" }}
    />
  );
}

export function RealtorPipelineEmpty() {
  return (
    <Chassis
      icon={<Upload className="w-5 h-5 text-[var(--ink-muted)]" strokeWidth={1.5} />}
      eyebrow="Pipeline is empty"
      headline="No leads, listings, offers, or closings yet."
      body="Drift's pipeline view aggregates everything you're working on — leads to follow up, listings going stale, offers expiring, closings approaching. Add a buyer or listing to populate it."
      primary={{ label: "Add a buyer", href: "/contacts/new" }}
      secondary={{ label: "Add a listing", href: "/properties/new" }}
    />
  );
}
