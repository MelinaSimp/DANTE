import { createServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import DeployButton from "@/components/DeployButton";
import BillingCard from "./BillingCard";

export default async function SettingsPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const isAdmin = profile?.role === "admin" || profile?.role === "owner";

  return (
    <div className="relative mx-auto flex max-w-5xl flex-col gap-8 px-4 py-12 text-white">
      <div className="absolute inset-0 -z-10 opacity-40">
        <div className="absolute left-24 top-16 h-64 w-64 rounded-full bg-gradient-to-br from-[#3351ff]/40 via-transparent to-transparent blur-[140px]" />
        <div className="absolute bottom-10 right-24 h-72 w-72 rounded-full bg-gradient-to-tr from-[#1b3b6f]/30 via-transparent to-transparent blur-[160px]" />
      </div>

      <div className="flex items-start justify-between">
        <div>
          <a
            href="/frontend"
            className="inline-flex items-center gap-2 text-sm font-medium text-white/40 hover:text-white/70 transition-colors mb-4"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </a>
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

        <BillingCard />

        {isAdmin && (
          <a
            href="/settings/audit-log"
            className="group rounded-3xl border border-white/10 bg-black/40 p-6 shadow-[0_20px_70px_rgba(8,8,16,0.6)] transition hover:border-[#3351ff]/40 hover:bg-black/30"
          >
            <p className="text-xs uppercase tracking-[0.35em] text-white/50">Compliance</p>
            <h2 className="mt-3 text-2xl font-semibold text-white">Audit log</h2>
            <p className="mt-3 text-sm text-white/60">
              Review sensitive workspace events — deployments, member invites,
              API key changes — with actor, timestamp, and target.
            </p>
            <div className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-[#6f89ff]">
              View events
              <span aria-hidden className="text-lg leading-none">→</span>
            </div>
          </a>
        )}
      </div>
    </div>
  );
}
