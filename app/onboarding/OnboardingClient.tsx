"use client";

// 3-step onboarding wizard. Keep it narrow — the goal is "user enters
// the product with something real in it," not "collect every possible
// preference." Each step has a Skip path.
//
// Step 1  Practice profile   — firm name + optional tagline
// Step 2  Knowledge seed     — pre-written entries the user edits/prunes
// Step 3  Welcome            — one honest "here's what's next"

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Loader2,
  Sparkles,
} from "lucide-react";

type Category = "real_estate" | "restaurant" | "other";

interface SeedEntry {
  id: string;
  category: string;
  title: string;
  content: string;
  included: boolean;
}

interface Props {
  firstName: string;
  initialFirmName: string;
  category: Category;
}

// Pre-written knowledge entries tailored to the workspace's vertical.
// A couple of verticals get industry-specific templates, but the
// default is a broad business template so any user starts with
// something real. The AI needs some context to not make things up.
//
// Everything is placeholder text the user rewrites. Shipping *some*
// text beats shipping none even if they skip — the alternative is an
// empty knowledge base and an AI that makes things up.
function seedsFor(category: Category, firmName: string): SeedEntry[] {
  const nm = firmName || "our business";

  if (category === "real_estate") {
    return [
      {
        id: "about",
        category: "Company Info",
        title: `About ${nm}`,
        content: `One paragraph on ${nm}: what you do, who you serve, team size, and what sets you apart. Dante uses this to set context in answers and voice calls.`,
        included: true,
      },
      {
        id: "markets",
        category: "Company Info",
        title: "Focus & specialization",
        content:
          "The areas, segments, or topics you focus on. Include any specialization. Dante uses this to scope research and analysis.",
        included: true,
      },
      {
        id: "services",
        category: "Services",
        title: "Services you offer",
        content:
          "List what you handle and what you refer out. Dante will scope recommendations accordingly.",
        included: true,
      },
      {
        id: "criteria",
        category: "Preferences",
        title: "Working preferences",
        content:
          "Any thresholds, criteria, or defaults you want applied to your work. These help Dante filter and flag items that don't meet your criteria.",
        included: true,
      },
      {
        id: "audience",
        category: "Preferences",
        title: "Who you work with",
        content:
          "Preferred client or contact profiles and any qualifying criteria. Used to focus research and outreach.",
        included: true,
      },
      {
        id: "hours",
        category: "Hours & Coverage",
        title: "Availability & response time",
        content:
          "When you take calls, typical response window, and after-hours policy. Be specific about turnaround expectations.",
        included: true,
      },
      {
        id: "compliance",
        category: "Compliance",
        title: "Policy & compliance notes",
        content:
          "Any disclosure requirements or policies. Dante's voice agent will follow these when speaking with contacts.",
        included: false,
      },
    ];
  }

  if (category === "restaurant") {
    // Grandfathered path — if any pre-existing workspace came in under
    // this category, keep serving them reasonable content instead of
    // dumping them to the generic "other" template.
    return [
      {
        id: "about",
        category: "Company Info",
        title: "About us",
        content: `${nm} — add a short description: cuisine, vibe, neighborhood, anything distinctive.`,
        included: true,
      },
      {
        id: "hours",
        category: "Hours & Coverage",
        title: "Hours",
        content:
          "Lunch: Tue–Fri, 11:30am–2:30pm.\nDinner: Tue–Sun, 5:00pm–10:00pm.\nClosed Mondays.\n(Replace with your real hours.)",
        included: true,
      },
      {
        id: "reservations",
        category: "Scheduling Rules",
        title: "Reservations",
        content:
          "How far in advance you take reservations, party-size thresholds for the events team, same-day policy.",
        included: true,
      },
      {
        id: "menu",
        category: "Services",
        title: "Menu highlights & dietary options",
        content:
          "Signature dishes, vegetarian/vegan/gluten-free options, anything you're often asked about.",
        included: true,
      },
    ];
  }

  // Fallback: generic service-business template. Kept intentionally
  // broad so it still makes sense for "other" signups and legacy
  // "service" values.
  return [
    {
      id: "about",
      category: "Company Info",
      title: `About ${nm}`,
      content: `One paragraph about what ${nm} does, who you serve, and what makes you different. Dante uses this to contextualize answers.`,
      included: true,
    },
    {
      id: "services",
      category: "Services",
      title: "What we do",
      content:
        "Short bullet list of your services. The AI will answer 'do you do X?' directly from this.",
      included: true,
    },
    {
      id: "hours",
      category: "Hours & Coverage",
      title: "Hours & availability",
      content:
        "Hours, time zone, and after-hours policy (voicemail, callback window, emergency path).",
      included: true,
    },
    {
      id: "scheduling",
      category: "Scheduling Rules",
      title: "How to book",
      content:
        "Your intake flow: intro call vs. consult, typical duration, prep, calendar link.",
      included: true,
    },
    {
      id: "pricing",
      category: "Pricing",
      title: "How we charge",
      content:
        "Fee structure or 'we discuss on the intro call' — say one or the other so the AI doesn't improvise.",
      included: false,
    },
  ];
}

export default function OnboardingClient({
  firstName,
  initialFirmName,
  category,
}: Props) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [firmName, setFirmName] = useState(initialFirmName);
  const [seeds, setSeeds] = useState<SeedEntry[]>(() =>
    seedsFor(category, initialFirmName),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const includedCount = useMemo(
    () => seeds.filter((s) => s.included).length,
    [seeds],
  );

  function updateSeed(id: string, patch: Partial<SeedEntry>) {
    setSeeds((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
  }

  // Re-template seeds when firmName changes, but only the "About" entry
  // and only if the user hasn't edited it. Avoids clobbering their work.
  function onFirmNameChange(next: string) {
    setFirmName(next);
    setSeeds((prev) =>
      prev.map((s) => {
        if (s.id !== "about") return s;
        const previousTemplate = seedsFor(category, firmName).find(
          (t) => t.id === "about",
        );
        if (previousTemplate && s.content === previousTemplate.content) {
          const nextTemplate = seedsFor(category, next).find(
            (t) => t.id === "about",
          );
          return nextTemplate ? { ...s, ...nextTemplate, included: s.included } : s;
        }
        return s;
      }),
    );
  }

  async function completeOnboarding(opts: { skip?: boolean } = {}) {
    setSubmitting(true);
    setError(null);
    try {
      const entries = opts.skip
        ? []
        : seeds
            .filter((s) => s.included && s.title.trim() && s.content.trim())
            .map(({ category, title, content }) => ({
              category,
              title: title.trim(),
              content: content.trim(),
            }));
      const res = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          firmName: firmName.trim() || null,
          entries,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Something went wrong.");
      }
      router.push("/home");
    } catch (e: any) {
      setError(e?.message || "Something went wrong.");
      setSubmitting(false);
    }
  }

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--canvas)", color: "var(--ink)" }}
    >
      {/* Top strip — keep it minimal so the wizard feels like a doc, not an app */}
      <div className="border-b border-[var(--rule)] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src="/brand/logo-circle.png"
            alt="Drift"
            className="w-6 h-6 rounded-full object-cover"
          />
          <span className="heading-display text-xl">Drift</span>
          <span className="label-section text-[var(--ink-muted)]">
            Welcome
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs mono text-[var(--ink-subtle)]">
          <span className={step === 1 ? "text-[var(--ink)]" : ""}>01</span>
          <span>·</span>
          <span className={step === 2 ? "text-[var(--ink)]" : ""}>02</span>
          <span>·</span>
          <span className={step === 3 ? "text-[var(--ink)]" : ""}>03</span>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-6 py-12">
        {step === 1 && (
          <StepPractice
            firstName={firstName}
            firmName={firmName}
            onFirmNameChange={onFirmNameChange}
            onNext={() => setStep(2)}
            onSkip={() => completeOnboarding({ skip: true })}
            submitting={submitting}
          />
        )}
        {step === 2 && (
          <StepKnowledge
            seeds={seeds}
            includedCount={includedCount}
            onChange={updateSeed}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
            onSkip={() => completeOnboarding({ skip: true })}
            submitting={submitting}
          />
        )}
        {step === 3 && (
          <StepDone
            firmName={firmName}
            includedCount={includedCount}
            onFinish={() => completeOnboarding()}
            onBack={() => setStep(2)}
            submitting={submitting}
          />
        )}

        {error && (
          <div className="mt-6 text-sm text-[var(--flag)]">{error}</div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Steps ---------------- */

function StepPractice({
  firstName,
  firmName,
  onFirmNameChange,
  onNext,
  onSkip,
  submitting,
}: {
  firstName: string;
  firmName: string;
  onFirmNameChange: (next: string) => void;
  onNext: () => void;
  onSkip: () => void;
  submitting: boolean;
}) {
  return (
    <div>
      <div className="label-section mb-2">Step 01</div>
      <h1 className="heading-display text-4xl mb-2">
        Hi, {firstName}. Let's set up your workspace.
      </h1>
      <p className="text-sm text-[var(--ink-muted)] max-w-xl mb-10">
        Two minutes to give Drift the basics so your AI assistant knows
        your business and your voice agent knows what to say.
      </p>

      <label className="label-section block mb-2">
        Your business or team name
      </label>
      <input
        value={firmName}
        onChange={(e) => onFirmNameChange(e.target.value)}
        placeholder="e.g. Acme Inc."
        autoFocus
        className="w-full px-4 py-3 text-base border border-[var(--rule)] rounded-[6px] bg-[var(--canvas)] text-[var(--ink)] outline-none focus:border-[var(--rule-strong)]"
      />
      <p className="text-xs text-[var(--ink-subtle)] mt-2">
        Shows on the dashboard, branded PDFs, and voice-agent greeting.
      </p>

      <div className="flex items-center justify-between mt-12">
        <button
          type="button"
          onClick={onSkip}
          disabled={submitting}
          className="text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition disabled:opacity-50"
        >
          Skip setup
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={submitting}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[var(--ink)] text-[var(--canvas)] rounded-[6px] text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
        >
          Continue
          <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

function StepKnowledge({
  seeds,
  includedCount,
  onChange,
  onBack,
  onNext,
  onSkip,
  submitting,
}: {
  seeds: SeedEntry[];
  includedCount: number;
  onChange: (id: string, patch: Partial<SeedEntry>) => void;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
  submitting: boolean;
}) {
  return (
    <div>
      <div className="label-section mb-2">Step 02</div>
      <h1 className="heading-display text-4xl mb-2">
        Teach Drift about your business.
      </h1>
      <p className="text-sm text-[var(--ink-muted)] max-w-xl mb-8">
        Starter knowledge for Dante, your AI assistant. Check the entries
        you want, rewrite them to match your operation, and skip the
        rest. You can always add more under Settings.
      </p>

      <div className="space-y-3">
        {seeds.map((seed) => (
          <div
            key={seed.id}
            className={`border rounded-[6px] transition ${
              seed.included
                ? "border-[var(--rule-strong)] bg-[var(--canvas)]"
                : "border-[var(--rule)] bg-[var(--canvas-subtle)] opacity-70"
            }`}
          >
            <label className="flex items-start gap-3 p-4 cursor-pointer">
              <input
                type="checkbox"
                checked={seed.included}
                onChange={(e) =>
                  onChange(seed.id, { included: e.target.checked })
                }
                className="mt-1 accent-[var(--ink)]"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="text-[11px] mono uppercase tracking-wide text-[var(--ink-subtle)]">
                    {seed.category}
                  </span>
                </div>
                <input
                  value={seed.title}
                  onChange={(e) => onChange(seed.id, { title: e.target.value })}
                  disabled={!seed.included}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full text-sm font-semibold text-[var(--ink)] bg-transparent border-0 outline-none p-0 mb-2 disabled:text-[var(--ink-muted)]"
                />
                <textarea
                  value={seed.content}
                  onChange={(e) =>
                    onChange(seed.id, { content: e.target.value })
                  }
                  disabled={!seed.included}
                  onClick={(e) => e.stopPropagation()}
                  rows={3}
                  className="w-full text-sm text-[var(--ink-muted)] bg-transparent border-0 outline-none p-0 resize-none disabled:text-[var(--ink-subtle)]"
                />
              </div>
            </label>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mt-10">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition disabled:opacity-50"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
          Back
        </button>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onSkip}
            disabled={submitting}
            className="text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition disabled:opacity-50"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={submitting}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[var(--ink)] text-[var(--canvas)] rounded-[6px] text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
          >
            Continue with {includedCount}
            <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </div>
  );
}

function StepDone({
  firmName,
  includedCount,
  onFinish,
  onBack,
  submitting,
}: {
  firmName: string;
  includedCount: number;
  onFinish: () => void;
  onBack: () => void;
  submitting: boolean;
}) {
  return (
    <div>
      <div className="label-section mb-2">Step 03</div>
      <h1 className="heading-display text-4xl mb-2">
        {firmName ? `${firmName} is ready.` : "You're set up."}
      </h1>
      <p className="text-sm text-[var(--ink-muted)] max-w-xl mb-10">
        Here's what to expect on the dashboard, and what still needs you.
      </p>

      <div className="space-y-4 mb-10">
        <DoneItem
          label={`${includedCount} knowledge entries seeded`}
          detail="Dante will use these as context for analysis, research, and voice calls. Edit any time under Settings."
          done
        />
        <DoneItem
          label="Upload a document to the Vault"
          detail="Drop a PDF in the Vault and use document extraction to pull key details automatically. Dante cites vault docs in every answer."
        />
        <DoneItem
          label="Ask Dante a question"
          detail="Try: 'Summarize the documents I uploaded this week' or 'Draft a follow-up email.' Dante is your AI assistant."
        />
        <DoneItem
          label="Set up a workflow"
          detail="Automate reminders, alerts, or outreach. Workflows run on a schedule or trigger from events."
        />
      </div>

      <DemoSeedButton />

      <div className="border border-[var(--rule)] rounded-[6px] p-4 mb-10 flex items-start gap-3 bg-[var(--canvas-subtle)]">
        <Sparkles
          className="w-4 h-4 text-[var(--ink-muted)] mt-0.5 shrink-0"
          strokeWidth={1.5}
        />
        <p className="text-xs text-[var(--ink-muted)] leading-relaxed">
          Drift is early. Some surfaces are still being built -- we'd rather
          admit that than pretend. If something feels missing, it probably is,
          and we want to hear about it.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition disabled:opacity-50"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
          Back
        </button>
        <button
          type="button"
          onClick={onFinish}
          disabled={submitting}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[var(--ink)] text-[var(--canvas)] rounded-[6px] text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
              Saving…
            </>
          ) : (
            <>
              Go to dashboard
              <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function DemoSeedButton() {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  async function seed() {
    setState("loading");
    try {
      const res = await fetch("/api/onboarding/seed-demo", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      setState("done");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className="border border-emerald-500/30 rounded-[6px] p-4 mb-6 flex items-center gap-3 bg-emerald-500/5">
        <Check className="w-4 h-4 text-emerald-600 shrink-0" strokeWidth={1.5} />
        <p className="text-xs text-[var(--ink-muted)]">
          Demo data loaded -- sample records, preferences, and an example workflow are ready to explore.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-[var(--rule)] rounded-[6px] p-4 mb-6 flex items-start justify-between gap-3 bg-[var(--canvas-subtle)]">
      <div>
        <p className="text-sm font-medium text-[var(--ink)] mb-1">
          Want to see Drift in action first?
        </p>
        <p className="text-xs text-[var(--ink-muted)]">
          Load a sample workspace with records, preferences, and an
          example workflow. You can delete it all later.
        </p>
      </div>
      <button
        type="button"
        onClick={seed}
        disabled={state === "loading"}
        className="shrink-0 px-3 py-1.5 text-xs font-medium border border-[var(--rule)] rounded-[6px] hover:bg-[var(--canvas)] transition disabled:opacity-50"
      >
        {state === "loading" ? (
          <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
        ) : state === "error" ? (
          "Retry"
        ) : (
          "Load demo data"
        )}
      </button>
    </div>
  );
}

function DoneItem({
  label,
  detail,
  done = false,
}: {
  label: string;
  detail: string;
  done?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <div
        className={`mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
          done
            ? "bg-[var(--ink)] border-[var(--ink)] text-[var(--canvas)]"
            : "border-[var(--rule)] text-[var(--ink-subtle)]"
        }`}
      >
        {done ? (
          <Check className="w-3 h-3" strokeWidth={2} />
        ) : (
          <span className="text-[10px] mono">·</span>
        )}
      </div>
      <div>
        <div className="text-sm font-medium text-[var(--ink)]">{label}</div>
        <div className="text-xs text-[var(--ink-muted)] mt-0.5 leading-relaxed">
          {detail}
        </div>
      </div>
    </div>
  );
}
