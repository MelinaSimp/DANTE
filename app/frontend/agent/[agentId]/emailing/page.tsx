// Legacy per-agent emailing route. The workspace-level composer lives at
// /email now (Harvey shell, no orb sidebar, real templates + recent). We
// redirect to preserve any bookmarks or deep links. Ignoring the agentId
// is fine: /email picks the workspace's first agent for LLM + recent
// scoping, which matches what the old per-agent route did for all users
// with a single agent (most of them).

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function LegacyEmailingRedirect() {
  redirect("/email");
}
