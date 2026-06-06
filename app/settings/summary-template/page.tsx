import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireFeature } from "@/lib/features/server";
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

  await requireFeature(profile?.workspace_id, "custom_summary_template");

  if (!profile?.workspace_id) {
    return (
      <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
        <div className="mx-auto max-w-3xl px-8 py-8">
          <h1 className="heading-display text-4xl text-[var(--ink)] mb-1">
            Summary template
          </h1>
          <div className="card-flat p-5 border-[var(--flag)]/30 bg-[var(--flag-soft)] mt-6">
            <p className="text-sm text-[var(--flag)]">
              No workspace found. Please contact your administrator.
            </p>
          </div>
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
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <div className="border-b border-[var(--rule)] bg-[var(--canvas)] px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="heading-display text-xl text-[var(--ink)]">Drift</span>
            <span className="label-section text-[var(--ink-muted)]">Summary template</span>
          </div>
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
            Back to settings
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-8 py-8">
        <div className="mb-6">
          <div className="label-section mb-2">Documents</div>
          <h1 className="heading-display text-4xl text-[var(--ink)] mb-1">
            Summary template
          </h1>
          <p className="text-sm text-[var(--ink-muted)] max-w-2xl">
            Pick a document whose annotations define which pages and sections
            the AI uses when generating one-page summaries for workspace documents.
          </p>
        </div>

        <SummaryTemplateSettingsClient
          initialTemplateId={settings?.summary_template_document_id ?? null}
          documents={documents}
        />
      </div>
    </div>
  );
}
