import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import QuickActions from "@/components/home/QuickActions";
import AskDrift from "@/components/home/AskDrift";

function firstNameFrom(user: any): string | null {
  const meta = user?.user_metadata || {};
  const raw =
    meta.first_name ||
    meta.given_name ||
    meta.name ||
    meta.full_name ||
    user?.email ||
    null;

  if (!raw) return null;
  const token = String(raw).split("@")[0].trim();
  const first = token.split(/\s+/)[0] || token;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

export default async function HomeLanding() {
  const supabase = await createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const firstName = firstNameFrom(user);

  return (
    <div className="relative isolate min-h-[calc(100vh-64px)] overflow-hidden text-[var(--ink)]">

      <div className="relative mx-auto w-full max-w-5xl px-6 py-24">
        <div className="flex flex-col items-center gap-10">
          <div className="flex w-full max-w-3xl flex-col items-center text-center">
            <div className="space-y-4">
              <p className="text-xs uppercase tracking-[0.4em] text-[var(--ink-muted)]">
                {firstName ? `WELCOME BACK, ${firstName.toUpperCase()}` : "WELCOME BACK"}
              </p>
              <h1 className="text-4xl font-semibold md:text-5xl text-[var(--ink)]">Where should we begin?</h1>
              <p className="text-sm text-[var(--ink-muted)] md:text-base">
                Ask Drift anything about your calls, contacts, or upcoming work.
              </p>
            </div>

            <AskDrift
              suggestions={[
                "Summarize this morning's calls",
                "What follow-ups are overdue?",
                "Show me upcoming appointments for today",
              ]}
            />
          </div>

          <QuickActions />
        </div>
      </div>
    </div>
  );
}

