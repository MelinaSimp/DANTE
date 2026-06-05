// POST /api/onboarding/seed-demo — seed a workspace with sample CRE data.
//
// Called from the onboarding wizard's "Load demo data" button or
// from admin tools. Creates sample memory entries, a sample workflow,
// and sample vault metadata so the workspace feels alive on first visit.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const DEMO_MEMORY = [
  {
    kind: "fact",
    title: "Portfolio overview",
    content:
      "Current portfolio: 4 properties totaling 45,000 SF across retail and office. Total appraised value approximately $12.5M. Average cap rate 7.0%, average occupancy 92.5%. Focus on NNN retail in secondary markets.",
  },
  {
    kind: "fact",
    title: "Maple Ridge Plaza",
    content:
      "12,000 SF strip center at 4821 Maple Ridge Dr, Willoughby OH 44094. Built 2004, 95% occupied. Anchor: Great Clips (2,400 SF, lease through 2029). NOI $240K, cap rate 7.2%. Recent: new roof 2024, parking lot reseal 2025.",
  },
  {
    kind: "fact",
    title: "Cedar Point Office Center",
    content:
      "18,000 SF Class B office at 1200 Cedar Point Rd, Sandusky OH 44870. Built 1998, 88% occupied. Three tenants, largest is Lakeshore Insurance (8,000 SF, lease expires Dec 2027). NOI $198K, cap rate 6.8%.",
  },
  {
    kind: "preference",
    title: "Deal screening criteria",
    content:
      "Minimum deal size $500K. Target cap rate 6.5-8.5%. Prefer NNN or modified gross leases. Hold period 5-10 years. Cash-on-cash target 8%+. Avoid ground leases and properties with environmental issues.",
  },
  {
    kind: "preference",
    title: "Target tenant profile",
    content:
      "Prefer national credit tenants (Dollar General, AutoZone, Advance Auto, medical/dental offices). Will consider strong local operators with 5+ year track record. Minimum remaining lease term 3 years for acquisitions.",
  },
];

export async function POST() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  const workspaceId = profile.workspace_id;

  // Check if demo data was already seeded
  const { count } = await supabaseAdmin
    .from("dante_memory")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("title", "Portfolio overview");
  if (count && count > 0) {
    return NextResponse.json({ status: "already_seeded" });
  }

  // Seed memory entries
  const memoryRows = DEMO_MEMORY.map((m) => ({
    workspace_id: workspaceId,
    user_id: user.id,
    kind: m.kind,
    title: m.title,
    content: m.content,
    source: "demo_seed",
  }));

  await supabaseAdmin.from("dante_memory").insert(memoryRows);

  // Seed a sample workflow (lease expiration alert)
  const triggerId = "trigger_1";
  const checkId = "check_1";
  const notifyId = "notify_1";

  await supabaseAdmin.from("dante_workflows").insert({
    workspace_id: workspaceId,
    name: "Lease expiration alert (demo)",
    description: "Weekly check for leases expiring in the next 90 days. Sends a summary to the workspace owner.",
    enabled: false, // disabled by default — demo only
    trigger: { type: "cron", cron: "0 9 * * 1" }, // Mondays at 9am
    graph: {
      nodes: [
        {
          id: triggerId,
          type: "trigger_cron",
          position: { x: 0, y: 0 },
          data: { step: { id: triggerId, type: "trigger_cron", name: "Weekly check", config: { cron: "0 9 * * 1" } } },
        },
        {
          id: checkId,
          type: "openai",
          position: { x: 300, y: 0 },
          data: {
            step: {
              id: checkId,
              type: "openai",
              name: "Find expiring leases",
              config: {
                prompt: "Search the vault and memory for any leases expiring in the next 90 days. List each one with tenant name, property, expiration date, and current rent. If none found, say so.",
                model: "claude-sonnet-4-6",
              },
            },
          },
        },
        {
          id: notifyId,
          type: "send_email",
          position: { x: 600, y: 0 },
          data: {
            step: {
              id: notifyId,
              type: "send_email",
              name: "Email summary",
              config: {
                to: "{{owner_email}}",
                subject: "Lease expirations -- next 90 days",
                body: "{{steps." + checkId + ".output.text}}",
              },
            },
          },
        },
      ],
      edges: [
        { id: `${triggerId}->${checkId}`, source: triggerId, target: checkId },
        { id: `${checkId}->${notifyId}`, source: checkId, target: notifyId },
      ],
    },
  });

  return NextResponse.json({ status: "seeded", memory_count: DEMO_MEMORY.length, workflow_count: 1 });
}
