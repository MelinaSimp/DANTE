// app/welcome/page.tsx
// Public marketing landing for Drift. Lives outside the middleware's
// protectedRoutes list so unauthenticated visitors can reach it.
import Image from "next/image";
import Link from "next/link";

export const metadata = {
  title: "Drift — The AI receptionist that runs your front desk",
  description:
    "Drift answers every call, books appointments, and keeps your CRM in sync — 24/7, in your voice.",
};

const FEATURES = [
  {
    label: "Answers",
    title: "Picks up on the first ring",
    body: "A natural-sounding AI receptionist handles every call, day or night, in your company's voice.",
  },
  {
    label: "Books",
    title: "Schedules into your calendar",
    body: "Drift checks availability, proposes times, and drops appointments straight into your team's calendar.",
  },
  {
    label: "Captures",
    title: "Builds your CRM as it talks",
    body: "Caller details, transcripts, and follow-ups land in contact records automatically — no data entry.",
  },
  {
    label: "Signals",
    title: "Flags churn and opportunity",
    body: "Sentiment and intent signals surface which clients need you next, so nothing slips through the cracks.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Forward your number",
    body: "Point your existing business line at Drift in under five minutes. Keep your number, keep your brand.",
  },
  {
    n: "02",
    title: "Teach Drift your business",
    body: "Upload your FAQs, services, and pricing. Drift learns how you greet callers and what you say yes to.",
  },
  {
    n: "03",
    title: "Go live",
    body: "Drift takes calls, books work, and routes what matters to you. You watch it happen from the dashboard.",
  },
];

export default function WelcomePage() {
  return (
    <main className="min-h-screen bg-[#fafaf7] text-[#151515]">
      {/* Nav */}
      <header className="border-b border-black/5">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Link href="/welcome" className="flex items-center gap-2">
            <Image
              src="/brand/logo-mark.svg"
              alt="Drift"
              width={28}
              height={28}
              priority
            />
            <span className="text-sm font-semibold tracking-[0.2em]">
              DRIFT
            </span>
          </Link>
          <nav className="hidden items-center gap-8 text-sm text-[#151515]/70 md:flex">
            <a href="#features" className="hover:text-[#151515]">
              Features
            </a>
            <a href="#how" className="hover:text-[#151515]">
              How it works
            </a>
            <a href="#pricing" className="hover:text-[#151515]">
              Pricing
            </a>
          </nav>
          <div className="flex items-center gap-3">
            <Link
              href="/auth"
              className="text-sm text-[#151515]/70 hover:text-[#151515]"
            >
              Sign in
            </Link>
            <Link
              href="/auth"
              className="rounded-full bg-[#151515] px-4 py-2 text-sm font-medium text-white hover:bg-black"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-6 py-24 md:py-32">
          <p className="text-xs uppercase tracking-[0.4em] text-[#151515]/60">
            AI RECEPTIONIST · BUILT FOR SMALL TEAMS
          </p>
          <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-tight md:text-6xl">
            Never miss a call.
            <br />
            Never lose a client.
          </h1>
          <p className="mt-6 max-w-xl text-base text-[#151515]/70 md:text-lg">
            Drift is the AI receptionist that answers your phone, books the
            work, and keeps your CRM in sync — so you can stay on the tools.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link
              href="/auth"
              className="rounded-full bg-[#151515] px-6 py-3 text-sm font-medium text-white hover:bg-black"
            >
              Start free trial
            </Link>
            <a
              href="#how"
              className="rounded-full border border-[#151515]/20 px-6 py-3 text-sm font-medium text-[#151515] hover:border-[#151515]/40"
            >
              See how it works
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-black/5 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <p className="text-xs uppercase tracking-[0.4em] text-[#151515]/60">
            WHAT DRIFT DOES
          </p>
          <h2 className="mt-4 max-w-2xl text-3xl font-semibold md:text-4xl">
            A front desk that doesn't sleep, forget, or quit.
          </h2>
          <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-black/5 bg-black/5 md:grid-cols-2">
            {FEATURES.map((f) => (
              <div key={f.title} className="bg-white p-8">
                <p className="text-[10px] uppercase tracking-[0.4em] text-[#151515]/50">
                  {f.label}
                </p>
                <h3 className="mt-3 text-xl font-semibold">{f.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-[#151515]/70">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-t border-black/5">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <p className="text-xs uppercase tracking-[0.4em] text-[#151515]/60">
            HOW IT WORKS
          </p>
          <h2 className="mt-4 max-w-2xl text-3xl font-semibold md:text-4xl">
            Live in an afternoon.
          </h2>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n}>
                <p className="text-xs uppercase tracking-[0.4em] text-[#151515]/40">
                  {s.n}
                </p>
                <h3 className="mt-3 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#151515]/70">
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="pricing" className="border-t border-black/5 bg-[#151515] text-white">
        <div className="mx-auto max-w-6xl px-6 py-20 text-center">
          <p className="text-xs uppercase tracking-[0.4em] text-white/60">
            READY WHEN YOU ARE
          </p>
          <h2 className="mt-4 text-3xl font-semibold md:text-5xl">
            Hand the phone to Drift.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-white/70">
            Start a free trial, port your number, and hear what a 24/7 front
            desk actually sounds like.
          </p>
          <div className="mt-10 flex justify-center">
            <Link
              href="/auth"
              className="rounded-full bg-white px-6 py-3 text-sm font-medium text-[#151515] hover:bg-white/90"
            >
              Get started
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-black/5">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-xs text-[#151515]/60 md:flex-row">
          <p>© {new Date().getFullYear()} Drift AI</p>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-[#151515]">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-[#151515]">
              Terms
            </Link>
            <Link href="/auth" className="hover:text-[#151515]">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
