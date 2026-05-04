// app/dante/page.tsx
//
// Dante's front door. Singular focus — the chat IS the page.
//
// Earlier iterations had a "Surfaces" strip at the bottom (Churn /
// Workflows / Archive / Templates / Secrets) for direct navigation
// into bulk views. We dropped that strip to remove visual contention
// with the chat surface; those routes are still accessible directly
// or via the dashboard.

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import AskDante from "./AskDante";
import { getIndustryConfig } from "@/lib/industry/config";

export const dynamic = "force-dynamic";

export default async function DantePage() {
  // AppShell + AppTopBar are now mounted by /dante/layout.tsx for
  // every /dante/* route, so this page only renders content.
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
  if (!profile?.workspace_id) redirect("/dashboard");

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("industry")
    .eq("id", profile.workspace_id)
    .maybeSingle();
  const assistantName = getIndustryConfig(workspace?.industry).assistantName;

  return (
    <div className="min-h-screen bg-[var(--canvas)]">
      <div className="px-6 md:px-8 py-16 md:py-20 max-w-[1100px] mx-auto">
        {/* Singular focus — chat is the page. The persistent left
            sidebar handles all top-level navigation; this page is
            just the chat surface. */}
        <AskDante assistantName={assistantName} />
      </div>
    </div>
  );
}
