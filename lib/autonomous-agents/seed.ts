import { supabaseAdmin } from "@/lib/supabase/admin";

const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS wm_agent_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  purpose TEXT NOT NULL,
  type TEXT DEFAULT 'AUTONOMOUS',
  status TEXT DEFAULT 'IDLE',
  success_rate DOUBLE PRECISION DEFAULT 0,
  confidence_level DOUBLE PRECISION DEFAULT 0,
  outputs_today INT DEFAULT 0,
  pending_reviews INT DEFAULT 0,
  icon TEXT DEFAULT 'Zap',
  color_class TEXT DEFAULT 'text-blue-400',
  last_run TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wm_agent_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES wm_agent_definitions(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  status TEXT DEFAULT 'PENDING',
  output TEXT,
  linked_client TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wm_agent_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES wm_agent_definitions(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  summary TEXT NOT NULL,
  review_status TEXT DEFAULT 'PENDING',
  linked_client TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
`;

const AGENT_TEMPLATES = [
  {
    name: "Engagement Monitor",
    purpose:
      "Scans contacts for engagement gaps — flags anyone not contacted in 14+ days and suggests follow-up actions",
    icon: "Users",
    color_class: "text-blue-400",
  },
  {
    name: "Revenue Analyzer",
    purpose:
      "Analyzes sales records for trends, top accounts, declining revenue, and upsell opportunities",
    icon: "DollarSign",
    color_class: "text-emerald-400",
  },
  {
    name: "Conversation Reviewer",
    purpose:
      "Reviews completed conversations for quality, sentiment, and missed opportunities",
    icon: "MessageSquare",
    color_class: "text-purple-400",
  },
  {
    name: "Task Generator",
    purpose:
      "Scans recent activity (new contacts, completed conversations, booked appointments) and suggests follow-up tasks",
    icon: "CheckCircle",
    color_class: "text-amber-400",
  },
  {
    name: "Churn Risk Detector",
    purpose:
      "Identifies contacts with declining engagement patterns and high churn probability",
    icon: "AlertTriangle",
    color_class: "text-rose-400",
  },
  {
    name: "Meeting Follow-up",
    purpose:
      "Analyzes recent and upcoming appointments — generates prep briefs before meetings and follow-up action items after",
    icon: "Calendar",
    color_class: "text-cyan-400",
  },
];

async function runSQL(sql: string): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return false;

  // Use the Supabase pg endpoint for raw SQL
  const pgUrl = `${supabaseUrl}/rest/v1/rpc/exec_sql`;
  const rpcRes = await fetch(pgUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ sql }),
  }).catch(() => null);

  if (rpcRes && rpcRes.ok) return true;

  // Fallback: try the Supabase SQL endpoint (available on newer versions)
  const sqlUrl = supabaseUrl.replace(".supabase.co", ".supabase.co").replace(/\/$/, "");
  const pgSqlUrl = `${sqlUrl}/pg`;
  const pgRes = await fetch(pgSqlUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ query: sql }),
  }).catch(() => null);

  return pgRes?.ok ?? false;
}

async function ensureTablesExist(): Promise<void> {
  const { error } = await supabaseAdmin
    .from("wm_agent_definitions")
    .select("id")
    .limit(1);

  if (!error) return; // Table exists

  console.log("wm_agent_definitions table missing, creating...", error.message);

  // First ensure exec_sql function exists
  await runSQL(
    `CREATE OR REPLACE FUNCTION exec_sql(sql text) RETURNS void AS $$ BEGIN EXECUTE sql; END; $$ LANGUAGE plpgsql SECURITY DEFINER;`
  );

  // Now create the tables
  const success = await runSQL(CREATE_TABLES_SQL);
  if (success) {
    console.log("WM agent tables created successfully");
  } else {
    console.error("Failed to create WM agent tables via RPC, trying statement by statement...");
    const statements = CREATE_TABLES_SQL.split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 10);
    for (const stmt of statements) {
      await runSQL(stmt + ";");
    }
  }
}

export async function seedAutonomousAgents(workspaceId: string) {
  await ensureTablesExist();

  const { data: existing, error: existErr } = await supabaseAdmin
    .from("wm_agent_definitions")
    .select("name")
    .eq("workspace_id", workspaceId);

  if (existErr) {
    console.error("wm_agent_definitions query failed:", existErr);
    return [];
  }

  const existingNames = new Set((existing || []).map((a) => a.name));

  const toInsert = AGENT_TEMPLATES.filter(
    (t) => !existingNames.has(t.name)
  ).map((t) => ({
    workspace_id: workspaceId,
    name: t.name,
    purpose: t.purpose,
    icon: t.icon,
    color_class: t.color_class,
    type: "AUTONOMOUS",
    status: "IDLE",
    success_rate: 0,
    confidence_level: 0,
    outputs_today: 0,
    pending_reviews: 0,
  }));

  if (toInsert.length > 0) {
    await supabaseAdmin.from("wm_agent_definitions").insert(toInsert);
  }

  const { data: agents } = await supabaseAdmin
    .from("wm_agent_definitions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });

  return agents || [];
}
