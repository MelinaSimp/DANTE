// app/dante/archive/page.tsx
//
// Dante · Archive — Harvey-style document vault for any team.
// Server shell that checks auth + workspace; the real UI (upload,
// search, list, doc detail links) lives in DanteArchiveClient.

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { resolveArchiveAccess } from "@/lib/dante/archive/guard";
import DanteArchiveClient from "./DanteArchiveClient";

export const dynamic = "force-dynamic";

export default async function DanteArchivePage() {
  const supabase = await createServerSupabase();
  const access = await resolveArchiveAccess(supabase);
  if (access.reason === "unauthenticated") redirect("/auth");
  if (access.reason === "no_workspace") redirect("/home");
  // Archive holds legal + compliance documents — write access would
  // let a member silently swap in a wrong policy and pollute every
  // workflow that cites it. Bounce anyone who isn't the workspace
  // owner (or a platform superadmin, kept for support access) back
  // to the Dante landing page. Workflows cloned from archive-aware
  // templates still run for members because the runner executes
  // under the service role.
  if (!access.allowed) redirect("/dante");

  return <DanteArchiveClient />;
}
