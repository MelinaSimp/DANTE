// /app was the "backend" orb — a parallel dashboard hub. The real
// dashboard at /dashboard now owns navigation, so this redirects out.
// Kept as a redirect rather than deleted so any lingering bookmarks or
// internal links don't 404.

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function AppRedirect() {
  redirect("/home");
}
