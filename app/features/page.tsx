// app/features/page.tsx
// Public-facing features + pricing page for driftai.studio.
// Horizontal positioning: anyone can build AI agents, voice
// assistants, and workflows on a low-hallucination LLM.

import { Metadata } from "next";
import Link from "next/link";
import {
  Check,
  Bot,
  Phone,
  ShieldCheck,
  Workflow,
  Shield,
  Sparkles,
  ArrowRight,
  Layers,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Features & Pricing - Dante",
  description:
    "Build AI agents, voice assistants, and workflows on a powerful, low-hallucination LLM. Citation-grounded answers you can trust — for anyone, no code required.",
  openGraph: {
    title: "Features & Pricing - Dante",
    description:
      "AI agents, voice, and workflows on a low-hallucination LLM. Citation-grounded, accurate, and built for anyone.",
    url: "https://driftai.studio/features",
  },
};

const CAPABILITIES = [
  {
    icon: Bot,
    title: "AI agents",
    body: "Build AI agents that read your documents, cite their sources, and take action — deployed in minutes, no code required. Describe what you want in plain English and Dante builds the agent for you.",
    bullets: [
      "Build by chatting — no code, no config",
      "Agents that search your files and cite every answer",
      "Tools, skills, and MCP integrations built in",
      "Memory that grows with every conversation",
    ],
  },
  {
    icon: Phone,
    title: "Voice",
    body: "Give any agent a voice. It answers your phone, makes outbound calls, qualifies leads, and books meetings — 24/7, in a natural voice, grounded in your data.",
    bullets: [
      "Inbound and outbound phone agents",
      "Natural, low-latency conversation",
      "Live transcripts and call summaries",
      "Hand off to a human whenever it matters",
    ],
  },
  {
    icon: Workflow,
    title: "Workflows",
    body: "Build multi-step automations that monitor events, generate reports, send alerts, and delegate sub-tasks to specialist agents — all from a natural-language builder.",
    bullets: [
      "Natural-language workflow builder",
      "Cron, webhook, and event triggers",
      "Sub-agent delegation for complex tasks",
      "Supervisor queue for human-in-the-loop",
    ],
  },
  {
    icon: ShieldCheck,
    title: "Low-hallucination LLM",
    body: "A powerful language model tuned for accuracy. Every answer is grounded in your sources and cited back to the exact document, page, and paragraph — so you can trust what it tells you.",
    bullets: [
      "Answers grounded in your own data",
      "Citations back to the exact source",
      "Inconsistency detection across documents",
      "Says \"I don't know\" instead of guessing",
    ],
  },
  {
    icon: Layers,
    title: "Data aggregation",
    body: "One place to ask questions across all your data — internal files, web sources, and third-party feeds. Dante searches everything and cites every answer back to its source.",
    bullets: [
      "Drag-and-drop document ingestion into the vault",
      "Watched folders for automatic file sync",
      "Web search and public-record lookups built in",
      "Provenance tagging on every answer",
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
    description: "Individuals and small teams getting started with AI agents.",
    features: [
      "Dante AI assistant with citations",
      "Build agents by chatting — no code",
      "Vault document storage and search",
      "Contact management built in",
      "Basic workflow automations",
      "One voice agent included",
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
    description: "Teams running autonomous agents, voice, and advanced workflows.",
    features: [
      "Everything in Starter",
      "Advanced workflows with agent nodes",
      "Autonomous agents with supervisor queue",
      "Inbound and outbound voice agents",
      "MCP server integrations",
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
    description: "Organizations with compliance, SSO, and dedicated support needs.",
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

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Dante",
  applicationCategory: "BusinessApplication",
  operatingSystem: "macOS",
  description:
    "Build AI agents, voice assistants, and workflows on a powerful, low-hallucination LLM. Citation-grounded answers you can trust — for anyone, no code required.",
  url: "https://driftai.studio",
  offers: [
    {
      "@type": "Offer",
      name: "Starter",
      price: "300",
      priceCurrency: "USD",
      description: "For individuals and small teams. Chat, memory, vault, agent builder.",
    },
    {
      "@type": "Offer",
      name: "Pro",
      price: "800",
      priceCurrency: "USD",
      description: "For teams. Full workflows, voice, autonomous agents, up to 5 seats.",
    },
    {
      "@type": "Offer",
      name: "Enterprise",
      price: "1500",
      priceCurrency: "USD",
      description: "For organizations. SSO, BYOK encryption, dedicated CSM, SLA.",
    },
  ],
  featureList: [
    "Build AI agents by chatting — no code",
    "Voice agents for inbound and outbound calls",
    "Natural-language workflow engine",
    "Low-hallucination, citation-grounded answers",
    "Unified data aggregation across files, web, and APIs",
    "Memory that grows with every conversation",
  ],
};

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
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
        <p className="label-section text-[var(--accent)]">AI agents for anyone</p>
        <h1 className="heading-display text-5xl md:text-6xl mt-4 max-w-3xl mx-auto">
          Build AI agents, voice, and workflows
        </h1>
        <p className="mt-6 text-lg text-[var(--ink-muted)] max-w-2xl mx-auto">
          Agents that read your documents, answer your phone, and run your
          workflows — on a powerful LLM tuned for low hallucination, so every
          answer is grounded and cited. No code required.
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
          Everything you need to ship an agent
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

      {/* Integrations */}
      <div className="max-w-6xl mx-auto px-6 py-16">
        <p className="label-section text-[var(--ink-subtle)] text-center">Integrations</p>
        <h2 className="heading-display text-3xl md:text-4xl mt-3 text-center">
          Connects to your stack
        </h2>
        <p className="mt-4 text-sm text-[var(--ink-muted)] text-center max-w-xl mx-auto">
          Bring your own tools. Agents can read from your files, search the web,
          and act through any connected service via MCP — with new connectors
          landing all the time.
        </p>
        <div className="card-flat p-6 mt-8">
          <div className="flex flex-wrap gap-2 justify-center">
            {[
              "Gmail", "Google Drive", "Slack", "Notion", "Outlook", "Calendar",
              "Dropbox", "Webhooks", "n8n", "Zapier", "Twilio", "Stripe",
              "HubSpot", "Salesforce", "Airtable", "GitHub", "Linear", "Web search",
            ].map((svc) => (
              <span
                key={svc}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] bg-[var(--canvas-subtle)] text-sm font-medium text-[var(--ink)]"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                {svc}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Trust signals */}
      <div className="max-w-6xl mx-auto px-6 py-16">
        <p className="label-section text-[var(--ink-subtle)] text-center">Security</p>
        <h2 className="heading-display text-3xl md:text-4xl mt-3 text-center">
          Your data stays yours
        </h2>
        <p className="mt-4 text-sm text-[var(--ink-muted)] text-center max-w-xl mx-auto">
          Drift never trains models on your data. Documents live in your
          workspace, isolated by row-level security, encrypted at rest.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
          {[
            { label: "SOC 2 Type II", detail: "Compliance tracked via EasyAudit" },
            { label: "Row-level isolation", detail: "Every query scoped to your workspace" },
            { label: "Encrypted at rest", detail: "AES-256 for documents and embeddings" },
            { label: "No model training", detail: "Your documents and data are never used to train AI" },
          ].map((item) => (
            <div key={item.label} className="card-flat p-5">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-[var(--verified)]" strokeWidth={1.5} />
                <span className="text-sm font-medium text-[var(--ink)]">{item.label}</span>
              </div>
              <p className="text-xs text-[var(--ink-muted)]">{item.detail}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="max-w-6xl mx-auto px-6 py-16 text-center">
        <Sparkles className="w-10 h-10 text-[var(--ink-subtle)] mx-auto mb-4" strokeWidth={1} />
        <h2 className="heading-display text-3xl md:text-4xl">
          Built for anyone
        </h2>
        <p className="mt-4 text-sm text-[var(--ink-muted)] max-w-lg mx-auto">
          Whatever you do, Drift lets you build agents, voice, and workflows on a
          low-hallucination LLM — grounded in your data and cited every time.
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
            <Link href="/security" className="hover:text-[var(--ink)] transition">Security</Link>
            <Link href="/status" className="hover:text-[var(--ink)] transition">Status</Link>
          </nav>
        </div>
      </div>
    </div>
  );
}
