import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasSuperadminAccess } from "@/lib/superadmin";
import { logAudit } from "@/lib/audit";
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
  return NextResponse.json({ invites: invites || [] });
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

  await logAudit({
    workspaceId,
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: "workspace.member_invited",
    targetType: "invite",
    targetId: invite?.id ?? null,
    targetLabel: email,
    metadata: { expires_at: expiresAt },
    request: req,
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || "http://localhost:3000";
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
    } catch (emailErr: any) {
      console.error("[Admin Invites] Email send failed:", emailErr.message);
    }
  }

  return NextResponse.json({ invite, signupUrl });
}

export async function DELETE(req: NextRequest) {
  const user = await requireSuperadmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { data: existing } = await supabaseAdmin
    .from("invites")
    .select("company_id, email")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabaseAdmin.from("invites").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (existing?.company_id) {
    await logAudit({
      workspaceId: existing.company_id,
      actorId: user.id,
      actorEmail: user.email ?? null,
      action: "workspace.member_removed",
      targetType: "invite",
      targetId: id,
      targetLabel: existing.email ?? null,
      request: req,
    });
  }

  return NextResponse.json({ ok: true });
}
