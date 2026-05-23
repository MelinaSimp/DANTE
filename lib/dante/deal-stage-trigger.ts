import { supabaseAdmin } from "@/lib/supabase/admin";
import { definitionFromRow } from "./workflow-types";
import type { WorkflowStep } from "./workflow-types";

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
      .select("*")
      .eq("workspace_id", opts.workspaceId)
      .eq("enabled", true);

    if (!workflows?.length) return;

    const { enqueueRun } = await import("./run-executor");

    for (const row of workflows) {
      const def = definitionFromRow(row);
      const triggerNode = def.graph.nodes.find(
        (n) => n.type === "trigger_deal_stage",
      );
      if (!triggerNode) continue;

      const cfg = (triggerNode.data.step as WorkflowStep & { type: "trigger_deal_stage" }).config;
      if (cfg.from_stage && cfg.from_stage !== opts.fromStage) continue;
      if (cfg.to_stage && cfg.to_stage !== opts.toStage) continue;

      await enqueueRun({
        workflow_id: def.id,
        workspace_id: opts.workspaceId,
        triggered_by: null,
        payload: {
          property_id: opts.propertyId,
          from_stage: opts.fromStage,
          to_stage: opts.toStage,
          address: opts.propertyAddress,
          triggered_by: "deal_stage",
        } as Record<string, unknown>,
      });
    }
  } catch {
    // fire-and-forget -- never fail the caller
  }
}
