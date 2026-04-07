import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { Resend } from "resend";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const MAX_RECIPIENTS = 10;

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!rateLimit(`email:${user.id}`, 20).allowed) return rateLimitResponse();

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Email service not configured (RESEND_API_KEY missing)" },
      { status: 500 }
    );
  }

  const body = await req.json();
  const { to, subject, htmlContent } = body;

  if (!to || !subject || !htmlContent) {
    return NextResponse.json(
      { error: "Missing required fields: to, subject, htmlContent" },
      { status: 400 }
    );
  }

  const recipients = Array.isArray(to) ? to : [to];
  if (recipients.length > MAX_RECIPIENTS) {
    return NextResponse.json(
      { error: `Maximum ${MAX_RECIPIENTS} recipients allowed per email` },
      { status: 400 }
    );
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  for (const addr of recipients) {
    if (!emailRegex.test(addr)) {
      return NextResponse.json(
        { error: `Invalid email address: ${addr}` },
        { status: 400 }
      );
    }
  }

  const resend = new Resend(apiKey);
  const fromEmail = process.env.RESEND_FROM_EMAIL || "Drift <noreply@driftai.studio>";

  try {
    const { data, error: sendError } = await resend.emails.send({
      from: fromEmail,
      to: recipients,
      subject,
      html: htmlContent,
    });

    if (sendError) {
      console.error("[Direct Email] Resend error:", sendError);
      return NextResponse.json(
        { error: sendError.message || "Failed to send email" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      messageId: data?.id,
    });
  } catch (err: any) {
    console.error("[Direct Email] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
