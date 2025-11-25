// components/numbers/TwilioConnectForm.tsx
"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export default function TwilioConnectForm({ workspaceId }: { workspaceId: string }) {
  const [sid, setSid] = useState("");
  const [token, setToken] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleVerifyAndSave() {
    setVerifying(true);
    setMsg(null);
    try {
      const resp = await fetch("/api/twilio/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_sid: sid.trim(), auth_token: token.trim() }),
      });
      const data = await resp.json();
      if (!data.ok) {
        setMsg(data.error || "Verification failed");
        return;
      }

      // Save to Supabase (upsert)
      const { error } = await supabase.from("twilio_credentials").upsert({
        workspace_id: workspaceId,
        account_sid: sid.trim(),
        auth_token: token.trim(),
      });
      if (error) {
        setMsg(error.message);
        return;
      }

      setMsg(`Connected: ${data.friendly_name ?? sid}`);
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="space-y-2 rounded-2xl border p-4">
      <div className="font-medium">Connect your Twilio account</div>
      <input
        className="w-full rounded-md border px-3 py-2"
        placeholder="Account SID (AC...)"
        value={sid}
        onChange={(e) => setSid(e.target.value)}
      />
      <input
        className="w-full rounded-md border px-3 py-2"
        placeholder="Auth Token"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        type="password"
      />
      <Button onClick={handleVerifyAndSave} disabled={!sid || !token || verifying}>
        {verifying ? "Verifying…" : "Verify & Save"}
      </Button>
      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
      <p className="text-xs text-muted-foreground">
        Your credentials stay scoped to this workspace. You can revoke them anytime in Twilio.
      </p>
    </div>
  );
}
