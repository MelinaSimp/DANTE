// Slash commands intercepted before the agent runs.
//
// Bypassing the LLM for these saves tokens and gives the user
// predictable, instant feedback. The exact set:
//
//   /help                  — list available commands
//   /quiet [hours]         — mute the assistant for N hours (default 8)
//   /loud                  — undo /quiet
//   /digest                — send the daily briefing now
//   /forget last           — delete the most recent memory write
//   /status                — quick health/usage line
//
// Anything not starting with "/" passes through to the agent.

import { supabaseAdmin } from "@/lib/supabase/admin";

export interface CommandContext {
  userId: string;
  workspaceId: string;
  phone: string;
}

export interface CommandResult {
  handled: boolean;
  reply?: string;
}

const HELP_TEXT = `Drift commands:
/help — this list
/digest — daily briefing now
/quiet [hrs] — mute me (default 8h)
/loud — un-mute
/forget last — drop my most recent memory write
/status — quick check
Anything else, just text me normally.`;

export async function handleCommand(
  ctx: CommandContext,
  body: string,
): Promise<CommandResult> {
  const trimmed = body.trim();
  if (!trimmed.startsWith("/")) return { handled: false };

  const [cmdRaw, ...args] = trimmed.slice(1).split(/\s+/);
  const cmd = cmdRaw.toLowerCase();

  switch (cmd) {
    case "help":
      return { handled: true, reply: HELP_TEXT };

    case "status": {
      const { data: prefs } = await supabaseAdmin
        .from("profiles")
        .select("sms_briefing_enabled, sms_quiet_start, sms_quiet_end")
        .eq("id", ctx.userId)
        .maybeSingle();
      const briefing = (prefs as any)?.sms_briefing_enabled
        ? "morning briefing on"
        : "morning briefing off";
      const quiet =
        (prefs as any)?.sms_quiet_start && (prefs as any)?.sms_quiet_end
          ? `quiet ${(prefs as any).sms_quiet_start.slice(0, 5)}–${(prefs as any).sms_quiet_end.slice(0, 5)}`
          : "no quiet hours";
      return { handled: true, reply: `Online · ${briefing} · ${quiet}` };
    }

    case "quiet": {
      // Optional hours arg; default 8.
      const hours = args[0] ? parseInt(args[0], 10) : 8;
      if (!Number.isFinite(hours) || hours < 1 || hours > 72) {
        return {
          handled: true,
          reply: "Try /quiet [1-72] hours. e.g. /quiet 4",
        };
      }
      // Set quiet_start = now, quiet_end = now + hours.
      const start = new Date();
      const end = new Date(start.getTime() + hours * 3600 * 1000);
      const fmt = (d: Date) =>
        `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
      await supabaseAdmin
        .from("profiles")
        .update({
          sms_quiet_start: fmt(start),
          sms_quiet_end: fmt(end),
        })
        .eq("id", ctx.userId);
      return {
        handled: true,
        reply: `OK — quiet for ${hours}h. Text /loud to undo.`,
      };
    }

    case "loud":
      await supabaseAdmin
        .from("profiles")
        .update({ sms_quiet_start: null, sms_quiet_end: null })
        .eq("id", ctx.userId);
      return { handled: true, reply: "Back. What do you need?" };

    case "digest":
      // Caller wires this to actually generate + send the briefing.
      // Returning handled:true with a marker reply lets the webhook
      // route detect it and call the briefing generator.
      return { handled: true, reply: "__DIGEST__" };

    case "forget": {
      const target = (args[0] || "").toLowerCase();
      if (target !== "last") {
        return { handled: true, reply: "Try /forget last" };
      }
      const { data: latest } = await supabaseAdmin
        .from("dante_memory")
        .select("id, content")
        .eq("workspace_id", ctx.workspaceId)
        .eq("source_kind", "sms")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!latest) {
        return { handled: true, reply: "No recent memory to forget." };
      }
      await supabaseAdmin
        .from("dante_memory")
        .delete()
        .eq("id", (latest as any).id);
      return {
        handled: true,
        reply: `Forgot: "${String((latest as any).content).slice(0, 80)}…"`,
      };
    }

    default:
      return {
        handled: true,
        reply: `Unknown command: /${cmd}. Try /help.`,
      };
  }
}

// Returns true if `now` is within the user's configured quiet window.
// Quiet window may wrap midnight (e.g. start=21:00, end=07:00).
export function isWithinQuietHours(
  start: string | null,
  end: string | null,
  now: Date = new Date(),
): boolean {
  if (!start || !end) return false;
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map((s) => parseInt(s, 10));
    return h * 60 + (m || 0);
  };
  const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const s = toMin(start);
  const e = toMin(end);
  if (s <= e) return nowMin >= s && nowMin < e;
  // Wraps midnight
  return nowMin >= s || nowMin < e;
}
