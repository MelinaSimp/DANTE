// app/contacts/page.tsx
//
// Canonical contacts page. The UI component lives under
// client-details-overview/ for historical reasons — we import it
// directly rather than moving files and breaking git blame.

import { Metadata } from "next";
import { createServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getShellContext } from "@/lib/shell/workspace-context";
import AppShell from "@/components/shell/AppShell";
import ClientDetailsOverviewClient from "@/app/client-details-overview/ClientDetailsOverviewClient";

export const metadata: Metadata = {
  title: "Contacts — Dante",
  description: "Manage your CRE contacts, deals, and communication history.",
};

export const dynamic = "force-dynamic";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ contactId?: string }>;
}) {
  const ctx = await getShellContext();
  if (!ctx) redirect("/auth");

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user!.id)
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
    <AppShell {...ctx}>
      <div className="min-h-screen bg-[var(--canvas)]">
        <ClientDetailsOverviewClient
          initialContacts={contacts}
          initialContactId={initialContactId}
        />
      </div>
    </AppShell>
  );
}
