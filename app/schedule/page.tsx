// /schedule is a legacy route. The unified calendar now lives at
// /calendar. The original ScheduleClient still powers /calendar, so
// nothing's lost — just the URL moves. Redirect preserves bookmarks.

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function ScheduleRedirect() {
  redirect("/calendar");
}
