import { Metadata } from "next";
import Link from "next/link";
import { Apple, Monitor, Info, Check } from "lucide-react";

export const metadata: Metadata = {
  title: "Download Drift AI Desktop App",
  description:
    "Download the native Drift AI desktop app for macOS. CRE deal intelligence, lease abstraction, and 50-state parcel analytics.",
  openGraph: {
    title: "Download Drift AI Desktop App",
    description:
      "Native macOS app for commercial real estate deal intelligence.",
    url: "https://driftai.studio/download",
  },
};

const RELEASE_BASE = "/api/desktop-download";

type Platform = {
  name: string;
  icon: typeof Apple;
  blurb: string;
  downloads: { label: string; href: string; descriptor: string }[];
};

const PLATFORMS: Platform[] = [
  {
    name: "macOS",
    icon: Apple,
    blurb: "Native desktop app for macOS 10.13 or later.",
    downloads: [
      {
        label: "Apple Silicon",
        href: `${RELEASE_BASE}/Drift-AI-mac-arm64.dmg`,
        descriptor: "M1, M2, M3, M4",
      },
      {
        label: "Intel",
        href: `${RELEASE_BASE}/Drift-AI-mac-x64.dmg`,
        descriptor: "Intel-based Macs",
      },
    ],
  },
  {
    name: "Windows",
    icon: Monitor,
    blurb: "Native desktop app for Windows 10 and later.",
    downloads: [
      {
        label: "Windows",
        href: `${RELEASE_BASE}/Drift-AI-Setup.exe`,
        descriptor: ".exe installer",
      },
    ],
  },
];

export default function DownloadPage() {
  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <div className="border-b border-[var(--rule)]">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2 group">
            <img
              src="/brand/logo-circle.png"
              alt="Drift"
              className="w-6 h-6 rounded-full object-cover"
            />
            <span className="text-base font-medium text-[var(--ink)]">Drift</span>
          </Link>
          <nav className="flex items-center gap-5 text-sm text-[var(--ink-muted)]">
            <Link href="/features" className="hover:text-[var(--ink)] transition">Features</Link>
            <Link href="/auth" className="hover:text-[var(--ink)] transition">Sign in</Link>
          </nav>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-16">
        <p className="label-section text-[var(--ink-subtle)]">Download</p>
        <h1 className="heading-display text-5xl mt-3">Download Drift AI</h1>
        <p className="mt-4 text-[var(--ink-muted)] text-base max-w-2xl">
          Native desktop apps for macOS and Windows. Sign in with your workspace
          to pick up where you left off.
        </p>

        <div className="grid md:grid-cols-2 gap-4 mt-12">
          {PLATFORMS.map((p) => {
            const Icon = p.icon;
            return (
              <div key={p.name} className="card-flat p-6 flex flex-col">
                <div className="w-10 h-10 border border-[var(--rule-strong)] rounded-[4px] flex items-center justify-center">
                  <Icon className="w-5 h-5 text-[var(--ink)]" strokeWidth={1.5} />
                </div>
                <h3 className="heading-display text-2xl mt-5">{p.name}</h3>
                <p className="mt-2 text-sm text-[var(--ink-muted)] flex-1">
                  {p.blurb}
                </p>
                <div className="mt-5 space-y-2">
                  {p.downloads.map((d) => (
                    <a
                      key={d.label}
                      href={d.href}
                      className="flex items-center justify-between gap-3 bg-[var(--ink)] text-[var(--canvas)] px-4 py-2.5 rounded-[4px] text-sm font-medium hover:opacity-90 transition"
                    >
                      <span>Download — {d.label}</span>
                      <span className="text-xs opacity-70 mono">{d.descriptor}</span>
                    </a>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-12 card-flat p-6">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-[var(--accent)]" strokeWidth={1.5} />
            <h3 className="label-section text-[var(--ink)]">System Requirements</h3>
          </div>
          <ul className="mt-4 space-y-2 text-sm text-[var(--ink)]">
            <li className="flex items-start gap-2">
              <Check className="w-4 h-4 text-[var(--accent)] mt-0.5 shrink-0" strokeWidth={1.5} />
              <span>Internet connection required</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="w-4 h-4 text-[var(--accent)] mt-0.5 shrink-0" strokeWidth={1.5} />
              <span>macOS 10.13+ / Windows 10+</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="w-4 h-4 text-[var(--accent)] mt-0.5 shrink-0" strokeWidth={1.5} />
              <span>200 MB free disk space</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="w-4 h-4 text-[var(--accent)] mt-0.5 shrink-0" strokeWidth={1.5} />
              <span>White-glove setup available -- email driftaillc@gmail.com for onboarding</span>
            </li>
          </ul>
        </div>

        <div className="mt-6 card-flat p-6">
          <h3 className="label-section text-[var(--ink)]">Installation</h3>
          <div className="mt-4 space-y-3 text-sm text-[var(--ink-muted)]">
            <div>
              <strong className="text-[var(--ink)] font-medium">macOS:</strong>{" "}
              Open the .dmg, drag Drift AI to Applications. First launch: right-click
              the app and choose Open to bypass the unsigned-developer warning.
            </div>
            <div>
              <strong className="text-[var(--ink)] font-medium">Windows:</strong>{" "}
              Run the .exe. If SmartScreen warns you, click "More info" → "Run
              anyway" — the installer isn't code-signed yet.
            </div>
          </div>
        </div>

        <div className="mt-12">
          <Link
            href="/"
            className="text-sm text-[var(--accent)] hover:underline underline-offset-2"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
