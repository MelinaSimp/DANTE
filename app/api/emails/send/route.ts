import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Resend } from "resend";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { emitEvent } from "@/lib/automations";
import { recordEmailUsage } from "@/lib/usage/track";
import { remember } from "@/lib/dante/memory/write";
import { scanForCompliance } from "@/lib/compliance/scan";
import { logAuditEvent } from "@/lib/audit/log";

// Crude HTML → text for memory storage. The email itself ships HTML
// to the recipient; this stripped form is what D/V's memory.search
// looks at. Doesn't need to be perfect — the body is also embedded.
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/?(p|div|br|h[1-6]|li|tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

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

  if (!(await rateLimit(`email:${user.id}`, 20)).allowed) return rateLimitResponse();

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

    emitEvent("email.sent", { to: recipients, subject, messageId: data?.id });

    // Resolve workspace once — used for both usage tracking and the
    // memory write below.
    let workspaceId: string | null = null;
    try {
      const { data: prof } = await supabase
        .from("profiles")
        .select("workspace_id")
        .eq("id", user.id)
        .maybeSingle();
      workspaceId = prof?.workspace_id ?? null;
      if (workspaceId) {
        recordEmailUsage({
          workspaceId,
          userId: user.id,
          recipientCount: recipients.length,
          source: "direct_send",
          metadata: { messageId: data?.id, subject: String(subject).slice(0, 100) },
        });
      }
    } catch (err) {
      console.error("[emails/send] usage tracking failed:", err);
    }

    // Persist + compliance-scan in parallel. Both are best-effort —
    // a failure in either logs and moves on; the user-facing send
    // response never blocks on these.
    if (workspaceId) {
      const primaryRecipient = recipients[0];
      const bodyText = htmlToText(htmlContent).slice(0, 4000);
      const recipientLine =
        recipients.length === 1
          ? recipients[0]
          : `${recipients[0]} +${recipients.length - 1} more`;
      const messageId = data?.id || `resend_${Date.now()}`;

      // Memory write — looks up the recipient's contact_id by email.
      const memoryWrite = (async () => {
        try {
          const { data: contact } = await supabaseAdmin
            .from("contacts")
            .select("id")
            .eq("workspace_id", workspaceId)
            .ilike("email", primaryRecipient)
            .maybeSingle();
          await remember({
            workspaceId,
            kind: "episode",
            content: [
              `Email (sent) — ${subject} — to ${recipientLine}`,
              "",
              bodyText,
            ].join("\n"),
            subjectContactId: contact?.id ?? undefined,
            sourceKind: "email",
            sourceId: messageId,
          });
        } catch (err) {
          console.error("[emails/send] memory write failed:", err);
        }
      })();

      // Compliance scan — surfaces FINRA/SEC red flags for sent
      // emails. The /work queue picks these up under the Compliance
      // filter; nothing about the send itself is blocked.
      const complianceScan = (async () => {
        try {
          const scan = await scanForCompliance({
            text: `${subject}\n\n${bodyText}`,
            contextLabel: `Sent email to ${recipientLine}`,
            anthropicKey: process.env.ANTHROPIC_API_KEY,
          });
          if (scan.flags.length > 0) {
            await supabaseAdmin.from("compliance_flags").insert(
              scan.flags.map((f) => ({
                workspace_id: workspaceId,
                source_type: "email",
                source_id: messageId,
                scanned_text: bodyText,
                layer: f.layer,
                rule_id: f.rule_id,
                severity: f.severity,
                message: f.message,
                citation_refs: f.citations,
                status: "pending" as const,
              })),
            );
          }
        } catch (err) {
          console.error("[emails/send] compliance scan failed:", err);
        }
      })();

      // Audit row — fire-and-forget alongside memory + compliance.
      // No await chaining here; logAuditEvent is itself best-effort.
      const auditWrite = logAuditEvent({
        workspaceId,
        actorUserId: user.id,
        actorKind: "user",
        action: "email.send",
        entityType: "email",
        entityId: messageId,
        metadata: {
          subject: String(subject).slice(0, 200),
          recipients,
          recipient_count: recipients.length,
        },
        request: req,
      });

      await Promise.allSettled([memoryWrite, complianceScan, auditWrite]);
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
