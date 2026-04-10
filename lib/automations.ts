import { supabaseAdmin } from "@/lib/supabase/admin";

export type AutomationEvent =
  | "call.started"
  | "call.completed"
  | "email.sent"
  | "contact.created"
  | "contact.updated"
  | "appointment.booked"
  | "appointment.cancelled"
  | "sale.recorded";

interface AutomationRule {
  id: string;
  agent_id: string;
  trigger_event: string;
  condition: string;
  action_description: string;
  channel: string;
  active: boolean;
}

export async function emitEvent(
  event: AutomationEvent,
  payload: Record<string, unknown> = {},
  workspaceId?: string
): Promise<void> {
  try {
    supabaseAdmin
      .from("automation_events")
      .insert({
        workspace_id: workspaceId || null,
        event_type: event,
        direction: "outbound",
        payload: { event, timestamp: new Date().toISOString(), ...payload },
      })
      .then(() => {})
      .catch((err) => console.error(`[Automations] Failed to log event ${event}:`, err.message));

    executeRules(event, payload).catch((err) =>
      console.error(`[Automations] Rule execution error for ${event}:`, err.message)
    );
  } catch (err: any) {
    console.error(`[Automations] emitEvent error:`, err.message);
  }
}

async function executeRules(
  event: AutomationEvent,
  payload: Record<string, unknown>
): Promise<void> {
  const { data: rules } = await supabaseAdmin
    .from("automation_rules")
    .select("*")
    .eq("trigger_event", event)
    .eq("active", true);

  if (!rules || rules.length === 0) return;

  for (const rule of rules as AutomationRule[]) {
    try {
      await executeAction(rule, payload);
    } catch (err: any) {
      console.error(`[Automations] Action failed for rule ${rule.id}:`, err.message);
    }
  }
}

async function executeAction(
  rule: AutomationRule,
  payload: Record<string, unknown>
): Promise<void> {
  const recipient = (payload.email || payload.phone || payload.to || "") as string;
  const message = buildMessage(rule.action_description, payload);

  switch (rule.channel) {
    case "email":
      await sendEmailAction(recipient, message, rule);
      break;
    case "sms":
      await sendSmsAction(recipient, message);
      break;
    case "webhook":
      await sendWebhookAction(message, payload, rule);
      break;
    default:
      await logAction(rule, payload);
  }
}

function buildMessage(template: string, payload: Record<string, unknown>): string {
  let msg = template;
  for (const [key, value] of Object.entries(payload)) {
    msg = msg.replace(new RegExp(`\\{${key}\\}`, "g"), String(value ?? ""));
  }
  return msg;
}

async function sendEmailAction(to: string, body: string, rule: AutomationRule): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !to) return;

  const fromEmail = process.env.RESEND_FROM_EMAIL || "noreply@driftai.studio";

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: fromEmail,
      to,
      subject: `Automation: ${rule.trigger_event}`,
      html: `<div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;">${body.replace(/\n/g, "<br/>")}</div>`,
    }),
  });
}

async function sendSmsAction(to: string, body: string): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!sid || !token || !from || !to) return;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
  });
}

async function sendWebhookAction(
  message: string,
  payload: Record<string, unknown>,
  rule: AutomationRule
): Promise<void> {
  const condition = rule.condition?.trim();
  const webhookUrl = condition?.startsWith("http") ? condition : null;
  if (!webhookUrl) return;

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event: rule.trigger_event,
      action: rule.action_description,
      message,
      payload,
      timestamp: new Date().toISOString(),
    }),
  });
}

async function logAction(rule: AutomationRule, payload: Record<string, unknown>): Promise<void> {
  console.log(`[Automations] Rule ${rule.id} (${rule.trigger_event} -> ${rule.channel}):`, payload);
}

export async function testSend(
  channel: string,
  recipient: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  try {
    switch (channel) {
      case "email":
        await sendEmailAction(recipient, message, {
          id: "test", agent_id: "", trigger_event: "test",
          condition: "", action_description: message, channel: "email", active: true,
        });
        return { success: true };
      case "sms":
        await sendSmsAction(recipient, message);
        return { success: true };
      case "webhook":
        await fetch(recipient, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, timestamp: new Date().toISOString() }),
        });
        return { success: true };
      default:
        return { success: false, error: `Unsupported channel: ${channel}` };
    }
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
