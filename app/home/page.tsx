import { redirect } from "next/navigation";
import Link from "next/link";
import { Phone, CalendarCheck, UserRound, ClipboardList, ChevronRight } from "lucide-react";
import { createServerSupabase } from "@/lib/supabase/server";
// import AskDrift from "@/components/home/AskDrift";

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

const quickActions = [
  {
    href: "/calls",
    title: "Review today's calls",
    description: "See transcripts and follow-ups",
    icon: Phone,
  },
  {
    href: "/appointments",
    title: "Check upcoming schedule",
    description: "Manage bookings and confirmations",
    icon: CalendarCheck,
  },
  {
    href: "/contacts",
    title: "Update a contact",
    description: "Edit notes and interaction history",
    icon: UserRound,
  },
  {
    href: "/schedule",
    title: "Review tasks",
    description: "Stay on top of follow-ups",
    icon: ClipboardList,
  },
];

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
    <div className="relative isolate min-h-[calc(100vh-64px)] overflow-hidden text-white">

      <div className="relative mx-auto w-full max-w-5xl px-6 py-24">
        <div className="flex flex-col items-center gap-10">
          <div className="flex w-full max-w-3xl flex-col items-center text-center">
            <div className="space-y-4">
              <p className="text-xs uppercase tracking-[0.4em] text-gray-400">
                {firstName ? `WELCOME BACK, ${firstName.toUpperCase()}` : "WELCOME BACK"}
              </p>
              <h1 className="text-4xl font-semibold md:text-5xl text-white">Where should we begin?</h1>
              <p className="text-sm text-gray-400 md:text-base">
                Ask Drift anything about your calls, contacts, or upcoming work.
              </p>
            </div>

            {/* <AskDrift
              suggestions={[
                "Summarize this morning's calls",
                "What follow-ups are overdue?",
                "Show me upcoming appointments for today",
              ]}
            /> */}
          </div>

          <aside className="mt-16 w-full max-w-xl rounded-3xl border border-white/10 bg-white/5 p-6 text-center backdrop-blur">
            <p className="text-xs uppercase tracking-[0.3em] text-gray-400">QUICK ACTIONS</p>
            <h2 className="mt-2 text-lg font-semibold text-white">Jump back into work</h2>
            <div className="mt-5 space-y-3">
              {quickActions.map(({ href, title, description, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="group flex items-center justify-between rounded-2xl border border-white/10 bg-black/40 px-4 py-4 transition hover:border-blue-500/40 hover:bg-black/30"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-black/60 text-white">
                      <Icon size={20} />
                    </span>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-white whitespace-nowrap">{title}</p>
                      <p className="text-xs text-gray-400">{description}</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-500 transition group-hover:text-white" />
                </Link>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

