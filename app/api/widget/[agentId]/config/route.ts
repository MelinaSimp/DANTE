// GET /api/widget/[agentId]/config
//
// Public, unauthenticated. The embeddable widget calls this on load to
// fetch its branding + greeting before the visitor sends anything. The
// `[agentId]` path segment is the agent's rotatable widget_public_id,
// NOT the internal UUID. Only returns config for an agent whose owner
// has explicitly enabled the web widget channel.
//
// CORS-enabled (any origin) — see lib/widget/cors.ts for why that's
// safe here (no cookies, token-in-path auth).

import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { widgetCorsHeaders, widgetJson, widgetPreflight } from "@/lib/widget/cors";

export const dynamic = "force-dynamic";

export function OPTIONS(req: NextRequest) {
  return widgetPreflight(req);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId: publicId } = await params;

  const { data: agent } = await supabaseAdmin
    .from("agents")
    .select("name, first_message, widget_config, widget_enabled")
    .eq("widget_public_id", publicId)
    .maybeSingle();

  if (!agent || agent.widget_enabled !== true) {
    return widgetJson(req, { error: "not_found" }, 404);
  }

  const cfg = (agent.widget_config as Record<string, unknown> | null) ?? {};

  // Greeting precedence: explicit widget greeting → agent's voice
  // first_message → a neutral default. Keeps one source of truth per
  // channel while still reusing the builder's greeting when set.
  const greeting =
    (typeof cfg.greeting === "string" && cfg.greeting) ||
    agent.first_message ||
    "Hi! How can I help you today?";

  return widgetJson(
    req,
    {
      name: agent.name,
      greeting,
      title: (typeof cfg.title === "string" && cfg.title) || agent.name,
      subtitle: typeof cfg.subtitle === "string" ? cfg.subtitle : null,
      primary_color:
        typeof cfg.primary_color === "string" ? cfg.primary_color : "#4F46E5",
      position:
        cfg.position === "bottom-left" ? "bottom-left" : "bottom-right",
      launcher_text:
        typeof cfg.launcher_text === "string" ? cfg.launcher_text : null,
    },
    200,
    // Small edge cache — branding rarely changes and this is hit on
    // every page load where the widget is embedded.
    { "Cache-Control": "public, max-age=60, s-maxage=300", ...widgetCorsHeaders(req) },
  );
}
