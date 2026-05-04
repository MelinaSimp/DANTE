"use client";

// components/desktop/UpdatePromptCard.tsx
//
// Shown on pages that need a feature only available in a newer
// Drift desktop build (e.g. /dante/hermes needs window.driftLocal,
// which lands in v1.1.0+). The user is on a version that's missing
// the IPC bridge and the auto-updater hasn't caught up yet.
//
// Why a direct-download path: relying purely on electron-updater
// is bad UX. The check fires only on app boot, the download is
// silent, and pre-v1.1.0 the only signal that anything happened
// was a native dialog box that could fire mid-keystroke. This
// card gives the user an immediate, obvious way out — pick your
// architecture, download the DMG, drag-to-Applications, relaunch.
//
// We can't reliably detect arm64 vs x64 from the renderer (Apple
// Silicon transparently spoofs Intel user-agents in Rosetta), so
// we surface both options labeled by Mac generation.

const REPO = "MelinaSimp/drift-crm";

export default function UpdatePromptCard() {
  return (
    <div className="border border-amber-500/40 bg-amber-500/5 rounded-md p-6 text-sm">
      <div className="flex items-start gap-3 mb-3">
        <div className="mt-0.5 w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
        <div>
          <strong className="text-[var(--ink)] block mb-1">
            Your Drift desktop app is out of date
          </strong>
          <p className="text-[var(--ink-muted)] leading-relaxed">
            This feature ships in Drift v1.1.0+. The auto-updater normally
            handles this on app launch, but you can install it right now —
            pick your Mac, drag it into Applications, and relaunch. Your
            workspace, sign-in, and data are unaffected.
          </p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-2 mt-4">
        <a
          href="/api/desktop-download/Drift-AI-mac-arm64.dmg"
          className="block rounded-md border border-amber-500/40 bg-[var(--canvas)] p-3 hover:bg-amber-500/5 transition-colors"
        >
          <div className="font-medium text-[var(--ink)]">
            Download for Apple Silicon
          </div>
          <div className="text-xs text-[var(--ink-muted)] mt-0.5">
            M1 / M2 / M3 / M4 · ~251 MB
          </div>
        </a>
        <a
          href="/api/desktop-download/Drift-AI-mac-x64.dmg"
          className="block rounded-md border border-amber-500/40 bg-[var(--canvas)] p-3 hover:bg-amber-500/5 transition-colors"
        >
          <div className="font-medium text-[var(--ink)]">
            Download for Intel Mac
          </div>
          <div className="text-xs text-[var(--ink-muted)] mt-0.5">
            Intel processors · ~257 MB
          </div>
        </a>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <a
          href={`https://github.com/${REPO}/releases/latest`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-[var(--ink-muted)] hover:text-[var(--ink)]"
        >
          View release notes →
        </a>
        <span className="text-xs text-[var(--ink-muted)]">
          Or quit + relaunch Drift to trigger the auto-updater
        </span>
      </div>
    </div>
  );
}
