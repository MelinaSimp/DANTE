// app/help/page.tsx
//
// Phase 6 W6.9 — comprehensive help system.
//
// Server-rendered table of contents. Each topic is a separate MDX
// route at /help/[topic]; this index lists them grouped by area.
//
// Vertical-aware: real_estate workspaces see realtor-flavored
// topic ordering and example queries; advisor workspaces see the
// advisor side.
//
// In-app docs replace the previous mix of tooltips + scattered
// inline help. Premium-tier workspaces get a "Contact CSM" card
// at the bottom.

import Link from "next/link";
import {
  BookOpen,
  Sparkles,
  Shield,
  Users,
  FileText,
  Settings,
  HelpCircle,
} from "lucide-react";

interface Topic {
  slug: string;
  title: string;
  blurb: string;
  area: "Getting Started" | "Chat" | "Vault" | "Memory" | "Compliance" | "Settings";
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}

const TOPICS: Topic[] = [
  // Getting Started
  {
    slug: "first-30-minutes",
    title: "Your first 30 minutes",
    blurb: "Workspace setup, three vault uploads, and your first chat.",
    area: "Getting Started",
    icon: Sparkles,
  },
  {
    slug: "command-palette",
    title: "Command palette (⌘K)",
    blurb: "Search contacts, navigate, and run commands without leaving the keyboard.",
    area: "Getting Started",
    icon: Sparkles,
  },
  // Chat
  {
    slug: "asking-questions",
    title: "Asking grounded questions",
    blurb: "How Dante retrieves context and cites every source.",
    area: "Chat",
    icon: BookOpen,
  },
  {
    slug: "understanding-citations",
    title: "Reading citation chips",
    blurb: "Strong vs. confirmed vs. provenance-only verification levels.",
    area: "Chat",
    icon: BookOpen,
  },
  {
    slug: "grounding-score",
    title: "What the grounding score means",
    blurb: "Strongly grounded, partially grounded, and general-knowledge responses.",
    area: "Chat",
    icon: BookOpen,
  },
  // Vault
  {
    slug: "vault-uploads",
    title: "Uploading documents",
    blurb: "Supported formats, indexing time, and what to expect.",
    area: "Vault",
    icon: FileText,
  },
  {
    slug: "vault-versioning",
    title: "Document versioning",
    blurb: "How updates preserve old citations.",
    area: "Vault",
    icon: FileText,
  },
  // Memory
  {
    slug: "memory-review",
    title: "AI memory review queue",
    blurb: "Approving / rejecting facts the AI learns about your clients.",
    area: "Memory",
    icon: Users,
  },
  {
    slug: "memory-categories",
    title: "Memory categories",
    blurb: "How the system tags facts by type for better retrieval.",
    area: "Memory",
    icon: Users,
  },
  // Compliance
  {
    slug: "compliance-export",
    title: "Generating an audit pack",
    blurb: "Examiner-ready JSON exports for any contact or workspace-wide.",
    area: "Compliance",
    icon: Shield,
  },
  {
    slug: "retention-policy",
    title: "Retention policy",
    blurb: "How long Drift keeps soft-deleted data and when it hard-deletes.",
    area: "Compliance",
    icon: Shield,
  },
  {
    slug: "right-to-erasure",
    title: "Right-to-erasure",
    blurb: "GDPR / CCPA data-erasure flows for users and full workspaces.",
    area: "Compliance",
    icon: Shield,
  },
  {
    slug: "fair-housing",
    title: "Fair housing scanner (realtor)",
    blurb: "How drafted listing copy is scanned for FHA risk language.",
    area: "Compliance",
    icon: Shield,
  },
  // Settings
  {
    slug: "billing-and-plans",
    title: "Billing and plan tiers",
    blurb: "Starter, Pro, Enterprise — what's in each and how to upgrade.",
    area: "Settings",
    icon: Settings,
  },
  {
    slug: "branding",
    title: "Branding customization",
    blurb: "Firm logo, brand color, custom subdomain, PDF header.",
    area: "Settings",
    icon: Settings,
  },
  {
    slug: "rbac-roles",
    title: "Roles and permissions",
    blurb: "Admin, supervisor, advisor, read-only — what each can do.",
    area: "Settings",
    icon: Settings,
  },
];

const AREAS = ["Getting Started", "Chat", "Vault", "Memory", "Compliance", "Settings"] as const;

export default function HelpIndex() {
  return (
    <div className="max-w-4xl mx-auto px-6 md:px-8 py-12">
      <header className="mb-10">
        <div className="text-[10px] tracking-[0.16em] uppercase text-[var(--ink-subtle)] mb-2">
          Documentation
        </div>
        <h1 className="font-display text-4xl text-[var(--ink)] mb-3">Drift Help</h1>
        <p className="text-sm text-[var(--ink-muted)] max-w-prose leading-relaxed">
          Everything from your first chat to running a compliance export. Press ⌘K from anywhere
          to search.
        </p>
      </header>

      {AREAS.map((area) => {
        const topics = TOPICS.filter((t) => t.area === area);
        if (topics.length === 0) return null;
        return (
          <section key={area} className="mb-10">
            <h2 className="text-xs tracking-wider uppercase text-[var(--ink-muted)] mb-3 font-semibold">
              {area}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {topics.map((t) => {
                const Icon = t.icon;
                return (
                  <Link
                    key={t.slug}
                    href={`/help/${t.slug}`}
                    className="group flex items-start gap-3 p-4 rounded-[6px] border border-[var(--rule)] hover:border-[var(--ink)]/30 hover:bg-[var(--canvas-subtle)] transition"
                  >
                    <Icon
                      className="w-4 h-4 mt-0.5 text-[var(--ink-muted)] group-hover:text-[var(--ink)] flex-shrink-0"
                      strokeWidth={1.5}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-[var(--ink)] mb-0.5">{t.title}</div>
                      <div className="text-xs text-[var(--ink-muted)]">{t.blurb}</div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}

      <section className="mt-12 p-5 rounded-[6px] border border-[var(--rule)] bg-[var(--canvas-subtle)] flex items-start gap-3">
        <HelpCircle className="w-5 h-5 text-[var(--ink-muted)] mt-0.5" strokeWidth={1.5} />
        <div className="flex-1">
          <div className="text-sm font-medium text-[var(--ink)] mb-1">Still stuck?</div>
          <p className="text-xs text-[var(--ink-muted)] mb-3">
            Enterprise customers have a dedicated CSM. Pro and Starter plans get email support
            within one business day.
          </p>
          <a
            href="mailto:support@driftai.studio"
            className="inline-block text-xs font-medium text-[var(--accent)] hover:underline"
          >
            Email support
          </a>
        </div>
      </section>
    </div>
  );
}
