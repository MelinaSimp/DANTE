// lib/widget/cors.ts
//
// CORS for the public embeddable widget endpoints. The widget is meant
// to be dropped onto ANY customer website, so these routes must accept
// cross-origin requests from arbitrary origins. They carry no cookies
// and no credentials — auth is the agent's rotatable widget_public_id
// in the URL path, never a session — so a wildcard origin is safe:
// there's no ambient authority for a malicious page to ride on.
//
// We reflect the caller's Origin (rather than a literal "*") so the
// same helper keeps working if we ever need to send credentials; with
// credentials, "*" is disallowed by the spec. `Vary: Origin` keeps
// caches from serving one origin's ACAO header to another.

export function widgetCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

/** Preflight handler shared by every widget route's OPTIONS export. */
export function widgetPreflight(req: Request): Response {
  return new Response(null, { status: 204, headers: widgetCorsHeaders(req) });
}

/** JSON response with CORS headers attached. */
export function widgetJson(
  req: Request,
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...widgetCorsHeaders(req),
      ...extraHeaders,
    },
  });
}

/** Best-effort client IP for per-visitor rate limiting. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") || "unknown";
}
