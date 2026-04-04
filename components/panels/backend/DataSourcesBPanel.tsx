"use client";

import BackendPanelWrapper from "./BackendPanelWrapper";
import DataSourcesPage from "@/app/gigaai/DataSourcesPage";

export default function DataSourcesBPanel({ agentId }: { agentId: string }) {
  return (
    <BackendPanelWrapper>
      <DataSourcesPage agentId={agentId} />
    </BackendPanelWrapper>
  );
}
