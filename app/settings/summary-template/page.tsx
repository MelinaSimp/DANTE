import { createServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import SummaryTemplateSettingsClient from "./SummaryTemplateSettingsClient";

export default async function SummaryTemplateSettingsPage() {
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

  if (!profile?.workspace_id) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 text-white">
        <h1 className="text-3xl font-semibold">Summary template</h1>
        <div className="mt-6 rounded-2xl border border-yellow-500/40 bg-yellow-500/10 p-5 text-sm text-yellow-200">
          No workspace found. Please contact your administrator.
        </div>
      </div>
    );
  }

  const [
    { data: settings },
    { data: documentRows },
  ] = await Promise.all([
    supabaseAdmin
      .from("workspace_settings")
      .select("summary_template_document_id")
      .eq("workspace_id", profile.workspace_id)
      .maybeSingle(),
    supabaseAdmin
      .from("documents")
      .select("id, file_name, contact_id, contacts(name)")
      .eq("workspace_id", profile.workspace_id)
      .order("updated_at", { ascending: false }),
  ]);

  const documents = (documentRows ?? []).map(
    // Supabase embedded relation returns array; normalise to single object
    (d: { id: any; file_name: any; contact_id: any; contacts: { name: any }[] | { name: any } | null }) => {
      const contactsObj = Array.isArray(d.contacts) ? d.contacts[0] : d.contacts;
      return {
        id: d.id as string,
        file_name: d.file_name as string,
        contact_id: d.contact_id as string,
        contact_name: contactsObj?.name ?? "Unknown",
      };
    }
  );

  return (
    <div className="relative mx-auto max-w-5xl px-4 py-12 text-white">
      <div className="absolute inset-0 -z-10 opacity-35">
        <div className="absolute left-20 top-28 h-72 w-72 rounded-full bg-gradient-to-br from-[#3351ff]/35 via-transparent to-transparent blur-[140px]" />
        <div className="absolute bottom-12 right-24 h-[22rem] w-[22rem] rounded-full bg-gradient-to-tr from-[#1b3b6f]/40 via-transparent to-transparent blur-[170px]" />
      </div>

      <div className="mb-10 space-y-3">
        <p className="text-xs uppercase tracking-[0.4em] text-white/40">Documents</p>
        <h1 className="text-4xl font-semibold tracking-tight">Summary template</h1>
        <p className="max-w-2xl text-sm text-white/60">
          Pick a document whose annotations define which pages and sections the AI uses when generating one-page summaries for client documents.
        </p>
      </div>

      <SummaryTemplateSettingsClient
        initialTemplateId={settings?.summary_template_document_id ?? null}
        documents={documents}
      />
    </div>
  );
}
