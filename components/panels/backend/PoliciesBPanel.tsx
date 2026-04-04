"use client";

import BackendPanelWrapper from "./BackendPanelWrapper";
import PoliciesPage from "@/app/gigaai/PoliciesPage";

export default function PoliciesBPanel({ agentId }: { agentId: string }) {
  return (
    <BackendPanelWrapper>
      <PoliciesPage agentId={agentId} />
    </BackendPanelWrapper>
  );
}
