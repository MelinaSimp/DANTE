import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id, is_superadmin")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.workspace_id && !profile?.is_superadmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const wid = profile.workspace_id;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  // Build workspace-scoped queries; for superadmins without a workspace,
  // workspace-scoped tables return empty results gracefully.
  const wsFilter = (q: any) => (wid ? q.eq("workspace_id", wid) : q.limit(0));

  const [
    { data: contacts },
    { data: agents },
    { data: conversations },
    { data: recentConversations },
    { data: salesRecords },
    { data: recentSales },
    { data: appointments },
    { data: upcomingMeetings },
    { data: tasks },
    { data: automationEvents },
  ] = await Promise.all([
    wsFilter(supabaseAdmin.from("contacts").select("id, name, phone, email, created_at")),
    wsFilter(supabaseAdmin.from("agents").select("id, name, status, created_at")),
    wsFilter(supabaseAdmin.from("conversations").select("id, status, created_at, modality")),
    wid
      ? supabaseAdmin.from("conversations").select("id, created_at").eq("workspace_id", wid).gte("created_at", sevenDaysAgo)
      : supabaseAdmin.from("conversations").select("id, created_at").limit(0),
    wsFilter(supabaseAdmin.from("sales_records").select("id, product, price, company_name, created_at, month, year")),
    wid
      ? supabaseAdmin.from("sales_records").select("id, price, created_at").eq("workspace_id", wid).gte("created_at", thirtyDaysAgo)
      : supabaseAdmin.from("sales_records").select("id, price, created_at").limit(0),
    wsFilter(supabaseAdmin.from("appointments").select("id, status, scheduled_at, created_at")),
    wid
      ? supabaseAdmin.from("appointments").select("id, contact_id, scheduled_at, service_type, status, notes").eq("workspace_id", wid).gte("scheduled_at", new Date().toISOString()).order("scheduled_at", { ascending: true }).limit(5)
      : supabaseAdmin.from("appointments").select("id").limit(0),
    wsFilter(supabaseAdmin.from("tasks").select("id, title, status, due_at, created_at")),
    wid
      ? supabaseAdmin.from("automation_events").select("id, event_type, created_at").eq("workspace_id", wid).gte("created_at", sevenDaysAgo)
      : supabaseAdmin.from("automation_events").select("id, event_type, created_at").limit(0),
  ]);

  const totalRevenue = (salesRecords || []).reduce((sum: number, r: any) => sum + (r.price || 0), 0);
  const recentRevenue = (recentSales || []).reduce((sum: number, r: any) => sum + (r.price || 0), 0);
  const formattedRevenue = totalRevenue >= 1_000_000
    ? `$${(totalRevenue / 1_000_000).toFixed(1)}M`
    : totalRevenue >= 1_000
      ? `$${(totalRevenue / 1_000).toFixed(1)}k`
      : `$${totalRevenue.toLocaleString()}`;
  const formattedRecentRevenue = recentRevenue > 0
    ? `+$${recentRevenue >= 1000 ? (recentRevenue / 1000).toFixed(1) + "k" : recentRevenue.toLocaleString()} (30d)`
    : "No recent sales";

  const deployedAgents = (agents || []).filter((a: any) => a.status === "deployed").length;
  const activeConversations = (conversations || []).filter((c: any) => c.status === "active" || c.status === "in_progress").length;
  const upcomingAppointments = (appointments || []).filter((a: any) => a.status !== "cancelled" && new Date(a.scheduled_at) > new Date()).length;
  const pendingTasks = (tasks || []).filter((t: any) => t.status !== "completed" && t.status !== "done").length;

  // Priority alerts
  const alerts: any[] = [];

  const staleContacts = (contacts || []).filter((c: any) => {
    const created = new Date(c.created_at);
    return Date.now() - created.getTime() > 30 * 86400000;
  });
  if (staleContacts.length > 0) {
    alerts.push({
      id: "stale-contacts",
      title: "Contacts Need Attention",
      description: `${staleContacts.length} contact(s) haven't been engaged recently. Consider scheduling follow-ups.`,
      type: "risk",
      severity: staleContacts.length > 5 ? "critical" : "high",
      client: `${staleContacts.length} contacts`,
      timestamp: new Date().toISOString(),
    });
  }

  const overdueTasks = (tasks || []).filter((t: any) => t.status !== "completed" && t.status !== "done" && t.due_at && new Date(t.due_at) < new Date());
  if (overdueTasks.length > 0) {
    alerts.push({
      id: "overdue-tasks",
      title: "Overdue Tasks",
      description: `${overdueTasks.length} task(s) are past their due date and require immediate attention.`,
      type: "event",
      severity: overdueTasks.length > 3 ? "critical" : "high",
      client: "System",
      timestamp: new Date().toISOString(),
    });
  }

  if (deployedAgents === 0 && (agents || []).length > 0) {
    alerts.push({
      id: "no-deployed-agents",
      title: "No Active Agents",
      description: `You have ${(agents || []).length} agent(s) configured but none are deployed. Deploy agents to start handling conversations.`,
      type: "opportunity",
      severity: "high",
      client: "System",
      timestamp: new Date().toISOString(),
    });
  }

  if ((recentConversations || []).length > 10) {
    alerts.push({
      id: "high-volume",
      title: "High Conversation Volume",
      description: `${(recentConversations || []).length} conversations in the last 7 days. Consider scaling agent capacity.`,
      type: "opportunity",
      severity: "medium",
      client: "System",
      timestamp: new Date().toISOString(),
    });
  }

  if ((automationEvents || []).length > 0) {
    alerts.push({
      id: "automation-activity",
      title: "Automation Activity",
      description: `${(automationEvents || []).length} automation event(s) fired this week across your workflows.`,
      type: "opportunity",
      severity: "medium",
      client: "Automations",
      timestamp: new Date().toISOString(),
    });
  }

  // Revenue engine — top sales by company
  const companyTotals: Record<string, { total: number; count: number }> = {};
  (salesRecords || []).forEach((r: any) => {
    const key = r.company_name || "Other";
    if (!companyTotals[key]) companyTotals[key] = { total: 0, count: 0 };
    companyTotals[key].total += r.price || 0;
    companyTotals[key].count += 1;
  });

  const revenueEngine = Object.entries(companyTotals)
    .sort(([, a], [, b]) => b.total - a.total)
    .slice(0, 6)
    .map(([company, data], i) => ({
      id: `rev-${i}`,
      type: "Revenue",
      client: company,
      value: data.total >= 1000 ? `$${(data.total / 1000).toFixed(1)}k` : `$${data.total}`,
      confidence: Math.min(95, 60 + data.count * 5),
      suggestedAction: `${data.count} sale(s) totaling ${data.total >= 1000 ? `$${(data.total / 1000).toFixed(1)}k` : `$${data.total}`}. Follow up for expansion.`,
    }));

  // Chart data — monthly revenue
  const monthlyRevenue: Record<string, number> = {};
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  (salesRecords || []).forEach((r: any) => {
    const monthIdx = (r.month || new Date(r.created_at).getMonth() + 1) - 1;
    const key = monthNames[monthIdx] || "Unknown";
    monthlyRevenue[key] = (monthlyRevenue[key] || 0) + (r.price || 0);
  });

  const chartData = monthNames
    .filter((m) => monthlyRevenue[m] !== undefined)
    .map((m) => ({
      name: m,
      aum: Math.round((monthlyRevenue[m] / 1000) * 10) / 10,
      type: "revenue",
    }));

  // Enrich upcoming meetings with contact names
  const contactIds = [...new Set((upcomingMeetings || []).map((m: any) => m.contact_id).filter(Boolean))];
  let meetingContacts: Record<string, string> = {};
  if (contactIds.length > 0 && wid) {
    const { data: mc } = await supabaseAdmin
      .from("contacts")
      .select("id, name")
      .in("id", contactIds);
    meetingContacts = Object.fromEntries((mc || []).map((c: any) => [c.id, c.name]));
  }

  const meetingPrep = (upcomingMeetings || []).map((m: any) => ({
    id: m.id,
    contactName: meetingContacts[m.contact_id] || "Unknown",
    scheduledAt: m.scheduled_at,
    serviceType: m.service_type || "General",
    status: m.status,
    notes: m.notes || null,
  }));

  return NextResponse.json({
    metrics: {
      aum: formattedRevenue,
      aumChange: formattedRecentRevenue,
      activeClients: (contacts || []).length,
      prospects: upcomingAppointments,
      revenueOpportunities: `${(recentConversations || []).length} this week`,
      churnRisk: pendingTasks,
      deployedAgents,
      totalAgents: (agents || []).length,
      totalConversations: (conversations || []).length,
      automationEvents: (automationEvents || []).length,
    },
    alerts: alerts.slice(0, 8),
    revenueEngine,
    chartData,
    meetingPrep,
  });
}
