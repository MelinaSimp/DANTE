import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE! // service-role
);

// Try to robustly read both JSON and x-www-form-urlencoded bodies.
function readPayload(req: NextApiRequest) {
  let payload: any = req.body ?? {};
  // If Next parsed JSON, it's already an object. If string, try to decode.
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      try {
        const sp = new URLSearchParams(payload);
        payload = Object.fromEntries(sp.entries());
      } catch {
        payload = {};
      }
    }
  }
  return payload;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method not allowed" });
  }

  try {
    const payload = readPayload(req);
    const contactId = payload.contactId as string | undefined;
    const body = payload.body as string | undefined;
    const incomingWs = payload.workspaceId as string | undefined;

    if (!contactId || !body) {
      return res.status(400).json({ ok: false, error: "contactId and body required" });
    }

    // Resolve workspace from contact if not provided
    let workspaceId = incomingWs;
    if (!workspaceId) {
      const { data: contact, error: cErr } = await supabase
        .from("contacts")
        .select("workspace_id")
        .eq("id", contactId)
        .maybeSingle();

      if (cErr) {
        console.error("Lookup contact error:", cErr);
        return res.status(500).json({ ok: false, error: cErr.message });
      }
      if (!contact?.workspace_id) {
        return res.status(400).json({ ok: false, error: "unable to resolve workspaceId from contactId" });
      }
      workspaceId = contact.workspace_id as string;
    }

    const { error } = await supabase
      .from("notes")
      .insert([{ workspace_id: workspaceId, contact_id: contactId, body }]);

    if (error) {
      console.error("Insert note error:", error);
      return res.status(500).json({ ok: false, error: error.message });
    }

    return res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e?.message || "unknown error" });
  }
}
