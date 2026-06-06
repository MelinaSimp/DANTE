// /home redirects to /dashboard — the canonical landing page.

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function HomeRedirect() {
  redirect("/dashboard");
}
