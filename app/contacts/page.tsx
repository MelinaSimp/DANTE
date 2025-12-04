// app/contacts/page.tsx
import { createServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ContactsClient from "@/components/contacts/ContactsClient";

export default async function ContactsPage() {
  const supabase = await createServerSupabase();
  
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");

  // Get user's workspace
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .single();

  if (!profile?.workspace_id) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-4">Contacts</h1>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-yellow-800">No workspace found. Please contact your administrator.</p>
        </div>
      </div>
    );
  }

  // Get contacts for this workspace
  const { data: contacts } = await supabase
    .from("contacts")
    .select("*")
    .eq("workspace_id", profile.workspace_id)
    .order("name", { ascending: true });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 text-[#151515]">
      <h1 className="mb-6 text-3xl font-semibold text-[#151515]">Contacts</h1>
      <ContactsClient 
        initialContacts={contacts || []} 
        workspaceId={profile.workspace_id}
      />
    </div>
  );
}
