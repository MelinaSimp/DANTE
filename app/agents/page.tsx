// Legacy route — the top-level /agents builder was from the old
// deployment architecture. In the current layout, agent management
// lives at /dashboard/agents (CRM agents + autonomous agents) and the
// flow builder lives at /app (Backend, password-gated). Redirect any
// bookmarks so the URL still lands somewhere useful.

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function AgentsRedirect() {
  redirect("/dashboard/agents");
}
