// Legacy dashboard route — canonical landing is now /home.
// Redirect preserves any bookmarks or deep links.

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function DashboardRedirect() {
  redirect("/home");
}
