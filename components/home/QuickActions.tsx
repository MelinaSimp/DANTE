"use client";

import React from "react";
import Link from "next/link";
import { Phone, CalendarCheck, UserRound, ClipboardList, ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface QuickAction {
  href: string;
  title: string;
  description: string;
  icon: React.ElementType;
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
    <aside className="mt-16 w-full max-w-xl rounded-3xl border border-[#e5e7eb] bg-[#ffffff] p-6 text-center shadow-sm">
      <p className="text-xs uppercase tracking-[0.3em] text-[#151515]/60">QUICK ACTIONS</p>
      <h2 className="mt-2 text-lg font-semibold text-[#151515]">Jump back into work</h2>
      <div className="mt-5 space-y-3">
        {quickActions.map(({ href, title, description, icon: IconComponent }) => {
          // Ensure IconComponent is a valid React component
          const Icon = typeof IconComponent === 'function' ? IconComponent : null;
          return (
            <Link
              key={href}
              href={href}
              className="group flex items-center justify-between rounded-2xl border border-[#e5e7eb] bg-[#ffffff] px-4 py-4 transition hover:border-[#3166bf]/40 hover:bg-[#f3f4f6]"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#e5e7eb] bg-[#f3f4f6] text-[#3166bf]">
                  {Icon ? <Icon size={20} /> : <span className="w-5 h-5" />}
                </span>
                <div className="text-left">
                  <p className="text-sm font-semibold text-[#151515] whitespace-nowrap">{title}</p>
                  <p className="text-xs text-[#151515]/60">{description}</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-[#151515]/40 transition group-hover:text-[#151515]" />
            </Link>
          );
        })}
      </div>
    </aside>
  );
}

