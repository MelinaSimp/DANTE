"use client";

// Public Dante landing — all-in-one agentic platform.
// Entry surface for unauthenticated visitors (/ → /features).
// CTAs route into /auth so the same site is how you access Dante.

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Bot,
  Check,
  Globe2,
  Shield,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";

const PILLARS = [
  {
    icon: Bot,
    title: "Agents",
    body: "Describe what you need in plain English. Dante builds an agent that reads your files, cites every answer, and takes action — no code required.",
  },
  {
    icon: Globe2,
    title: "Sites",
    body: "Publish agents to the web. Embed a chat widget on any site, or share a public agent link so anyone can talk to your grounded assistant.",
  },
  {
    icon: Workflow,
    title: "Workflows",
    body: "Turn repeatable work into multi-step automations — triggers, tools, and specialist agents — with a human in the loop when it matters.",
  },
  {
    icon: ShieldCheck,
    title: "Almost hallucination-free",
    body: "A powerful LLM tuned for accuracy. Answers are grounded in your sources and cited to the exact document, page, and paragraph.",
  },
];

const TIERS = [
  {
    name: "Starter",
    price: "$300",
    period: "/mo",
    description: "Individuals and small teams getting started with agents.",
    features: [
      "Dante AI with citations",
      "Build agents by chatting",
      "Vault document storage and search",
      "Publish agents to sites",
      "Basic workflow automations",
      "One voice agent included",
      "1 seat included",
    ],
    cta: "Get started",
    highlight: false,
  },
  {
    name: "Pro",
    price: "$800",
    period: "/mo",
    description: "Teams running agents, sites, voice, and advanced workflows.",
    features: [
      "Everything in Starter",
      "Advanced workflows with agent nodes",
      "Autonomous agents with supervisor queue",
      "Inbound and outbound voice agents",
      "MCP server integrations",
      "Up to 5 seats",
    ],
    cta: "Get started",
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "$1,500+",
    period: "/mo",
    description: "Organizations that need compliance, SSO, and dedicated support.",
    features: [
      "Everything in Pro",
      "SSO / SAML and SCIM",
      "BYOK encryption",
      "Compliance export and audit trail",
      "Public API access",
      "Unlimited seats",
    ],
    cta: "Contact sales",
    highlight: false,
  },
];

const EASE = [0.22, 1, 0.36, 1] as const;

function HeroProductVisual({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <motion.div
      className="relative w-full max-w-xl mx-auto lg:mx-0"
      initial={reduceMotion ? false : { opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25, duration: 0.7, ease: EASE }}
    >
      <div
        aria-hidden
        className="absolute -inset-8 rounded-[2rem] bg-[radial-gradient(ellipse_at_center,rgba(30,30,36,0.08),transparent_70%)]"
      />
      <div className="relative overflow-hidden rounded-[1.25rem] border border-[var(--rule-ink)] bg-[var(--surface)] shadow-[var(--shadow-raised)]">
        <div className="flex items-center gap-2 border-b border-[var(--rule-ink)] px-4 py-3">
          <img
            src="/brand/logo-new.png"
            alt=""
            className="h-5 w-5 rounded-full object-cover"
          />
          <span className="text-sm font-medium text-[var(--ink)]">Dante</span>
          <span className="ml-auto text-[10px] uppercase tracking-[0.14em] text-[var(--ink-subtle)]">
            grounded
          </span>
        </div>
        <div className="space-y-4 p-5">
          <div className="max-w-[88%] rounded-2xl rounded-tl-md bg-[var(--canvas-muted)] px-4 py-3 text-sm text-[var(--ink)]">
            Summarize the Q3 renewal terms and cite the sources.
          </div>
          <div className="ml-auto max-w-[92%] space-y-3 rounded-2xl rounded-tr-md bg-[var(--ink)] px-4 py-3 text-sm text-[var(--canvas)]">
            <p>
              Renewal is automatic for 36 months at a 3.0% annual step-up,
              with a 90-day notice window before the term ends.
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1 rounded bg-white/10 px-2 py-0.5 text-[11px] text-white/85">
                agreement.pdf · p.14
              </span>
              <span className="inline-flex items-center gap-1 rounded bg-white/10 px-2 py-0.5 text-[11px] text-white/85">
                addendum.pdf · p.3
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--ink-muted)]">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--verified)]" />
            Cited to source · refused to invent missing clauses
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function DanteLanding() {
  const reduceMotion = useReducedMotion() ?? false;

  return (
    <div className="dante-landing relative min-h-screen overflow-x-hidden text-[var(--ink)]">
      {/* Atmosphere — not a flat canvas */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 90% 55% at 12% -10%, rgba(30,30,36,0.07), transparent 55%), radial-gradient(ellipse 70% 45% at 100% 8%, rgba(22,163,74,0.06), transparent 50%), linear-gradient(180deg, #e8eaef 0%, #dfe2e8 38%, #e6e8ed 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.35]"
        style={{
          backgroundImage:
            "radial-gradient(rgba(30,30,36,0.09) 0.7px, transparent 0.7px)",
          backgroundSize: "18px 18px",
          maskImage:
            "linear-gradient(180deg, rgba(0,0,0,0.55), transparent 70%)",
        }}
      />

      {/* Nav */}
      <header className="border-b border-[var(--rule-ink)]/60 bg-[rgba(232,234,239,0.72)] backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/features" className="inline-flex items-center gap-2.5">
            <img
              src="/brand/logo-new.png"
              alt=""
              className="h-7 w-7 rounded-full object-cover"
            />
            <span className="heading-display text-xl tracking-tight text-[var(--ink)]">
              Dante
            </span>
          </Link>
          <nav className="flex items-center gap-5 text-sm text-[var(--ink-muted)]">
            <a href="#pillars" className="hidden sm:inline hover:text-[var(--ink)] transition">
              Platform
            </a>
            <a href="#pricing" className="hover:text-[var(--ink)] transition">
              Pricing
            </a>
            <Link href="/download" className="hidden sm:inline hover:text-[var(--ink)] transition">
              Download
            </Link>
            <Link
              href="/auth"
              className="inline-flex items-center gap-1.5 rounded-[4px] bg-[var(--ink)] px-3.5 py-2 text-sm font-medium text-[var(--canvas)] transition hover:opacity-90"
            >
              Open Dante
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero — one composition: brand, headline, sentence, CTAs, product visual */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:pb-28 lg:pt-20">
        <div>
          <motion.p
            className="heading-display text-5xl leading-none tracking-tight text-[var(--ink)] sm:text-6xl md:text-7xl"
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
          >
            Dante
          </motion.p>
          <motion.h1
            className="mt-5 max-w-xl heading-display text-3xl leading-[1.12] tracking-tight text-[var(--ink)] sm:text-4xl md:text-[2.65rem]"
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08, duration: 0.6, ease: EASE }}
          >
            The all-in-one agentic platform
          </motion.h1>
          <motion.p
            className="mt-5 max-w-lg text-base leading-relaxed text-[var(--ink-muted)] sm:text-lg"
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.16, duration: 0.6, ease: EASE }}
          >
            Build agents, sites, and workflows on an almost hallucination-free
            LLM — grounded in your data, cited every time. For anyone, not just
            one industry.
          </motion.p>
          <motion.div
            className="mt-8 flex flex-wrap items-center gap-3"
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22, duration: 0.6, ease: EASE }}
          >
            <Link
              href="/auth"
              className="inline-flex items-center gap-2 rounded-[4px] bg-[var(--ink)] px-6 py-3 text-sm font-medium text-[var(--canvas)] transition hover:opacity-90"
            >
              Open Dante
              <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
            </Link>
            <a
              href="mailto:driftaillc@gmail.com"
              className="inline-flex items-center gap-2 rounded-[4px] border border-[var(--rule-ink)] bg-white/40 px-6 py-3 text-sm font-medium text-[var(--ink)] transition hover:bg-white/70"
            >
              Talk to us
            </a>
          </motion.div>
        </div>
        <HeroProductVisual reduceMotion={reduceMotion} />
      </section>

      {/* Pillars */}
      <section id="pillars" className="mx-auto max-w-6xl px-6 py-20">
        <p className="label-section text-[var(--ink-subtle)]">Platform</p>
        <h2 className="mt-3 max-w-2xl heading-display text-3xl tracking-tight md:text-4xl">
          Agents. Sites. Workflows. Grounded answers.
        </h2>
        <p className="mt-4 max-w-2xl text-sm text-[var(--ink-muted)] sm:text-base">
          One platform to design agentic systems, put them on the web, and keep
          every answer almost hallucination-free.
        </p>

        <div className="mt-12 grid gap-10 sm:grid-cols-2">
          {PILLARS.map((pillar, i) => {
            const Icon = pillar.icon;
            return (
              <motion.div
                key={pillar.title}
                initial={reduceMotion ? false : { opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.35 }}
                transition={{ delay: 0.08 * i, duration: 0.55, ease: EASE }}
                className="border-t border-[var(--rule-ink)] pt-6"
              >
                <div className="flex items-center gap-3">
                  <Icon className="h-5 w-5 text-[var(--ink)]" strokeWidth={1.5} />
                  <h3 className="heading-display text-2xl tracking-tight">
                    {pillar.title}
                  </h3>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-[var(--ink-muted)]">
                  {pillar.body}
                </p>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* For anyone */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="relative overflow-hidden rounded-[1.25rem] border border-[var(--rule-ink)] bg-[var(--ink)] px-8 py-12 text-[var(--canvas)] sm:px-12">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              background:
                "radial-gradient(ellipse 60% 80% at 90% 20%, rgba(22,163,74,0.25), transparent 55%)",
            }}
          />
          <div className="relative max-w-2xl">
            <p className="text-[11px] uppercase tracking-[0.16em] text-white/55">
              Built for anyone
            </p>
            <h2 className="mt-3 heading-display text-3xl tracking-tight sm:text-4xl">
              Not a vertical tool with a template bolted on
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-white/70 sm:text-base">
              Dante is a horizontal agentic platform. Whether you run ops,
              support, research, sales, or a studio of one — build agents and
              workflows that know your documents and refuse to invent facts.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-6xl px-6 py-20">
        <p className="label-section text-center text-[var(--ink-subtle)]">Pricing</p>
        <h2 className="mt-3 text-center heading-display text-3xl tracking-tight md:text-4xl">
          Straightforward pricing
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-center text-sm text-[var(--ink-muted)]">
          No per-query fees. Pick a tier, get the capabilities in that tier.
          Additional seats $500/mo each.
        </p>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              className={`flex flex-col border border-[var(--rule-ink)] bg-[rgba(255,255,255,0.45)] p-6 ${
                tier.highlight ? "ring-2 ring-[var(--ink)] ring-offset-2 ring-offset-[#e4e6eb]" : ""
              }`}
            >
              {tier.highlight && (
                <span className="label-section mb-3 text-[var(--ink)]">Most popular</span>
              )}
              <h3 className="heading-display text-2xl">{tier.name}</h3>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="heading-display text-4xl">
                  {tier.price}
                </span>
                <span className="text-sm text-[var(--ink-muted)]">{tier.period}</span>
              </div>
              <p className="mt-3 flex-1 text-sm text-[var(--ink-muted)]">{tier.description}</p>
              <ul className="mt-6 space-y-2">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-[var(--ink)]">
                    <Check
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--verified)]"
                      strokeWidth={2}
                    />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              {tier.name === "Enterprise" ? (
                <a
                  href="mailto:driftaillc@gmail.com"
                  className="mt-6 flex items-center justify-center border border-[var(--rule-ink)] px-4 py-2.5 text-sm font-medium transition hover:bg-white/60"
                >
                  {tier.cta}
                </a>
              ) : (
                <Link
                  href="/auth"
                  className={`mt-6 flex items-center justify-center px-4 py-2.5 text-sm font-medium transition ${
                    tier.highlight
                      ? "bg-[var(--ink)] text-[var(--canvas)] hover:opacity-90"
                      : "border border-[var(--rule-ink)] hover:bg-white/60"
                  }`}
                >
                  {tier.cta}
                </Link>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Security */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <p className="label-section text-center text-[var(--ink-subtle)]">Security</p>
        <h2 className="mt-3 text-center heading-display text-3xl tracking-tight md:text-4xl">
          Your data stays yours
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-center text-sm text-[var(--ink-muted)]">
          Dante never trains models on your data. Documents live in your
          workspace, isolated by row-level security, encrypted at rest.
        </p>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "SOC 2 Type II", detail: "Compliance tracked via EasyAudit" },
            { label: "Row-level isolation", detail: "Every query scoped to your workspace" },
            { label: "Encrypted at rest", detail: "AES-256 for documents and embeddings" },
            { label: "No model training", detail: "Your documents are never used to train AI" },
          ].map((item) => (
            <div key={item.label} className="border-t border-[var(--rule-ink)] pt-4">
              <div className="mb-2 flex items-center gap-2">
                <Shield className="h-4 w-4 text-[var(--verified)]" strokeWidth={1.5} />
                <span className="text-sm font-medium">{item.label}</span>
              </div>
              <p className="text-xs text-[var(--ink-muted)]">{item.detail}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-6xl px-6 py-20 text-center">
        <Sparkles className="mx-auto mb-4 h-8 w-8 text-[var(--ink-subtle)]" strokeWidth={1} />
        <h2 className="heading-display text-3xl tracking-tight md:text-4xl">
          Access Dante from this site
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-sm text-[var(--ink-muted)]">
          Sign in to build agents, publish sites, and run workflows on an almost
          hallucination-free LLM — grounded in your sources.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/auth"
            className="inline-flex items-center gap-2 rounded-[4px] bg-[var(--ink)] px-6 py-3 text-sm font-medium text-[var(--canvas)] transition hover:opacity-90"
          >
            Open Dante
            <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
          </Link>
          <Link
            href="/download"
            className="text-sm text-[var(--ink-muted)] underline-offset-2 hover:text-[var(--ink)] hover:underline"
          >
            Download the desktop app
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--rule-ink)]/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 text-xs text-[var(--ink-subtle)]">
          <span>Dante · Drift AI LLC</span>
          <nav className="flex items-center gap-4">
            <Link href="/terms" className="hover:text-[var(--ink)] transition">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-[var(--ink)] transition">
              Privacy
            </Link>
            <Link href="/security" className="hover:text-[var(--ink)] transition">
              Security
            </Link>
            <Link href="/status" className="hover:text-[var(--ink)] transition">
              Status
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
