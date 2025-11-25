// pages/api/auth/link-invite.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeToken } from "@/lib/invite";

const APP_BASE_URL = process.env.APP_BASE_URL || process.env.PUBLIC_BASE_URL || "";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const company_id = String(req.body.company_id || "").trim();
    const email = (req.body.email ? String(req.body.email).trim() : null) || null;
    let token = normalizeToken(req.body.token);

    if (!company_id) {
      return res.status(400).json({ error: "company_id is required" });
    }

    if (!token) {
      // Make a simple readable token if none given
      token = `DRIFT-${Math.random().toString(36).slice(2,6).toUpperCase()}-${Math.random()
        .toString(36)
        .slice(2,6)
        .toUpperCase()}`;
    }

    // Upsert invite
    const { data: ins, error } = await supabaseAdmin
      .from("invites")
      .insert({
        company_id,
        email,
        token,
        expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select("id, token, company_id, email, expires_at")
      .single();

    if (error) throw error;

    const signupUrl = `${APP_BASE_URL.replace(/\/$/, "")}/auth/signup?token=${encodeURIComponent(
      ins.token
    )}`;

    return res.status(200).json({ token: ins.token, signupUrl, invite: ins });
  } catch (e: any) {
    console.error("/api/auth/link-invite error", e);
    return res.status(500).json({ error: e.message || "Internal error" });
  }
}
