import { createServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ClientDetailsOverviewClient from "./ClientDetailsOverviewClient";

export default async function ClientDetailsOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ contactId?: string }>;
}) {
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

  let contacts: { id: string; name: string; phone?: string; email?: string }[] = [];
  if (profile?.workspace_id) {
    const { data } = await supabase
      .from("contacts")
      .select("id, name, phone, email")
      .eq("workspace_id", profile.workspace_id)
      .order("name");
    contacts = data ?? [];
  }

  const params = await searchParams;
  const initialContactId = params.contactId ?? null;

  return (
    <div className="min-h-screen bg-[var(--canvas)]">
      <ClientDetailsOverviewClient
        initialContacts={contacts}
        initialContactId={initialContactId}
      />
    </div>
  );
}
