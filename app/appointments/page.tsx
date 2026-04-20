// /appointments is a legacy route. The unified calendar now lives at
// /calendar (combining the old /appointments list and /schedule grid).
// Redirect preserves any bookmarks or deep links.

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function AppointmentsRedirect() {
  redirect("/calendar");
}
