// lib/dante/workflow-errors.ts
//
// Translate raw workflow runner errors into human-readable messages
// suitable for the UI. The runner throws terse machine-targeted
// strings; this module maps common patterns to actionable guidance.

interface FriendlyError {
  title: string;
  detail: string;
  action?: string;
}

const PATTERNS: Array<{ test: RegExp; friendly: (match: RegExpMatchArray, raw: string) => FriendlyError }> = [
  {
    test: /rate limit exceeded.*?(\d+)\/(\d+)/i,
    friendly: (m) => ({
      title: "Send limit reached",
      detail: `You've used ${m[1]} of ${m[2]} sends this hour.`,
      action: "Wait for the next hour window or reduce the recipient list.",
    }),
  },
  {
    test: /RESEND_API_KEY not configured/i,
    friendly: () => ({
      title: "Email not configured",
      detail: "The workspace email service key is missing.",
      action: "Go to Settings and add your Resend API key.",
    }),
  },
  {
    test: /TAVILY_API_KEY not configured/i,
    friendly: () => ({
      title: "Web search not configured",
      detail: "The Tavily search API key is missing.",
      action: "Add TAVILY_API_KEY in Settings > Integrations to enable web search.",
    }),
  },
  {
    test: /No connected (\w+) integration/i,
    friendly: (m) => ({
      title: `${m[1]} not connected`,
      detail: `This workflow needs a ${m[1]} integration but none is configured.`,
      action: `Go to Settings > Integrations and connect ${m[1]}.`,
    }),
  },
  {
    test: /HTTP (4\d{2}|5\d{2})/i,
    friendly: (m, raw) => ({
      title: `External service error (${m[1]})`,
      detail: raw.slice(0, 200),
      action: m[1].startsWith("5")
        ? "The external service is having issues. Retry in a few minutes."
        : "Check the URL and request configuration.",
    }),
  },
  {
    test: /Code node timed out/i,
    friendly: () => ({
      title: "Code node timed out",
      detail: "Your JavaScript took longer than 5 seconds to execute.",
      action: "Simplify the logic, reduce loop iterations, or break into multiple code nodes.",
    }),
  },
  {
    test: /Code node error:\s*(.+)/i,
    friendly: (m) => ({
      title: "Code node error",
      detail: m[1],
      action: "Check your JavaScript syntax and logic.",
    }),
  },
  {
    test: /address could not be geocoded/i,
    friendly: () => ({
      title: "Address not found",
      detail: "The address could not be located via geocoding.",
      action: "Check the address format, or provide latitude/longitude directly.",
    }),
  },
  {
    test: /No trigger node/i,
    friendly: () => ({
      title: "No trigger",
      detail: "Every workflow needs a trigger node to start.",
      action: "Open the canvas editor and add a trigger node (manual, cron, or webhook).",
    }),
  },
  {
    test: /Sub-workflow .+ not found/i,
    friendly: () => ({
      title: "Sub-workflow missing",
      detail: "The referenced sub-workflow no longer exists.",
      action: "Update the sub_workflow node to point to an existing workflow.",
    }),
  },
  {
    test: /cancelled by user/i,
    friendly: () => ({
      title: "Run cancelled",
      detail: "This run was stopped manually.",
    }),
  },
];

export function friendlyError(raw: string): FriendlyError {
  for (const pattern of PATTERNS) {
    const match = raw.match(pattern.test);
    if (match) return pattern.friendly(match, raw);
  }
  // Fallback — cap the raw message at a readable length
  return {
    title: "Workflow error",
    detail: raw.length > 300 ? raw.slice(0, 297) + "..." : raw,
  };
}
