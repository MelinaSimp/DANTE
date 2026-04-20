// Legacy per-agent landing page. Existed only as a sidebar destination
// with no real content. Agent management is now at /agent (workspace
// level), so redirect to preserve any bookmarks.

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function LegacyAgentRootRedirect() {
  redirect("/agent");
}
