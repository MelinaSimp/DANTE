import { supabaseAdmin } from "@/lib/supabase/admin";

export async function evaluateDealStageWorkflows(opts: {
  workspaceId: string;
  propertyId: string;
  fromStage: string | null;
  toStage: string;
  propertyAddress: string;
}): Promise<void> {
  try {
    const { data: workflows } = await supabaseAdmin
      .from("dante_workflows")
      .select("id, workspace_id, enabled, n8n_workflow_id, graph")
      .eq("workspace_id", opts.workspaceId)
      .eq("enabled", true);

    if (!workflows?.length) return;

    const n8nBridge = await import("./n8n-bridge");

    for (const row of workflows) {
      // Check if this workflow has a deal_stage trigger
      const graph = row.graph as { nodes?: Array<{ type?: string; data?: { step?: { type?: string; config?: Record<string, unknown> } } }> } | null;
      const triggerNode = graph?.nodes?.find(
        (n) => n.type === "trigger_deal_stage" || n.data?.step?.type === "trigger_deal_stage",
      );
      if (!triggerNode) continue;

      const cfg = triggerNode.data?.step?.config || {};
      if (cfg.from_stage && cfg.from_stage !== opts.fromStage) continue;
      if (cfg.to_stage && cfg.to_stage !== opts.toStage) continue;

      const n8nId = row.n8n_workflow_id as string | null;
      if (!n8nId) continue;

      // Execute via n8n
      await n8nBridge.executeWorkflowById(n8nId, {
        property_id: opts.propertyId,
        from_stage: opts.fromStage,
        to_stage: opts.toStage,
        address: opts.propertyAddress,
        triggered_by: "deal_stage",
      });
    }
  } catch {
    // fire-and-forget -- never fail the caller
  }
}
