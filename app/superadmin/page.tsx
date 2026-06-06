// app/superadmin/page.tsx
export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { hasSuperadminAccess } from "@/lib/superadmin";

export default async function SuperadminPage() {
  const supabase = await createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");

  // Check if user is actually a superadmin
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_superadmin, full_name")
    .eq("id", user.id)
    .maybeSingle();

  // If not superadmin, redirect to regular dashboard
  if (!hasSuperadminAccess(user.email, profile?.is_superadmin)) {
    redirect("/");
  }

  return (
    <main className="bg-[var(--canvas)] min-h-screen text-[var(--ink)]">
      {/* Top bar */}
      <div className="border-b border-[var(--rule)]">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold">Drift</span>
            <span className="text-xs text-[var(--ink-subtle)]">/</span>
            <span className="text-xs text-[var(--ink-muted)]">Superadmin</span>
          </div>
          <Link
            href="/home"
            className="text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors"
          >
            Back to dashboard
          </Link>
        </div>
      </div>

      {/* Header */}
      <section className="mx-auto max-w-6xl px-6 pt-12 pb-10">
        <div className="label-section mb-4">Superadmin console</div>
        <h1 className="heading-display text-4xl mb-3">Platform Administration</h1>
        <p className="text-[var(--ink-muted)] max-w-2xl">
          Manage the entire Drift AI platform, users, and system-wide operations.
        </p>
      </section>

      {/* Dashboard Cards */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* System Administration */}
          <Link
            href="/admin"
            className="card-flat card-flat-hover p-5 block"
          >
            <div className="label-section mb-3">System</div>
            <h3 className="text-lg font-semibold mb-2 text-[var(--ink)]">
              System Administration
            </h3>
            <p className="text-sm text-[var(--ink-muted)] leading-relaxed">
              Manage workspaces, users, and system-wide settings across the platform.
            </p>
          </Link>

          {/* Analytics & Reports */}
          <Link
            href="/admin/analytics"
            className="card-flat card-flat-hover p-5 block"
          >
            <div className="label-section mb-3">Analytics</div>
            <h3 className="text-lg font-semibold mb-2 text-[var(--ink)]">
              Analytics & Reports
            </h3>
            <p className="text-sm text-[var(--ink-muted)] leading-relaxed">
              Platform-wide expense tracking, usage analytics, and comprehensive reporting.
            </p>
          </Link>

          {/* Quick Actions */}
          <div className="card-flat p-5">
            <div className="label-section mb-3">Quick actions</div>
            <h3 className="text-lg font-semibold mb-3 text-[var(--ink)]">
              Operations
            </h3>
            <ul className="space-y-2 text-sm text-[var(--ink-muted)]">
              <li>— View all workspaces</li>
              <li>— Monitor system health</li>
              <li>— Access debug tools</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Status Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-[var(--canvas)] border-t border-[var(--rule)]">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between text-xs">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--verified)]" />
              <span className="label-section">Superadmin mode</span>
            </div>
            <span className="text-[var(--ink-subtle)]">|</span>
            <span className="text-[var(--ink-muted)]">Platform control active</span>
            <span className="text-[var(--ink-subtle)]">|</span>
            <span className="text-[var(--ink-muted)]">Secure connection</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[var(--ink-muted)]">Signed in as</span>
            <span className="mono text-[var(--ink)]">
              {profile?.full_name || "Administrator"}
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}
