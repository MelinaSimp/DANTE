// Legacy per-agent schedule. The workspace-level calendar at /calendar
// already uses the same ScheduleClient component, so there's nothing
// unique here. Redirect preserves any bookmarks or deep links.

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function LegacyScheduleRedirect() {
  redirect("/calendar");
}
