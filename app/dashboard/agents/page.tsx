// /dashboard/agents is the legacy location for agent management.
// Moved to /agent (workspace-level, reachable from the top-nav). The
// full CRM roster + autonomous outputs queue now lives there. Redirect
// preserves any bookmarks or deep links.

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function DashboardAgentsRedirect() {
  redirect("/agent");
}
