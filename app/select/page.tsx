// /select was a role-picker hub (frontend vs backend vs admin). The
// unified /dashboard now does that job, so this route redirects there.
// Leaving as a redirect preserves legacy bookmarks.

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function SelectRedirect() {
  redirect("/home");
}
