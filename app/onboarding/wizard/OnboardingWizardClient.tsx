"use client";

// app/onboarding/wizard/OnboardingWizardClient.tsx
//
// Five-step guided onboarding. Steps know which step is "current"
// based on data presence (the user can leave + come back). Each
// step has a primary action that takes them to the relevant
// surface; the wizard polls for completion when they return.

import Link from "next/link";
import { useMemo } from "react";
import {
  Building2,
  FileText,
  Users,
  Calendar,
  MessageSquare,
  Check,
  ArrowRight,
} from "lucide-react";

interface Progress {
  vault_count: number;
  contact_count: number;
  calendar_connected: boolean;
}

interface Step {
  id: string;
  title: string;
  description: string;
  done: boolean;
  href: string;
  cta: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}

export default function OnboardingWizardClient({
  industry,
  workspaceName,
  userName,
  progress,
}: {
  industry: string;
  workspaceName: string;
  userName: string;
  progress: Progress;
}) {
  const isRealtor = industry === "real_estate";
  const verticalNoun = isRealtor ? "real estate agent" : "financial advisor";
  const assistantName = isRealtor ? "Vergil" : "Dante";

  const steps: Step[] = useMemo(() => {
    const docCta = isRealtor
      ? "Upload your first listing agreement"
      : "Upload your first IPS or Form ADV";
    const contactCta = isRealtor ? "Add your first buyer or seller" : "Add your first client";
    const chatCta = isRealtor
      ? `Ask ${assistantName} to prep you for a showing`
      : `Ask ${assistantName} to summarize a client`;

    return [
      {
        id: "industry",
        title: "Confirm your vertical",
        description: `Drift is configured for ${verticalNoun}. ${assistantName} is your AI assistant — citation-grounded, supervised, and tuned for your work.`,
        done: true, // Set at signup; re-affirmation only.
        href: "/settings/workspace",
        cta: "Review workspace settings",
        icon: Building2,
      },
      {
        id: "vault",
        title: "Upload three documents",
        description: `Drift's value compounds with the vault. Upload three documents now — ${assistantName} will read them and cite them by page in every relevant answer.`,
        done: progress.vault_count >= 3,
        href: "/vault?upload=1",
        cta: docCta,
        icon: FileText,
      },
      {
        id: "contacts",
        title: "Add your first contacts",
        description: `Memory grows around contacts. Add at least one so ${assistantName} can start tracking facts, summaries, and call episodes.`,
        done: progress.contact_count >= 1,
        href: "/contacts?add=1",
        cta: contactCta,
        icon: Users,
      },
      {
        id: "calendar",
        title: "Connect your calendar (optional)",
        description: `When ${assistantName} sees an upcoming meeting, it pulls the right context automatically — no copy-paste.`,
        done: progress.calendar_connected,
        href: "/settings/integrations",
        cta: "Connect Google or Outlook",
        icon: Calendar,
      },
      {
        id: "first-chat",
        title: `Run your first chat`,
        description: `With docs and contacts in place, ask ${assistantName} a real question. The response will carry verified citations to your sources.`,
        done: false, // Set when the user has a non-empty dante_chats row.
        href: "/dante",
        cta: chatCta,
        icon: MessageSquare,
      },
    ];
  }, [isRealtor, assistantName, verticalNoun, progress]);

  const completed = steps.filter((s) => s.done).length;
  const total = steps.length;
  const allDone = completed === total;

  return (
    <div className="min-h-screen bg-[var(--canvas)]">
      <div className="max-w-3xl mx-auto px-6 md:px-8 py-12">
        <header className="mb-10">
          <div className="text-[10px] tracking-[0.16em] uppercase text-[var(--ink-subtle)] mb-2">
            Welcome to {workspaceName}
          </div>
          <h1 className="font-display text-4xl text-[var(--ink)] mb-3">
            Get started, {userName}.
          </h1>
          <p className="text-sm text-[var(--ink-muted)] max-w-prose leading-relaxed">
            Five steps. About thirty minutes. By the end, {assistantName} will know your firm well
            enough to answer real client questions with citations to your documents.
          </p>
          <div className="mt-5 flex items-center gap-3">
            <div className="flex-1 h-1.5 rounded-full bg-[var(--canvas-subtle)] overflow-hidden">
              <div
                className="h-full bg-[var(--ink)] transition-all"
                style={{ width: `${(completed / total) * 100}%` }}
              />
            </div>
            <span className="text-xs font-mono text-[var(--ink-muted)]">
              {completed} / {total}
            </span>
          </div>
        </header>

        <ol className="space-y-3">
          {steps.map((step, i) => {
            const Icon = step.icon;
            const isCurrent = !step.done && steps.slice(0, i).every((s) => s.done);
            return (
              <li
                key={step.id}
                className={`rounded-[6px] border p-5 transition ${
                  step.done
                    ? "border-[var(--rule)] bg-[var(--canvas-subtle)] opacity-70"
                    : isCurrent
                      ? "border-[var(--ink)] bg-[var(--canvas)] shadow-sm"
                      : "border-[var(--rule)] bg-[var(--canvas)]"
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 mt-0.5">
                    {step.done ? (
                      <Check className="w-5 h-5 text-emerald-600" strokeWidth={2} />
                    ) : (
                      <Icon className="w-5 h-5 text-[var(--ink-muted)]" strokeWidth={1.5} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-[var(--ink)] mb-1">{step.title}</div>
                    <p className="text-xs text-[var(--ink-muted)] leading-relaxed mb-3">
                      {step.description}
                    </p>
                    {!step.done && (
                      <Link
                        href={step.href}
                        className={`inline-flex items-center gap-1.5 text-sm font-medium ${
                          isCurrent ? "text-[var(--ink)]" : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                        }`}
                      >
                        {step.cta}
                        <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.5} />
                      </Link>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        {allDone && (
          <div className="mt-8 p-5 rounded-[6px] border border-[var(--ink)] bg-[var(--canvas-subtle)] text-center">
            <p className="text-sm text-[var(--ink)] mb-3">
              All set. {assistantName} is ready.
            </p>
            <Link
              href="/dashboard"
              className="inline-block px-4 py-2 rounded-[4px] bg-[var(--ink)] text-[var(--canvas)] text-sm font-semibold hover:opacity-90 transition"
            >
              Go to dashboard
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
