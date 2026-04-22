import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasSuperadminAccess } from "@/lib/superadmin";
import { getAppUrl } from "@/lib/app-url";
import { recordEmailUsage } from "@/lib/usage/track";
import crypto from "crypto";

export const dynamic = "force-dynamic";

function generateToken(): string {
  const seg = () => crypto.randomBytes(2).toString("hex").toUpperCase();
  return `DRIFT-${seg()}-${seg()}`;
}

async function requireSuperadmin() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_superadmin")
    .eq("id", user.id)
    .maybeSingle();

  if (!hasSuperadminAccess(user.email, profile?.is_superadmin)) return null;
  return user;
}

export async function GET() {
  const user = await requireSuperadmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: invites, error } = await supabaseAdmin
    .from("invites")
    .select("id, token, email, company_id, expires_at, created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // invites.company_id is a legacy pointer at workspaces.id. Enrich with
  // workspace name so the UI can render each row without a second fetch.
  const companyIds = Array.from(
    new Set((invites || []).map((i) => i.company_id).filter(Boolean))
  );
  const nameById = new Map<string, string>();
  if (companyIds.length > 0) {
    const { data: wss } = await supabaseAdmin
      .from("workspaces")
      .select("id, name")
      .in("id", companyIds);
    for (const w of wss || []) nameById.set(w.id, w.name);
  }

  // Invites are deleted on consumption (see app/auth/signup/page.tsx),
  // so any row still here is either pending or expired.
  const shaped = (invites || []).map((inv) => ({
    id: inv.id,
    token: inv.token,
    email: inv.email,
    workspace_id: inv.company_id,
    workspace_name: inv.company_id ? nameById.get(inv.company_id) ?? null : null,
    expires_at: inv.expires_at,
    created_at: inv.created_at,
    used: false,
  }));

  return NextResponse.json({ invites: shaped });
}

export async function POST(req: NextRequest) {
  const user = await requireSuperadmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { email, workspaceId } = await req.json();
  if (!email || !workspaceId) {
    return NextResponse.json({ error: "email and workspaceId are required" }, { status: 400 });
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: invite, error } = await supabaseAdmin
    .from("invites")
    .insert({
      token,
      email: email.toLowerCase().trim(),
      company_id: workspaceId,
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enrich the echoed row with workspace_name so the UI list doesn't
  // have to refetch just to render the new entry.
  const { data: ws } = await supabaseAdmin
    .from("workspaces")
    .select("name")
    .eq("id", workspaceId)
    .maybeSingle();
  const shapedInvite = {
    id: invite.id,
    token: invite.token,
    email: invite.email,
    workspace_id: invite.company_id,
    workspace_name: ws?.name ?? null,
    expires_at: invite.expires_at,
    created_at: invite.created_at,
    used: false,
  };

  const appUrl = getAppUrl();
  const signupUrl = `${appUrl}/auth/signup?token=${token}`;

  if (process.env.RESEND_API_KEY) {
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: process.env.INVITE_FROM_EMAIL || "Drift <noreply@driftai.studio>",
        to: email,
        subject: "You're invited to Drift",
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
            <h1 style="font-size: 24px; font-weight: 600; margin-bottom: 16px;">You've been invited to Drift</h1>
            <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
              Click the button below to create your account and get started. This invite expires in 7 days.
            </p>
            <a href="${signupUrl}" style="display: inline-block; background: #000; color: #fff; padding: 12px 28px; border-radius: 12px; font-size: 14px; font-weight: 600; text-decoration: none;">
              Create Account
            </a>
            <p style="margin-top: 24px; color: #9ca3af; font-size: 12px;">
              Or paste this link: ${signupUrl}
            </p>
          </div>
        `,
      });
      recordEmailUsage({
        workspaceId,
        recipientCount: 1,
        source: "invite",
        metadata: { invited_email: email },
      });
    } catch (emailErr: any) {
      console.error("[Admin Invites] Email send failed:", emailErr.message);
    }
  }

  return NextResponse.json({ invite: shapedInvite, signupUrl });
}

export async function DELETE(req: NextRequest) {
  const user = await requireSuperadmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error } = await supabaseAdmin.from("invites").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
