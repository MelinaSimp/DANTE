import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export class WMDashboardService {
  static async getExecutiveSummary(workspaceId: string) {
    const [
      { data: clients },
      { count: highChurnCount },
      { data: oppsAgg },
      { count: taxReviewCount },
      { count: meetingsCount },
      { count: tasksDue },
      { count: flagsOpen },
    ] = await Promise.all([
      supabaseAdmin.from("wm_clients").select("aum").eq("workspace_id", workspaceId),
      supabaseAdmin.from("wm_clients").select("*", { count: "exact", head: true }).eq("workspace_id", workspaceId).gt("churn_score", 75),
      supabaseAdmin.from("wm_opportunities").select("value_est").in("status", ["DRAFT", "PENDING_REVIEW"]),
      supabaseAdmin.from("wm_tax_insights").select("*", { count: "exact", head: true }).eq("status", "UNDER_REVIEW"),
      supabaseAdmin.from("wm_meetings").select("*", { count: "exact", head: true }).eq("status", "SCHEDULED"),
      supabaseAdmin.from("wm_tasks").select("*", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("is_completed", false),
      supabaseAdmin.from("wm_compliance_flags").select("*", { count: "exact", head: true }).eq("workspace_id", workspaceId).in("status", ["OPEN", "UNDER_REVIEW"]),
    ]);

    const totalAum = (clients ?? []).reduce((sum, c) => sum + (c.aum ?? 0), 0);
    const formattedAum = totalAum >= 1_000_000
      ? `$${(totalAum / 1_000_000).toFixed(1)}M`
      : totalAum >= 1_000
        ? `$${(totalAum / 1_000).toFixed(0)}k`
        : `$${totalAum}`;

    const opsSum = (oppsAgg ?? []).reduce((sum, o) => sum + (o.value_est ?? 0), 0);
    const formattedRevenue = opsSum >= 1_000_000
      ? `$${(opsSum / 1_000_000).toFixed(1)}M`
      : `$${opsSum.toLocaleString()}`;

    return {
      aum: formattedAum,
      aumChange: "No 30d delta — historical snapshots not available",
      activeClients: (clients ?? []).length,
      prospects: 0,
      revenueOpportunities: formattedRevenue,
      churnRisk: highChurnCount ?? 0,
      taxReviewPending: taxReviewCount ?? 0,
      meetingsThisWeek: meetingsCount ?? 0,
      tasksDue: tasksDue ?? 0,
      complianceFlags: flagsOpen ?? 0,
    };
  }

  static async getPriorityAlerts(workspaceId: string) {
    const alerts: any[] = [];

    const { data: highChurn } = await supabaseAdmin
      .from("wm_clients")
      .select("id, name, churn_score, last_contact_at")
      .eq("workspace_id", workspaceId)
      .gt("churn_score", 75)
      .limit(3);

    (highChurn ?? []).forEach((c) => {
      const daysSince = c.last_contact_at
        ? Math.floor((Date.now() - new Date(c.last_contact_at).getTime()) / 86_400_000)
        : null;
      alerts.push({
        id: `churn-${c.id}`,
        title: "High Churn Risk",
        description: daysSince !== null
          ? `Churn score: ${c.churn_score}/100. Last contact: ${daysSince} days ago.`
          : `Churn score: ${c.churn_score}/100. No contact on record.`,
        type: "risk",
        severity: "critical",
        client: c.name,
        timestamp: new Date(),
      });
    });

    const { data: topOps } = await supabaseAdmin
      .from("wm_opportunities")
      .select("id, type, description, confidence, created_at, client_id")
      .eq("status", "DRAFT")
      .gt("confidence", 85)
      .order("confidence", { ascending: false })
      .limit(3);

    if (topOps) {
      for (const op of topOps) {
        const { data: client } = await supabaseAdmin.from("wm_clients").select("name").eq("id", op.client_id).single();
        alerts.push({
          id: `opp-${op.id}`,
          title: `Opportunity: ${op.type.replace(/_/g, " ")}`,
          description: op.description,
          type: "opportunity",
          severity: "high",
          client: client?.name ?? "Unknown",
          timestamp: new Date(op.created_at),
        });
      }
    }

    return alerts.slice(0, 8);
  }

  static async getRevenueDrafts(workspaceId: string) {
    const { data: ops } = await supabaseAdmin
      .from("wm_opportunities")
      .select("id, type, value_est, confidence, suggested_action, status, client_id")
      .in("status", ["DRAFT", "PENDING_REVIEW"])
      .order("confidence", { ascending: false })
      .limit(5);

    if (!ops) return [];

    const results = [];
    for (const op of ops) {
      const { data: client } = await supabaseAdmin.from("wm_clients").select("name").eq("id", op.client_id).single();
      results.push({
        id: op.id,
        type: op.type.replace(/_/g, " "),
        client: client?.name ?? "Unknown",
        value: op.value_est
          ? op.value_est >= 1_000_000
            ? `$${(op.value_est / 1_000_000).toFixed(1)}M`
            : `$${(op.value_est / 1_000).toFixed(0)}k`
          : "Value not estimated",
        confidence: Math.round(op.confidence),
        suggestedAction: op.suggested_action,
      });
    }
    return results;
  }

  static async getChartData(workspaceId: string) {
    const { data: clients } = await supabaseAdmin
      .from("wm_clients")
      .select("name, aum, type")
      .eq("workspace_id", workspaceId)
      .not("aum", "is", null)
      .order("aum", { ascending: false })
      .limit(8);

    return (clients ?? []).map((c) => ({
      name: c.name.split(" ")[0],
      aum: Math.round(((c.aum ?? 0) / 1_000_000) * 10) / 10,
      type: c.type,
    }));
  }

  static async getClients(workspaceId: string) {
    const { data: clients } = await supabaseAdmin
      .from("wm_clients")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("aum", { ascending: false });

    return (clients ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      aum: c.aum >= 1_000_000
        ? `$${(c.aum / 1_000_000).toFixed(1)}M`
        : `$${(c.aum / 1_000).toFixed(0)}k`,
      riskProfile: c.risk_profile,
      churnScore: c.churn_score,
      lastContact: c.last_contact_at
        ? `${Math.floor((Date.now() - new Date(c.last_contact_at).getTime()) / 86_400_000)} days ago`
        : "Never",
      tags: [c.type],
    }));
  }

  static async getAgents(workspaceId: string) {
    const { data: agents } = await supabaseAdmin
      .from("wm_agent_definitions")
      .select("*")
      .eq("workspace_id", workspaceId);

    if (!agents || agents.length === 0) return { agents: [], workload: defaultWorkload() };

    const enriched = [];
    for (const agent of agents) {
      const { data: tasks } = await supabaseAdmin
        .from("wm_agent_tasks")
        .select("*")
        .eq("agent_id", agent.id)
        .order("created_at", { ascending: false })
        .limit(5);

      const { data: outputs } = await supabaseAdmin
        .from("wm_agent_outputs")
        .select("*")
        .eq("agent_id", agent.id)
        .order("created_at", { ascending: false })
        .limit(5);

      const inProgress = (tasks ?? []).find((t) => t.status === "IN_PROGRESS");

      enriched.push({
        ...agent,
        colorClass: agent.color_class,
        successRate: agent.success_rate,
        confidenceLevel: agent.confidence_level,
        outputsToday: agent.outputs_today,
        pendingReviews: agent.pending_reviews,
        lastRun: agent.last_run,
        taskQueueCount: (tasks ?? []).filter((t) => t.status === "PENDING").length,
        currentTask: inProgress?.description ?? null,
        linkedRecord: null,
        recentTasks: (tasks ?? []).map((t) => ({
          id: t.id,
          description: t.description,
          status: t.status,
          output: t.output,
          linkedClient: t.linked_client,
          startedAt: t.started_at,
          completedAt: t.completed_at,
          createdAt: t.created_at,
        })),
        outputs: (outputs ?? []).map((o) => ({
          id: o.id,
          title: o.title,
          type: o.type,
          summary: o.summary,
          reviewStatus: o.review_status,
          linkedClient: o.linked_client,
        })),
      });
    }

    const running = enriched.filter((a) => a.status === "RUNNING").length;
    const idle = enriched.filter((a) => a.status === "IDLE").length;
    const paused = enriched.filter((a) => a.status === "PAUSED").length;
    const errors = enriched.filter((a) => a.status === "ERROR").length;
    const reviewNeeded = enriched.filter((a) => a.status === "REVIEW_NEEDED").length;

    return {
      agents: enriched,
      workload: {
        totalAgents: enriched.length,
        running,
        idle,
        paused,
        errors,
        reviewNeeded,
        totalOutputsToday: enriched.reduce((s, a) => s + a.outputsToday, 0),
        totalPendingReviews: enriched.reduce((s, a) => s + a.pendingReviews, 0),
        totalQueueItems: enriched.reduce((s, a) => s + a.taskQueueCount, 0),
      },
    };
  }

  static async dismissOpportunity(id: string) {
    await supabaseAdmin.from("wm_opportunities").update({ status: "REJECTED" }).eq("id", id);
  }

  static async approveOpportunity(id: string) {
    await supabaseAdmin.from("wm_opportunities").update({ status: "APPROVED" }).eq("id", id);
  }
}

function defaultWorkload() {
  return {
    totalAgents: 0, running: 0, idle: 0, paused: 0, errors: 0,
    reviewNeeded: 0, totalOutputsToday: 0, totalPendingReviews: 0, totalQueueItems: 0,
  };
}
