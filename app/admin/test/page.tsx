// Small diagnostic page the superadmin hits to verify their
// account actually carries the is_superadmin flag. Useful when
// debugging "why don't I see Admin in the nav?" — shows what
// hasSuperadminAccess() sees for this session.

import { createServerSupabase } from "@/lib/supabase/server";
import { hasSuperadminAccess, SUPERADMIN_EMAIL } from "@/lib/superadmin";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, XCircle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminTestPage() {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();

  if (!auth.user) {
    return (
      <div className="px-8 py-8 max-w-3xl mx-auto">
        <div className="label-section mb-2">Admin</div>
        <h1 className="heading-display text-4xl text-[var(--ink)] mb-2">
          Access check
        </h1>
        <p className="text-sm text-[var(--danger)]">Not signed in.</p>
      </div>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, is_superadmin, role, full_name")
    .eq("id", auth.user.id)
    .maybeSingle();

  const isAdmin = hasSuperadminAccess(auth.user.email, profile?.is_superadmin);

  return (
    <div className="px-8 py-8 max-w-3xl mx-auto">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition mb-6"
      >
        <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
        Admin
      </Link>

      <div className="mb-8">
        <div className="label-section mb-2">Admin</div>
        <h1 className="heading-display text-4xl text-[var(--ink)] mb-2">
          Access check
        </h1>
        <p className="text-[var(--ink-muted)] text-sm">
          What <span className="mono">hasSuperadminAccess()</span> sees for
          this session.
        </p>
      </div>

      <div className="card-flat p-5 mb-6">
        <dl className="text-sm divide-y divide-[var(--rule)]">
          <Row label="Your email" value={auth.user.email || "—"} />
          <Row label="Superadmin email" value={SUPERADMIN_EMAIL || "— not configured —"} mono />
          <Row
            label="Profile is_superadmin"
            value={profile?.is_superadmin ? "true" : "false"}
            mono
          />
          <Row label="Profile role" value={profile?.role || "null"} mono />
          <Row label="User ID" value={auth.user.id} mono />
          <Row label="Profile ID" value={profile?.id || "—"} mono />
        </dl>
      </div>

      <div className="card-flat p-5 flex items-start gap-3">
        {isAdmin ? (
          <>
            <CheckCircle2
              className="w-5 h-5 text-[var(--verified)] shrink-0 mt-0.5"
              strokeWidth={1.5}
            />
            <div>
              <div className="text-sm font-medium text-[var(--ink)]">
                Superadmin access granted.
              </div>
              <p className="text-sm text-[var(--ink-muted)] mt-1">
                The Admin link will appear in the dashboard header.
              </p>
            </div>
          </>
        ) : (
          <>
            <XCircle
              className="w-5 h-5 text-[var(--danger)] shrink-0 mt-0.5"
              strokeWidth={1.5}
            />
            <div>
              <div className="text-sm font-medium text-[var(--ink)]">
                No superadmin access.
              </div>
              <ul className="mt-1 text-sm text-[var(--ink-muted)] list-disc list-inside space-y-0.5">
                <li>
                  Your email must match <span className="mono">{SUPERADMIN_EMAIL}</span>,
                  or
                </li>
                <li>
                  <span className="mono">is_superadmin = true</span> on your
                  profile row.
                </li>
                <li>Sign out and back in after flipping the flag.</li>
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="py-2.5 flex items-baseline gap-4">
      <dt className="label-section w-40 shrink-0">{label}</dt>
      <dd
        className={`text-[var(--ink)] break-all ${mono ? "mono text-xs" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
