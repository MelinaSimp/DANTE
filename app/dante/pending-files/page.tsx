// app/dante/pending-files/page.tsx
//
// Dante · Pending Files — the user-facing surface for the watched-
// folders ingest queue. When the Electron app's chokidar watcher
// detects a new file in a registered folder, it posts to the
// notify API and the file lands here in pending_user_confirm
// status. The user sees one row per file, with Confirm / Reject /
// Open in folder buttons. Confirming promotes the row into a
// vault item; rejecting marks it rejected_user without ingesting.
//
// The page also lists registered watched folders and lets the user
// add new ones (Electron-only — falls back to a "download the desktop
// app" empty state in the web build).

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import PendingFilesClient from "./PendingFilesClient";

export const dynamic = "force-dynamic";

export default async function PendingFilesPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!(profile as { workspace_id?: string | null } | null)?.workspace_id) {
    redirect("/dashboard");
  }

  return <PendingFilesClient />;
}
