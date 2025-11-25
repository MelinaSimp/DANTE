// app/settings/receptionist/page.tsx
import { createServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import QuestionManager from "./QuestionManager";

export default async function ReceptionistSettingsPage() {
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
      <div className="mx-auto max-w-4xl px-4 py-12 text-white">
        <h1 className="mb-6 text-3xl font-semibold">Receptionist Settings</h1>
        <div className="rounded-2xl border border-yellow-500/40 bg-yellow-500/10 p-6 text-yellow-50">
          <p>No workspace found. Please contact your administrator.</p>
        </div>
      </div>
    );
  }

  const { data: questions } = await supabase
    .from("receptionist_questions")
    .select("id, prompt, expected_response, sort_order, created_at, updated_at")
    .eq("workspace_id", profile.workspace_id)
    .order("sort_order", { ascending: true });

  const { data: settings } = await supabase
    .from("receptionist_settings")
    .select("greeting, farewell, twilio_phone_number")
    .eq("workspace_id", profile.workspace_id)
    .maybeSingle();

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 text-white">
      <h1 className="mb-4 text-3xl font-semibold">Receptionist Settings</h1>
      <p className="mb-8 max-w-2xl text-sm text-white/60">
        Customize the questions your AI receptionist asks callers and the default greeting/farewell used on every call.
      </p>

      <QuestionManager
        workspaceId={profile.workspace_id}
        initialQuestions={questions ?? []}
        initialSettings={
          settings ?? {
            greeting: "Hello! Thanks for calling. I just need a few quick details.",
            farewell: "Thanks for calling. Someone from the team will reach out shortly.",
            twilio_phone_number: null,
          }
        }
      />
    </div>
  );
}












