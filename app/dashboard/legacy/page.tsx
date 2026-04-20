// /dashboard/legacy was the old dark-theme "Analytics" page — metrics,
// revenue engine, alerts — all things the Harvey dashboard at
// /dashboard now covers. Redirect out so the surface stays one thing,
// not two competing dashboards.

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function DashboardLegacyRedirect() {
  redirect("/dashboard");
}
