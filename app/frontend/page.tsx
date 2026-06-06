// /frontend is a legacy hub (the "orb" shell that offered Agent /
// Calendar / Sales / Emailing / Inbox as radial panels). Redirects to
// /home. Per-agent sub-routes under /frontend/agent/[id]/* are still
// live and reached via the workspace-level /agent and /email entries.

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function FrontendRedirect() {
  redirect("/home");
}
