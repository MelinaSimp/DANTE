"use client";

import { useState, useEffect } from "react";
import BackendPanelWrapper from "./BackendPanelWrapper";
import AdvancedPage from "@/app/gigaai/AdvancedPage";

export default function AdvancedBPanel({ agentId }: { agentId: string }) {
  const [phoneNumber, setPhoneNumber] = useState("");

  useEffect(() => {
    fetch(`/api/agents/${agentId}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.phoneNumber) setPhoneNumber(d.phoneNumber); })
      .catch(() => {});
  }, [agentId]);

  const handlePhoneChange = async (newPhone: string) => {
    setPhoneNumber(newPhone);
    try {
      await fetch(`/api/agents/${agentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: newPhone }),
      });
    } catch {}
  };

  return (
    <BackendPanelWrapper>
      <AdvancedPage agentId={agentId} phoneNumber={phoneNumber} onPhoneNumberChange={handlePhoneChange} />
    </BackendPanelWrapper>
  );
}
