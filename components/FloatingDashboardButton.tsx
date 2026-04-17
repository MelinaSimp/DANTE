"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";

// Paths where the floating back-to-dashboard button should NOT appear.
// - Dashboard itself (you're already there)
// - Auth pages (pre-login)
// - Marketing/public pages (features, privacy, terms, download, home)
// - Agent canvas (/app) has its own navigation
// - Admin + superadmin have their own shells with a back link
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
  "/test-superadmin",
  "/debug-admin",
  "/call",
  "/compiled",
  "/frontend",
  "/gigaai",
  "/railway-logs",
  "/railway-test",
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
