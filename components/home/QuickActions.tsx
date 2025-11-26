"use client";

import Link from "next/link";
import { Phone, CalendarCheck, UserRound, ClipboardList, ChevronRight, LucideIcon } from "lucide-react";

interface QuickAction {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

const quickActions: QuickAction[] = [
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

export default function QuickActions() {
  return (
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
  );
}

