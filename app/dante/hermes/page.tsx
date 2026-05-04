// app/dante/hermes/page.tsx
//
// Dante · Hermes — direct chat with the local Hermes 3 model.
//
// Bypasses Drift's normal cloud chat path entirely: the renderer
// talks straight to localhost Ollama via window.driftLocal.complete().
// Conversation lives in component state and is not persisted to
// Drift's database — the whole point is "this conversation never
// touches Drift's servers." Files attached via the picker are read
// and parsed in the Electron main process; only extracted text
// crosses the IPC boundary back into the chat context.
//
// Web (non-Electron) build shows the /download empty state because
// the renderer-side Ollama bridge is undefined there.

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import HermesClient from "./HermesClient";

export const dynamic = "force-dynamic";

export default async function HermesPage() {
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

  return <HermesClient />;
}
