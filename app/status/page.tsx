import type { Metadata } from "next";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "System Status — Drift",
  description: "Real-time status of the Drift platform.",
};

// Never cache — this page must reflect live status when hit.
export const dynamic = "force-dynamic";
export const revalidate = 0;

type ComponentStatus = {
  name: string;
  description: string;
  status: "operational" | "degraded" | "outage" | "unknown";
  latencyMs?: number | null;
  detail?: string;
};

async function checkDatabase(): Promise<ComponentStatus> {
  const start = Date.now();
  try {
    // Lightweight query that exercises the connection pool + RLS bypass.
    const { error } = await supabaseAdmin
      .from("workspaces")
      .select("id", { count: "exact", head: true });
    const latencyMs = Date.now() - start;
    if (error) {
      return {
        name: "Database",
        description: "Primary Postgres database (Supabase).",
        status: "outage",
        latencyMs,
        detail: error.message,
      };
    }
    return {
      name: "Database",
      description: "Primary Postgres database (Supabase).",
      status: latencyMs > 1500 ? "degraded" : "operational",
      latencyMs,
    };
  } catch (err: any) {
    return {
      name: "Database",
      description: "Primary Postgres database (Supabase).",
      status: "outage",
      detail: err?.message || String(err),
    };
  }
}

async function checkAuth(): Promise<ComponentStatus> {
  const start = Date.now();
  try {
    // auth.admin.listUsers with perPage=1 is the cheapest live probe
    // that exercises the auth subsystem without touching user tables.
    const { error } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1,
    });
    const latencyMs = Date.now() - start;
    if (error) {
      return {
        name: "Authentication",
        description: "User sign-in and workspace identity.",
        status: "outage",
        latencyMs,
        detail: error.message,
      };
    }
    return {
      name: "Authentication",
      description: "User sign-in and workspace identity.",
      status: latencyMs > 2000 ? "degraded" : "operational",
      latencyMs,
    };
  } catch (err: any) {
    return {
      name: "Authentication",
      description: "User sign-in and workspace identity.",
      status: "outage",
      detail: err?.message || String(err),
    };
  }
}

function checkApplication(): ComponentStatus {
  // If this page is rendering, the application server is up.
  return {
    name: "Application",
    description: "Drift web application and API.",
    status: "operational",
    latencyMs: 0,
  };
}

const STATUS_META: Record<
  ComponentStatus["status"],
  { label: string; dotColor: string; toneColor: string; softBg: string; softBorder: string }
> = {
  operational: {
    label: "Operational",
    dotColor: "var(--verified)",
    toneColor: "var(--verified)",
    softBg: "var(--verified-soft)",
    softBorder: "var(--verified)",
  },
  degraded: {
    label: "Degraded performance",
    dotColor: "var(--flag)",
    toneColor: "var(--flag)",
    softBg: "var(--flag-soft)",
    softBorder: "var(--flag)",
  },
  outage: {
    label: "Major outage",
    dotColor: "var(--danger)",
    toneColor: "var(--danger)",
    softBg: "var(--danger-soft)",
    softBorder: "var(--danger)",
  },
  unknown: {
    label: "Unknown",
    dotColor: "var(--ink-subtle)",
    toneColor: "var(--ink-muted)",
    softBg: "var(--canvas-subtle)",
    softBorder: "var(--rule)",
  },
};

function overall(components: ComponentStatus[]): ComponentStatus["status"] {
  if (components.some((c) => c.status === "outage")) return "outage";
  if (components.some((c) => c.status === "degraded")) return "degraded";
  if (components.some((c) => c.status === "unknown")) return "unknown";
  return "operational";
}

export default async function StatusPage() {
  const [app, db, auth] = await Promise.all([
    Promise.resolve(checkApplication()),
    checkDatabase(),
    checkAuth(),
  ]);
  const components = [app, db, auth];
  const overallStatus = overall(components);
  const overallMeta = STATUS_META[overallStatus];

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <div className="border-b border-[var(--rule)]">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2 group">
            <img
              src="/brand/logo-circle.png"
              alt="Drift"
              className="w-6 h-6 rounded-full object-cover"
            />
            <span className="text-base font-medium text-[var(--ink)]">
              Drift
            </span>
          </Link>
          <nav className="flex items-center gap-5 text-sm text-[var(--ink-muted)]">
            <Link href="/terms" className="hover:text-[var(--ink)] transition">Terms</Link>
            <Link href="/privacy" className="hover:text-[var(--ink)] transition">Privacy</Link>
            <Link href="/security" className="hover:text-[var(--ink)] transition">Security</Link>
          </nav>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-16">
        <p className="label-section text-[var(--ink-subtle)]">
          Status
        </p>
        <h1 className="heading-display text-4xl mt-3">System status</h1>
        <p className="mt-3 text-[var(--ink-muted)] text-sm">
          Checked live when you loaded this page. For persistent incidents or
          historical uptime, email{" "}
          <a
            href="mailto:support@driftai.studio"
            className="text-[var(--accent)] underline underline-offset-2"
          >
            support@driftai.studio
          </a>
          .
        </p>

        <div
          className="mt-10 card-flat p-6"
          style={{
            backgroundColor: overallMeta.softBg,
            borderColor: overallMeta.softBorder,
          }}
        >
          <div className="flex items-center gap-3">
            <span
              className="inline-flex rounded-full h-3 w-3"
              style={{ backgroundColor: overallMeta.dotColor }}
            />
            <span
              className="text-lg font-semibold"
              style={{ color: overallMeta.toneColor }}
            >
              {overallStatus === "operational"
                ? "All systems operational"
                : overallStatus === "degraded"
                ? "Some systems are degraded"
                : overallStatus === "outage"
                ? "Major outage in progress"
                : "Status unknown"}
            </span>
          </div>
        </div>

        <div className="mt-8 card-flat overflow-hidden">
          {components.map((c, idx) => {
            const meta = STATUS_META[c.status];
            return (
              <div
                key={c.name}
                className={`p-5 flex items-center justify-between gap-6 ${
                  idx > 0 ? "border-t border-[var(--rule)]" : ""
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="inline-flex h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: meta.dotColor }}
                    />
                    <h3 className="text-base font-medium text-[var(--ink)]">{c.name}</h3>
                  </div>
                  <p className="mt-1.5 text-sm text-[var(--ink-muted)] truncate">
                    {c.description}
                  </p>
                  {c.detail && c.status !== "operational" && (
                    <p className="mt-2 text-xs text-[var(--ink-subtle)] mono truncate">
                      {c.detail}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div
                    className="text-sm font-medium"
                    style={{ color: meta.toneColor }}
                  >
                    {meta.label}
                  </div>
                  {typeof c.latencyMs === "number" && (
                    <div className="text-xs text-[var(--ink-subtle)] mt-0.5 mono">
                      {c.latencyMs} ms
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-12 text-xs text-[var(--ink-subtle)] text-center mono">
          Last checked {new Date().toISOString()}
        </p>
      </div>
    </div>
  );
}
