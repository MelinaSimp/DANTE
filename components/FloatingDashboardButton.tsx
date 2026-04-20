"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";

// Paths where the floating back-to-dashboard button should NOT appear.
// Every Harvey-shell page now ships its own in-bar "Back to dashboard" link
// (settings, client-details-overview, calls, etc.), so the floating chip
// became a visible duplicate. Keep it only as a last-resort fallback for
// pages that don't have their own nav. Today, that means nowhere — so the
// list below intentionally covers every app route. If a new route goes up
// without a header, it can be removed from this list to restore the chip.
const HIDDEN_PREFIXES = [
  "/dashboard",
  "/auth",
  "/admin",
  "/superadmin",
  "/app",
  "/home",
  "/features",
  "/resources",
  "/privacy",
  "/terms",
  "/download",
  "/join",
  "/select",
  "/status",
  "/call",
  "/calls",
  "/compiled",
  "/frontend",
  "/settings",
  "/client-details-overview",
  "/appointments",
  "/billing",
  "/contacts",
  "/agents",
  "/gigaai",
  "/opportunities",
  "/schedule",
  "/security",
];

export default function FloatingDashboardButton() {
  const pathname = usePathname() || "/";

  if (pathname === "/") return null;
  for (const prefix of HIDDEN_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return null;
  }

  return (
    <Link
      href="/dashboard"
      className="fixed top-4 left-4 z-50 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-black/70 backdrop-blur border border-white/10 text-white/70 hover:text-white hover:bg-black/90 transition text-sm font-medium shadow-lg"
      aria-label="Back to Dashboard"
    >
      <ArrowLeft className="w-4 h-4" />
      <span className="hidden sm:inline">Dashboard</span>
    </Link>
  );
}
