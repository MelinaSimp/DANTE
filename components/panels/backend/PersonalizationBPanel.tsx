"use client";

import BackendPanelWrapper from "./BackendPanelWrapper";
import PersonalizationPage from "@/app/gigaai/PersonalizationPage";

export default function PersonalizationBPanel({ agentId }: { agentId: string }) {
  return (
    <BackendPanelWrapper>
      <PersonalizationPage agentId={agentId} />
    </BackendPanelWrapper>
  );
}
