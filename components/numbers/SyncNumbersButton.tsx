// components/numbers/SyncNumbersButton.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function SyncNumbersButton({ workspaceId }: { workspaceId: string }) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleSync() {
    setLoading(true);
    setMsg(null);
    try {
      const resp = await fetch("/api/twilio/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      const data = await resp.json();
      if (!resp.ok || data.error) {
        setMsg(data.error || "Sync failed");
        return;
      }
      setMsg(`Synced ${data.count} number(s).`);
      // Reload page to show new numbers
      location.reload();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button onClick={handleSync} disabled={loading}>
        {loading ? "Syncing…" : "Sync Numbers from Twilio"}
      </Button>
      {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
    </div>
  );
}
