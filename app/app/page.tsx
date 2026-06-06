// /app was the "backend" orb — a parallel hub. Redirects to /home so
// bookmarks and internal links don't 404.

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function AppRedirect() {
  redirect("/home");
}
