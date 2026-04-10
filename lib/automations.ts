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

export interface EmitResult {
  logged: boolean;
  rulesProcessed: number;
  rulesSucceeded: number;
  rulesFailed: number;
  errors: string[];
}

/**
 * Retry a fetch-based operation with exponential backoff.
 * Throws on final failure so callers can handle it.
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  opts: { maxAttempts?: number; baseDelayMs?: number; label: string } = { label: "op" }
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseDelay = opts.baseDelayMs ?? 500;
  let lastErr: any;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (err: any) {
      lastErr = err;
      if (attempt === maxAttempts) break;
      // Exponential backoff: 500ms, 1s, 2s
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error(`[${opts.label}] Failed after ${maxAttempts} attempts: ${lastErr?.message || lastErr}`);
}

/**
 * Emit an automation event. Awaits logging + rule execution so callers
 * know whether everything succeeded. Callers that don't want to block
 * should use `.catch()` or wrap in a Promise.resolve() — but they should
 * NOT assume this succeeds silently.
 */
export async function emitEvent(
  event: AutomationEvent,
  payload: Record<string, unknown> = {},
  workspaceId?: string
): Promise<EmitResult> {
  const result: EmitResult = {
    logged: false,
    rulesProcessed: 0,
    rulesSucceeded: 0,
    rulesFailed: 0,
    errors: [],
  };

  // 1. Log the event (awaited — no more fire-and-forget)
  try {
    const { error } = await supabaseAdmin.from("automation_events").insert({
      workspace_id: workspaceId || null,
      event_type: event,
      direction: "outbound",
      payload: { event, timestamp: new Date().toISOString(), ...payload },
    });
    if (error) throw error;
    result.logged = true;
  } catch (err: any) {
    result.errors.push(`event log failed: ${err.message}`);
    console.error(`[Automations] Failed to log event ${event}:`, err.message);
  }

  // 2. Execute matching rules (awaited)
  try {
    const ruleResult = await executeRules(event, payload);
    result.rulesProcessed = ruleResult.processed;
    result.rulesSucceeded = ruleResult.succeeded;
    result.rulesFailed = ruleResult.failed;
    result.errors.push(...ruleResult.errors);
  } catch (err: any) {
    result.errors.push(`rule execution failed: ${err.message}`);
    console.error(`[Automations] Rule execution error for ${event}:`, err.message);
  }

  return result;
}

interface RuleExecutionResult {
  processed: number;
  succeeded: number;
  failed: number;
  errors: string[];
}

async function executeRules(
  event: AutomationEvent,
  payload: Record<string, unknown>
): Promise<RuleExecutionResult> {
  const result: RuleExecutionResult = { processed: 0, succeeded: 0, failed: 0, errors: [] };

  const { data: rules, error } = await supabaseAdmin
    .from("automation_rules")
    .select("*")
    .eq("trigger_event", event)
    .eq("active", true);

  if (error) {
    throw new Error(`Failed to load rules: ${error.message}`);
  }

  if (!rules || rules.length === 0) return result;

  for (const rule of rules as AutomationRule[]) {
    result.processed++;
    try {
      await executeAction(rule, payload);
      result.succeeded++;
    } catch (err: any) {
      result.failed++;
      const msg = `rule ${rule.id} (${rule.channel}): ${err.message}`;
      result.errors.push(msg);
      console.error(`[Automations] Action failed for ${msg}`);
    }
  }

  return result;
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
  if (!apiKey) throw new Error("RESEND_API_KEY not configured");
  if (!to) throw new Error("No recipient");

  const fromEmail = process.env.RESEND_FROM_EMAIL || "noreply@driftai.studio";

  await withRetry(
    async () => {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: fromEmail,
          to,
          subject: `Automation: ${rule.trigger_event}`,
          html: `<div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;">${body.replace(/\n/g, "<br/>")}</div>`,
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        throw new Error(`Resend ${res.status}: ${errText}`);
      }
    },
    { label: "email", maxAttempts: 3 }
  );
}

async function sendSmsAction(to: string, body: string): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!sid || !token || !from) throw new Error("Twilio credentials not configured");
  if (!to) throw new Error("No recipient");

  await withRetry(
    async () => {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        throw new Error(`Twilio ${res.status}: ${errText}`);
      }
    },
    { label: "sms", maxAttempts: 3 }
  );
}

async function sendWebhookAction(
  message: string,
  payload: Record<string, unknown>,
  rule: AutomationRule
): Promise<void> {
  const condition = rule.condition?.trim();
  const webhookUrl = condition?.startsWith("http") ? condition : null;
  if (!webhookUrl) throw new Error("Webhook URL missing from rule condition");

  await withRetry(
    async () => {
      const res = await fetch(webhookUrl, {
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
      if (!res.ok) {
        throw new Error(`Webhook ${res.status}`);
      }
    },
    { label: "webhook", maxAttempts: 3 }
  );
}

async function logAction(rule: AutomationRule, payload: Record<string, unknown>): Promise<void> {
  // No-op logging action — "log" channel intentionally does nothing.
  void rule;
  void payload;
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
          id: "test",
          agent_id: "",
          trigger_event: "test",
          condition: "",
          action_description: message,
          channel: "email",
          active: true,
        });
        return { success: true };
      case "sms":
        await sendSmsAction(recipient, message);
        return { success: true };
      case "webhook":
        await withRetry(
          async () => {
            const res = await fetch(recipient, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ message, timestamp: new Date().toISOString() }),
            });
            if (!res.ok) throw new Error(`Webhook ${res.status}`);
          },
          { label: "test-webhook", maxAttempts: 2 }
        );
        return { success: true };
      default:
        return { success: false, error: `Unsupported channel: ${channel}` };
    }
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
