// app/features/page.tsx
// Public-facing features + pricing page for driftai.studio.
// CRE-vertical positioning: lease abstraction, deal intelligence,
// parcel analytics, autonomous workflows.

import { Metadata } from "next";
import Link from "next/link";
import {
  Check,
  FileText,
  Brain,
  MapPin,
  Workflow,
  Shield,
  Phone,
  Building2,
  ArrowRight,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Features & Pricing - Drift AI",
  description:
    "AI-powered deal intelligence for commercial real estate. Lease abstraction, parcel analytics, autonomous workflows, and citation-grounded search.",
};

const CAPABILITIES = [
  {
    icon: FileText,
    title: "Lease abstraction",
    body: "Upload a lease PDF and get structured extraction of tenant, rent, escalations, CAM, TI, options, and co-tenancy clauses. Cited to exact page and paragraph.",
    bullets: [
      "NNN, gross, ground, and percentage rent",
      "Escalation schedules and CPI bumps",
      "Co-tenancy and exclusivity clauses",
      "Export to Excel or push to your CRM",
    ],
  },
  {
    icon: Brain,
    title: "Deal intelligence",
    body: "Dante, your AI analyst, searches your vault, public records, and market data to answer underwriting questions with citations.",
    bullets: [
      "Citation-grounded answers from your documents",
      "SEC filings, press releases, regulatory briefs",
      "Comparable rent and sale analysis",
      "Memory that grows with every conversation",
    ],
  },
  {
    icon: MapPin,
    title: "Parcel analytics",
    body: "39-state GIS coverage for parcel-level zoning, assessed value, ownership, tax, and acreage. Void analysis finds gaps in a trade area.",
    bullets: [
      "Zoning class, land use, and overlay districts",
      "Assessed and market value lookups",
      "Void analysis for retail and industrial gaps",
      "Owner name and sale history",
    ],
  },
  {
    icon: Workflow,
    title: "Autonomous workflows",
    body: "Build multi-step automations that monitor lease expirations, generate reports, send alerts, and delegate sub-tasks to specialist agents.",
    bullets: [
      "Natural-language workflow builder",
      "Cron, webhook, and event triggers",
      "Sub-agent delegation for complex tasks",
      "Supervisor queue for human-in-the-loop",
    ],
  },
  {
    icon: Phone,
    title: "Voice AI",
    body: "Inbound call handling for your brokerage. Dante answers, qualifies the caller, books meetings, and logs the transcript to the contact timeline.",
    bullets: [
      "24/7 call answering with natural voice",
      "Caller qualification and routing",
      "Meeting booking via calendar integration",
      "Full transcript in the contact record",
    ],
  },
  {
    icon: Shield,
    title: "Compliance and privacy",
    body: "SOC 2 in progress via EasyAudit. Local-only processing mode runs models on-device so content never leaves the laptop.",
    bullets: [
      "SOC 2 Type II in progress",
      "Local-only mode with on-device Hermes 3",
      "BYOK encryption (Enterprise)",
      "Compliance export and audit trail",
    ],
  },
];

const TIERS = [
  {
    name: "Starter",
    price: "$300",
    period: "/mo",
    description: "Solo brokers and agents getting started with AI-assisted deal work.",
    features: [
      "Dante AI assistant with citations",
      "Lease abstraction (upload and extract)",
      "Vault document storage and search",
      "Contact and property CRM",
      "Basic workflow automations",
      "39-state parcel lookups",
      "Email and chat support",
      "1 seat included",
    ],
    cta: "Get started",
    highlight: false,
  },
  {
    name: "Pro",
    price: "$800",
    period: "/mo",
    description: "Small firms running autonomous agents and advanced deal workflows.",
    features: [
      "Everything in Starter",
      "Advanced workflows with agent nodes",
      "Autonomous agents with supervisor queue",
      "MCP server integrations",
      "Void analysis and site scanning",
      "Voice AI inbound call handling",
      "Priority support",
      "Up to 5 seats",
    ],
    cta: "Get started",
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "$1,500+",
    period: "/mo",
    description: "Large brokerages and developers with compliance, SSO, and dedicated support.",
    features: [
      "Everything in Pro",
      "SSO / SAML and SCIM provisioning",
      "BYOK encryption",
      "Compliance export and audit trail",
      "Public API access",
      "Data residency selection",
      "Dedicated CSM and SLA",
      "Unlimited seats",
    ],
    cta: "Contact sales",
    highlight: false,
  },
];

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      {/* Nav */}
      <div className="border-b border-[var(--rule)]">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2 group">
            <img
              src="/brand/logo-circle.png"
              alt="Drift"
              className="w-6 h-6 rounded-full object-cover"
            />
            <span className="text-base font-medium text-[var(--ink)]">Drift</span>
          </Link>
          <nav className="flex items-center gap-5 text-sm text-[var(--ink-muted)]">
            <Link href="/features#pricing" className="hover:text-[var(--ink)] transition">Pricing</Link>
            <Link href="/download" className="hover:text-[var(--ink)] transition">Download</Link>
            <Link href="/auth" className="hover:text-[var(--ink)] transition">Sign in</Link>
          </nav>
        </div>
      </div>

      {/* Hero */}
      <div className="max-w-6xl mx-auto px-6 pt-20 pb-16 text-center">
        <p className="label-section text-[var(--accent)]">CRE deal intelligence</p>
        <h1 className="heading-display text-5xl md:text-6xl mt-4 max-w-3xl mx-auto">
          AI that understands commercial real estate
        </h1>
        <p className="mt-6 text-lg text-[var(--ink-muted)] max-w-2xl mx-auto">
          Lease abstraction, parcel analytics, citation-grounded search, and
          autonomous workflows -- built for brokers, developers, and asset managers.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link
            href="/auth"
            className="inline-flex items-center gap-2 bg-[var(--ink)] text-[var(--canvas)] px-6 py-3 rounded-[4px] text-sm font-medium hover:opacity-90 transition"
          >
            Get started
            <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
          </Link>
          <a
            href="mailto:driftaillc@gmail.com"
            className="inline-flex items-center gap-2 border border-[var(--rule-strong)] px-6 py-3 rounded-[4px] text-sm font-medium hover:bg-[var(--canvas-subtle)] transition"
          >
            Talk to us
          </a>
        </div>
      </div>

      {/* Capabilities */}
      <div className="max-w-6xl mx-auto px-6 py-16">
        <p className="label-section text-[var(--ink-subtle)] text-center">Capabilities</p>
        <h2 className="heading-display text-3xl md:text-4xl mt-3 text-center">
          Everything your deal team needs
        </h2>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mt-12">
          {CAPABILITIES.map((cap) => {
            const Icon = cap.icon;
            return (
              <div key={cap.title} className="card-flat p-6 flex flex-col">
                <div className="w-10 h-10 border border-[var(--rule-strong)] rounded-[4px] flex items-center justify-center">
                  <Icon className="w-5 h-5 text-[var(--ink)]" strokeWidth={1.5} />
                </div>
                <h3 className="heading-display text-xl mt-5">{cap.title}</h3>
                <p className="mt-2 text-sm text-[var(--ink-muted)] flex-1">
                  {cap.body}
                </p>
                <ul className="mt-4 space-y-1.5">
                  {cap.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2 text-sm text-[var(--ink)]">
                      <Check className="w-3.5 h-3.5 text-[var(--accent)] mt-0.5 shrink-0" strokeWidth={2} />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pricing */}
      <div className="max-w-6xl mx-auto px-6 py-16" id="pricing">
        <p className="label-section text-[var(--ink-subtle)] text-center">Pricing</p>
        <h2 className="heading-display text-3xl md:text-4xl mt-3 text-center">
          Straightforward pricing
        </h2>
        <p className="mt-4 text-sm text-[var(--ink-muted)] text-center max-w-xl mx-auto">
          No per-query fees, no hidden metering. Pick a tier, get full access to the
          capabilities in that tier. Additional seats $500/mo each.
        </p>

        <div className="grid md:grid-cols-3 gap-4 mt-12">
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              className={`card-flat p-6 flex flex-col ${
                tier.highlight
                  ? "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--canvas)]"
                  : ""
              }`}
            >
              {tier.highlight && (
                <span className="label-section text-[var(--accent)] mb-3">
                  Most popular
                </span>
              )}
              <h3 className="heading-display text-2xl">{tier.name}</h3>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="heading-display text-4xl">{tier.price}</span>
                <span className="text-sm text-[var(--ink-muted)]">{tier.period}</span>
              </div>
              <p className="mt-3 text-sm text-[var(--ink-muted)] flex-1">
                {tier.description}
              </p>
              <ul className="mt-6 space-y-2">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-[var(--ink)]">
                    <Check className="w-3.5 h-3.5 text-[var(--accent)] mt-0.5 shrink-0" strokeWidth={2} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              {tier.name === "Enterprise" ? (
                <a
                  href="mailto:driftaillc@gmail.com"
                  className="mt-6 flex items-center justify-center gap-2 border border-[var(--rule-strong)] px-4 py-2.5 rounded-[4px] text-sm font-medium hover:bg-[var(--canvas-subtle)] transition"
                >
                  {tier.cta}
                </a>
              ) : (
                <Link
                  href="/auth"
                  className={`mt-6 flex items-center justify-center gap-2 px-4 py-2.5 rounded-[4px] text-sm font-medium transition ${
                    tier.highlight
                      ? "bg-[var(--accent)] text-white hover:opacity-90"
                      : "bg-[var(--ink)] text-[var(--canvas)] hover:opacity-90"
                  }`}
                >
                  {tier.cta}
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Coverage */}
      <div className="max-w-6xl mx-auto px-6 py-16">
        <p className="label-section text-[var(--ink-subtle)] text-center">Coverage</p>
        <h2 className="heading-display text-3xl md:text-4xl mt-3 text-center">
          39-state parcel data
        </h2>
        <p className="mt-4 text-sm text-[var(--ink-muted)] text-center max-w-xl mx-auto">
          GIS-level parcel data for zoning, assessed value, ownership, and tax lookups.
          Void analysis and listing search work nationwide via Google Places and listing APIs.
        </p>
        <div className="card-flat p-6 mt-8">
          <div className="flex flex-wrap gap-2 justify-center">
            {[
              "AL", "AR", "AZ", "CA", "CO", "CT", "FL", "GA", "IA", "IL",
              "IN", "KS", "KY", "LA", "MA", "MD", "MI", "MN", "MO", "MS",
              "MT", "NC", "NE", "NH", "NJ", "NM", "NV", "NY", "OH", "OK",
              "OR", "PA", "SC", "TN", "TX", "UT", "VA", "WA", "WI",
            ].map((st) => (
              <span
                key={st}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] bg-[var(--canvas-subtle)] text-sm font-mono font-medium text-[var(--ink)]"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                {st}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="max-w-6xl mx-auto px-6 py-16 text-center">
        <Building2 className="w-10 h-10 text-[var(--ink-subtle)] mx-auto mb-4" strokeWidth={1} />
        <h2 className="heading-display text-3xl md:text-4xl">
          Built for commercial real estate
        </h2>
        <p className="mt-4 text-sm text-[var(--ink-muted)] max-w-lg mx-auto">
          Drift is purpose-built for CRE brokers, developers, and asset managers.
          Not a generic AI tool with a real estate template bolted on.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link
            href="/download"
            className="inline-flex items-center gap-2 bg-[var(--ink)] text-[var(--canvas)] px-6 py-3 rounded-[4px] text-sm font-medium hover:opacity-90 transition"
          >
            Download the desktop app
          </Link>
          <a
            href="mailto:driftaillc@gmail.com"
            className="text-sm text-[var(--accent)] hover:underline underline-offset-2"
          >
            driftaillc@gmail.com
          </a>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-[var(--rule)]">
        <div className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between text-xs text-[var(--ink-subtle)]">
          <span>Drift AI LLC</span>
          <nav className="flex items-center gap-4">
            <Link href="/terms" className="hover:text-[var(--ink)] transition">Terms</Link>
            <Link href="/privacy" className="hover:text-[var(--ink)] transition">Privacy</Link>
            <Link href="/status" className="hover:text-[var(--ink)] transition">Status</Link>
          </nav>
        </div>
      </div>
    </div>
  );
}
