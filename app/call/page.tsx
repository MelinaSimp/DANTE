// Entry point for recording a call. Shows a searchable client list; once
// the user picks a client, we mount the CallRecorder. If ?contactId=X is
// present we skip the picker.

import { createServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import CallPageClient from "./CallPageClient";

export const dynamic = "force-dynamic";

export default async function CallPage({
  searchParams,
}: {
  searchParams: Promise<{ contactId?: string }>;
}) {
  const { contactId } = await searchParams;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .single();

  if (!profile?.workspace_id) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center text-white">
        <h1 className="text-2xl font-semibold">No workspace</h1>
        <p className="mt-2 text-white/60">
          Contact your administrator to get set up.
        </p>
      </div>
    );
  }

  const { data: contacts } = await supabase
    .from("contacts")
    .select("id, name, email, phone")
    .eq("workspace_id", profile.workspace_id)
    .order("name", { ascending: true });

  return (
    <CallPageClient
      contacts={contacts || []}
      initialContactId={contactId || null}
    />
  );
}
