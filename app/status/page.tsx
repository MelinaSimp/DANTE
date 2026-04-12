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
  { label: string; dot: string; tone: string }
> = {
  operational: {
    label: "Operational",
    dot: "bg-emerald-400",
    tone: "text-emerald-300",
  },
  degraded: {
    label: "Degraded performance",
    dot: "bg-amber-400",
    tone: "text-amber-300",
  },
  outage: {
    label: "Major outage",
    dot: "bg-red-500",
    tone: "text-red-300",
  },
  unknown: {
    label: "Unknown",
    dot: "bg-white/30",
    tone: "text-white/50",
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
    <div className="min-h-screen bg-[#242423] text-white">
      <div className="border-b border-white/8">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2 group">
            <img
              src="/brand/logo-circle.png"
              alt="Drift"
              className="w-6 h-6 rounded-full object-cover"
            />
            <span className="text-base font-medium text-white/80 group-hover:text-white transition">
              Drift
            </span>
          </Link>
          <nav className="flex items-center gap-5 text-sm text-white/60">
            <Link href="/terms" className="hover:text-white transition">Terms</Link>
            <Link href="/privacy" className="hover:text-white transition">Privacy</Link>
            <Link href="/security" className="hover:text-white transition">Security</Link>
          </nav>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-16">
        <p className="text-xs uppercase tracking-[0.35em] text-white/40">
          Status
        </p>
        <h1 className="mt-3 text-4xl font-semibold">System status</h1>
        <p className="mt-3 text-white/50 text-sm">
          Checked live when you loaded this page. For persistent incidents or
          historical uptime, email{" "}
          <a
            href="mailto:support@driftai.studio"
            className="text-[#7b92ff] hover:text-[#9dafff] underline underline-offset-2"
          >
            support@driftai.studio
          </a>
          .
        </p>

        <div
          className={`mt-10 rounded-3xl border p-6 ${
            overallStatus === "operational"
              ? "border-emerald-500/20 bg-emerald-500/5"
              : overallStatus === "degraded"
              ? "border-amber-500/20 bg-amber-500/5"
              : "border-red-500/20 bg-red-500/5"
          }`}
        >
          <div className="flex items-center gap-3">
            <span className={`relative flex h-3 w-3`}>
              <span
                className={`absolute inline-flex h-full w-full rounded-full ${overallMeta.dot} opacity-60 animate-ping`}
              />
              <span
                className={`relative inline-flex rounded-full h-3 w-3 ${overallMeta.dot}`}
              />
            </span>
            <span className={`text-lg font-semibold ${overallMeta.tone}`}>
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

        <div className="mt-8 space-y-3">
          {components.map((c) => {
            const meta = STATUS_META[c.status];
            return (
              <div
                key={c.name}
                className="rounded-2xl border border-white/10 bg-black/30 p-5 flex items-center justify-between gap-6"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    <span className={`inline-flex h-2.5 w-2.5 rounded-full ${meta.dot}`} />
                    <h3 className="text-base font-medium text-white">{c.name}</h3>
                  </div>
                  <p className="mt-1.5 text-sm text-white/50 truncate">
                    {c.description}
                  </p>
                  {c.detail && c.status !== "operational" && (
                    <p className="mt-2 text-xs text-white/40 font-mono truncate">
                      {c.detail}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className={`text-sm font-medium ${meta.tone}`}>
                    {meta.label}
                  </div>
                  {typeof c.latencyMs === "number" && (
                    <div className="text-xs text-white/30 mt-0.5 font-mono">
                      {c.latencyMs} ms
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-12 text-xs text-white/30 text-center">
          Last checked {new Date().toISOString()}
        </p>
      </div>
    </div>
  );
}
