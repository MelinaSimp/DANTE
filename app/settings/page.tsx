// app/settings/page.tsx
import { createServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import DeployButton from "@/components/DeployButton";

export default async function SettingsPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");

  return (
    <div className="relative mx-auto flex max-w-5xl flex-col gap-8 px-4 py-12 text-white">
      <div className="absolute inset-0 -z-10 opacity-40">
        <div className="absolute left-24 top-16 h-64 w-64 rounded-full bg-gradient-to-br from-[#3351ff]/40 via-transparent to-transparent blur-[140px]" />
        <div className="absolute bottom-10 right-24 h-72 w-72 rounded-full bg-gradient-to-tr from-[#1b3b6f]/30 via-transparent to-transparent blur-[160px]" />
      </div>

      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-white/40">Workspace</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-3 max-w-xl text-sm text-white/60">
            Tune how Drift responds to callers, manage your knowledge base, and review upcoming account
            tools.
          </p>
        </div>
        <DeployButton />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <a
          href="/settings/knowledge"
          className="group rounded-3xl border border-white/10 bg-black/40 p-6 shadow-[0_20px_70px_rgba(8,8,16,0.6)] transition hover:border-[#3351ff]/40 hover:bg-black/30"
        >
          <p className="text-xs uppercase tracking-[0.35em] text-white/50">Knowledge</p>
          <h2 className="mt-3 text-2xl font-semibold text-white">AI Setup</h2>
          <p className="mt-3 text-sm text-white/60">
            Configure your knowledge base so Drift can answer calls precisely every time.
          </p>
          <div className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-[#6f89ff]">
            Manage entries
            <span aria-hidden className="text-lg leading-none">→</span>
          </div>
        </a>

        <a
          href="/settings/summary-template"
          className="group rounded-3xl border border-white/10 bg-black/40 p-6 shadow-[0_20px_70px_rgba(8,8,16,0.6)] transition hover:border-[#3351ff]/40 hover:bg-black/30"
        >
          <p className="text-xs uppercase tracking-[0.35em] text-white/50">Documents</p>
          <h2 className="mt-3 text-2xl font-semibold text-white">Summary template</h2>
          <p className="mt-3 text-sm text-white/60">
            Choose which document&apos;s annotations define the structure for one-page PDF summaries.
          </p>
          <div className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-[#6f89ff]">
            Pick template
            <span aria-hidden className="text-lg leading-none">→</span>
          </div>
        </a>

        <div className="rounded-3xl border border-white/5 bg-white/5 p-6 text-white/60 shadow-[0_20px_70px_rgba(8,8,16,0.5)]">
          <p className="text-xs uppercase tracking-[0.35em] text-white/40">Account</p>
          <h2 className="mt-3 text-2xl font-semibold text-white/80">Account Preferences</h2>
          <p className="mt-3 text-sm text-white/55">
            Manage billing, team access, and security. This area is coming soon—ask the team if you
            need changes right away.
          </p>
          <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/50">
            Coming soon
          </div>
        </div>
      </div>
    </div>
  );
}
