import { supabaseAdmin } from "@/lib/supabase/admin";
import { buildAgentPrompt } from "./prompts";
import { recordLlmUsage } from "@/lib/usage/track";

interface AgentDef {
  id: string;
  workspace_id: string;
  name: string;
  purpose: string;
  success_rate: number;
}

interface LLMOutput {
  title: string;
  type: string;
  summary: string;
  linked_client: string | null;
}

interface LLMTask {
  description: string;
  linked_client: string | null;
}

interface LLMResponse {
  outputs: LLMOutput[];
  tasks: LLMTask[];
  confidence: number;
}

// ── Data loaders ──────────────────────────────────────────────

async function loadEngagementData(wid: string): Promise<string> {
  const { data: contacts } = await supabaseAdmin
    .from("contacts")
    .select("id, name, email, phone, created_at")
    .eq("workspace_id", wid);

  if (!contacts?.length) return "No contacts found.";

  const now = Date.now();
  const lines: string[] = [`Total contacts: ${contacts.length}`, ""];

  for (const c of contacts) {
    const [{ data: notes }, { data: appts }] = await Promise.all([
      supabaseAdmin
        .from("notes")
        .select("created_at")
        .eq("contact_id", c.id)
        .eq("workspace_id", wid)
        .order("created_at", { ascending: false })
        .limit(1),
      supabaseAdmin
        .from("appointments")
        .select("scheduled_at")
        .eq("contact_id", c.id)
        .eq("workspace_id", wid)
        .order("scheduled_at", { ascending: false })
        .limit(1),
    ]);

    const lastNote = notes?.[0]?.created_at;
    const lastAppt = appts?.[0]?.scheduled_at;
    const lastInteraction = [lastNote, lastAppt]
      .filter(Boolean)
      .sort()
      .pop();

    const daysSince = lastInteraction
      ? Math.floor((now - new Date(lastInteraction).getTime()) / 86400000)
      : Math.floor((now - new Date(c.created_at).getTime()) / 86400000);

    lines.push(
      `- ${c.name} | Email: ${c.email || "none"} | Phone: ${c.phone || "none"} | Days since last interaction: ${daysSince} | Created: ${c.created_at?.slice(0, 10)}`
    );
  }

  return lines.join("\n");
}

async function loadRevenueData(wid: string): Promise<string> {
  const { data: records } = await supabaseAdmin
    .from("sales_records")
    .select("product, price, company_name, created_at, month, year")
    .eq("workspace_id", wid)
    .order("created_at", { ascending: false });

  if (!records?.length) return "No sales records found.";

  const total = records.reduce((s, r) => s + (Number(r.price) || 0), 0);
  const byCompany: Record<string, number> = {};
  for (const r of records) {
    const co = r.company_name || "Unknown";
    byCompany[co] = (byCompany[co] || 0) + (Number(r.price) || 0);
  }

  const lines = [
    `Total revenue: $${total.toFixed(2)}`,
    `Total records: ${records.length}`,
    "",
    "Revenue by company:",
    ...Object.entries(byCompany)
      .sort((a, b) => b[1] - a[1])
      .map(([co, v]) => `  - ${co}: $${v.toFixed(2)}`),
    "",
    "Recent sales (last 20):",
    ...records.slice(0, 20).map(
      (r) =>
        `  - ${r.created_at?.slice(0, 10)} | ${r.product || "N/A"} | $${r.price} | ${r.company_name || "N/A"}`
    ),
  ];

  return lines.join("\n");
}

async function loadConversationData(wid: string): Promise<string> {
  const { data: convos } = await supabaseAdmin
    .from("conversations")
    .select("id, agent_id, transcript, created_at, modality, status")
    .eq("workspace_id", wid)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(20);

  if (!convos?.length) return "No completed conversations found.";

  const agentIds = [...new Set(convos.map((c) => c.agent_id).filter(Boolean))];
  const { data: agents } = await supabaseAdmin
    .from("agents")
    .select("id, name")
    .in("id", agentIds.length ? agentIds : ["__none__"]);

  const agentMap = new Map((agents || []).map((a) => [a.id, a.name]));

  const lines = [`Completed conversations: ${convos.length}`, ""];

  for (const c of convos) {
    const agentName = agentMap.get(c.agent_id) || "Unknown Agent";
    let transcriptSnippet = "";
    try {
      const t = typeof c.transcript === "string" ? JSON.parse(c.transcript) : c.transcript;
      if (Array.isArray(t)) {
        transcriptSnippet = t
          .slice(-8)
          .map((m: { role?: string; content?: string }) => `${m.role}: ${m.content}`)
          .join(" | ");
      }
    } catch {
      transcriptSnippet = "(transcript unavailable)";
    }

    lines.push(
      `- Date: ${c.created_at?.slice(0, 10)} | Agent: ${agentName} | Modality: ${c.modality || "chat"}`,
      `  Transcript excerpt: ${transcriptSnippet.slice(0, 500)}`,
      ""
    );
  }

  return lines.join("\n");
}

async function loadTaskGenData(wid: string): Promise<string> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const sevenDaysFromNow = new Date(Date.now() + 7 * 86400000).toISOString();

  const [{ data: newContacts }, { data: recentConvos }, { data: upcomingAppts }, { data: openTasks }] =
    await Promise.all([
      supabaseAdmin
        .from("contacts")
        .select("name, email, created_at")
        .eq("workspace_id", wid)
        .gte("created_at", sevenDaysAgo),
      supabaseAdmin
        .from("conversations")
        .select("id, agent_id, status, created_at")
        .eq("workspace_id", wid)
        .eq("status", "completed")
        .gte("created_at", sevenDaysAgo),
      supabaseAdmin
        .from("appointments")
        .select("id, contact_id, scheduled_at, service_type, status")
        .eq("workspace_id", wid)
        .gte("scheduled_at", new Date().toISOString())
        .lte("scheduled_at", sevenDaysFromNow),
      supabaseAdmin
        .from("tasks")
        .select("title, status")
        .eq("workspace_id", wid)
        .eq("status", "open"),
    ]);

  const contactNames = (newContacts || []).map((c) => c.name);
  const { data: contactsForAppts } = await supabaseAdmin
    .from("contacts")
    .select("id, name")
    .eq("workspace_id", wid);
  const contactMap = new Map((contactsForAppts || []).map((c) => [c.id, c.name]));

  const lines = [
    `New contacts (last 7 days): ${(newContacts || []).length}`,
    ...(newContacts || []).map((c) => `  - ${c.name} (${c.email || "no email"}) added ${c.created_at?.slice(0, 10)}`),
    "",
    `Completed conversations (last 7 days): ${(recentConvos || []).length}`,
    "",
    `Upcoming appointments (next 7 days): ${(upcomingAppts || []).length}`,
    ...(upcomingAppts || []).map(
      (a) => `  - ${contactMap.get(a.contact_id) || "Unknown"} | ${a.service_type || "General"} | ${a.scheduled_at?.slice(0, 10)} | Status: ${a.status}`
    ),
    "",
    `Existing open tasks: ${(openTasks || []).length}`,
    ...(openTasks || []).map((t) => `  - ${t.title}`),
  ];

  return lines.join("\n");
}

async function loadChurnData(wid: string): Promise<string> {
  const { data: contacts } = await supabaseAdmin
    .from("contacts")
    .select("id, name, email, created_at")
    .eq("workspace_id", wid);

  if (!contacts?.length) return "No contacts found.";

  const now = Date.now();
  const lines = [`Total contacts: ${contacts.length}`, "", "Contact engagement profile:"];

  for (const c of contacts) {
    const [{ data: notes, count: noteCount }, { data: appts, count: apptCount }] =
      await Promise.all([
        supabaseAdmin
          .from("notes")
          .select("created_at", { count: "exact" })
          .eq("contact_id", c.id)
          .eq("workspace_id", wid)
          .order("created_at", { ascending: false })
          .limit(1),
        supabaseAdmin
          .from("appointments")
          .select("scheduled_at", { count: "exact" })
          .eq("contact_id", c.id)
          .eq("workspace_id", wid)
          .order("scheduled_at", { ascending: false })
          .limit(1),
      ]);

    const daysSinceCreated = Math.floor(
      (now - new Date(c.created_at).getTime()) / 86400000
    );
    const lastNote = notes?.[0]?.created_at;
    const lastAppt = appts?.[0]?.scheduled_at;
    const daysSinceNote = lastNote
      ? Math.floor((now - new Date(lastNote).getTime()) / 86400000)
      : -1;
    const daysSinceAppt = lastAppt
      ? Math.floor((now - new Date(lastAppt).getTime()) / 86400000)
      : -1;

    lines.push(
      `- ${c.name} | Created ${daysSinceCreated}d ago | Notes: ${noteCount ?? 0} (last: ${daysSinceNote >= 0 ? daysSinceNote + "d ago" : "never"}) | Appointments: ${apptCount ?? 0} (last: ${daysSinceAppt >= 0 ? daysSinceAppt + "d ago" : "never"})`
    );
  }

  return lines.join("\n");
}

async function loadMeetingData(wid: string): Promise<string> {
  const now = new Date();
  const twoDaysAgo = new Date(now.getTime() - 2 * 86400000).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
  const twoDaysFromNow = new Date(now.getTime() + 2 * 86400000).toISOString();

  const [{ data: upcoming }, { data: recent }, { data: contacts }] =
    await Promise.all([
      supabaseAdmin
        .from("appointments")
        .select("id, contact_id, scheduled_at, service_type, status, notes")
        .eq("workspace_id", wid)
        .gte("scheduled_at", now.toISOString())
        .lte("scheduled_at", twoDaysFromNow)
        .order("scheduled_at", { ascending: true }),
      supabaseAdmin
        .from("appointments")
        .select("id, contact_id, scheduled_at, service_type, status, notes")
        .eq("workspace_id", wid)
        .gte("scheduled_at", sevenDaysAgo)
        .lte("scheduled_at", now.toISOString())
        .order("scheduled_at", { ascending: false }),
      supabaseAdmin
        .from("contacts")
        .select("id, name, email, phone")
        .eq("workspace_id", wid),
    ]);

  const contactMap = new Map(
    (contacts || []).map((c) => [c.id, c])
  );

  const lines: string[] = [];

  lines.push(`=== UPCOMING MEETINGS (next 48 hours) ===`);
  if (!upcoming?.length) {
    lines.push("No upcoming meetings in the next 48 hours.");
  } else {
    for (const appt of upcoming) {
      const contact = contactMap.get(appt.contact_id);
      const hoursUntil = Math.round(
        (new Date(appt.scheduled_at).getTime() - now.getTime()) / 3600000
      );
      lines.push(
        `- ${contact?.name || "Unknown"} | ${appt.service_type || "General"} | In ${hoursUntil}h | Status: ${appt.status}`,
        `  Email: ${contact?.email || "none"} | Phone: ${contact?.phone || "none"}`,
        `  Notes: ${appt.notes || "none"}`,
        ""
      );
    }
  }

  lines.push("", `=== RECENT MEETINGS (last 7 days) ===`);
  if (!recent?.length) {
    lines.push("No recent meetings in the last 7 days.");
  } else {
    for (const appt of recent) {
      const contact = contactMap.get(appt.contact_id);
      const daysAgo = Math.round(
        (now.getTime() - new Date(appt.scheduled_at).getTime()) / 86400000
      );
      lines.push(
        `- ${contact?.name || "Unknown"} | ${appt.service_type || "General"} | ${daysAgo}d ago | Status: ${appt.status}`,
        `  Email: ${contact?.email || "none"} | Phone: ${contact?.phone || "none"}`,
        `  Notes: ${appt.notes || "none"}`,
        ""
      );
    }
  }

  return lines.join("\n");
}

const DATA_LOADERS: Record<string, (wid: string) => Promise<string>> = {
  "Engagement Monitor": loadEngagementData,
  "Revenue Analyzer": loadRevenueData,
  "Conversation Reviewer": loadConversationData,
  "Task Generator": loadTaskGenData,
  "Churn Risk Detector": loadChurnData,
  "Meeting Follow-up": loadMeetingData,
};

// ── Main executor ─────────────────────────────────────────────

export async function executeAutonomousAgent(
  agentId: string,
  workspaceId: string
): Promise<{ success: boolean; outputCount: number; taskCount: number; error?: string }> {
  const { data: agent, error: agentErr } = await supabaseAdmin
    .from("wm_agent_definitions")
    .select("*")
    .eq("id", agentId)
    .eq("workspace_id", workspaceId)
    .single();

  if (!agent || agentErr) {
    return { success: false, outputCount: 0, taskCount: 0, error: "Agent not found" };
  }

  await supabaseAdmin
    .from("wm_agent_definitions")
    .update({ status: "RUNNING", last_run: new Date().toISOString() })
    .eq("id", agentId);

  try {
    const loader = DATA_LOADERS[agent.name];
    if (!loader) {
      throw new Error(`No data loader for agent: ${agent.name}`);
    }

    const data = await loader(workspaceId);
    const { system, user } = buildAgentPrompt(agent.name, agent.purpose, data);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${body.slice(0, 200)}`);
    }

    const json = await res.json();
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty response from OpenAI");

    if (json.usage) {
      recordLlmUsage({
        workspaceId,
        model: "gpt-4o-mini",
        inputTokens: json.usage.prompt_tokens ?? 0,
        outputTokens: json.usage.completion_tokens ?? 0,
        source: "autonomous_agent",
        metadata: { agent_id: agentId, agent_name: agent.name },
      });
    }

    let parsed: LLMResponse;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error("Failed to parse LLM response as JSON");
    }

    const outputs = Array.isArray(parsed.outputs) ? parsed.outputs : [];
    const tasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
    const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.5;

    if (outputs.length > 0) {
      await supabaseAdmin.from("wm_agent_outputs").insert(
        outputs.map((o) => ({
          agent_id: agentId,
          workspace_id: workspaceId,
          title: (o.title || "Untitled").slice(0, 200),
          type: ["insight", "recommendation", "alert", "report"].includes(o.type) ? o.type : "insight",
          summary: (o.summary || "").slice(0, 2000),
          review_status: "PENDING",
          linked_client: o.linked_client || null,
        }))
      );
    }

    if (tasks.length > 0) {
      await supabaseAdmin.from("wm_agent_tasks").insert(
        tasks.map((t) => ({
          agent_id: agentId,
          workspace_id: workspaceId,
          description: (t.description || "").slice(0, 1000),
          status: "PENDING",
          linked_client: t.linked_client || null,
        }))
      );
    }

    const oldRate = agent.success_rate || 0;
    const newRate = Math.round(oldRate * 0.8 + 100 * 0.2);

    await supabaseAdmin
      .from("wm_agent_definitions")
      .update({
        status: "IDLE",
        success_rate: newRate,
        confidence_level: Math.round(confidence * 100),
        outputs_today: outputs.length,
        pending_reviews: outputs.length,
        last_error: null,
      })
      .eq("id", agentId);

    return { success: true, outputCount: outputs.length, taskCount: tasks.length };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    const oldRate = (agent as AgentDef).success_rate || 0;
    await supabaseAdmin
      .from("wm_agent_definitions")
      .update({
        status: "ERROR",
        last_error: message.slice(0, 500),
        success_rate: Math.round(oldRate * 0.8),
      })
      .eq("id", agentId);

    return { success: false, outputCount: 0, taskCount: 0, error: message };
  }
}
