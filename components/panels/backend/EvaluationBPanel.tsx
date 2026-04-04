"use client";

import BackendPanelWrapper from "./BackendPanelWrapper";
import EvaluationPage from "@/app/gigaai/EvaluationPage";

export default function EvaluationBPanel({ agentId }: { agentId: string }) {
  return (
    <BackendPanelWrapper>
      <EvaluationPage agentId={agentId} />
    </BackendPanelWrapper>
  );
}
