// app/page.tsx — authenticated users enter the product; everyone else
// sees the NEW-DRIFT-WEBSITE marketing landing (rebranded as Dante).

export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import SiteShell from "@/components/site/SiteShell";
import MarketingHome from "@/components/site/MarketingHome";
import "@/app/(site)/site.css";

function MarketingLanding() {
  return (
    <SiteShell>
      <MarketingHome />
    </SiteShell>
  );
}

export default async function Home() {
  // Without Supabase env (local smoke), skip auth and show the marketing site.
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return <MarketingLanding />;
  }

  const { createServerSupabase } = await import("@/lib/supabase/server");
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return <MarketingLanding />;

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.workspace_id) redirect("/join");

  const { supabaseAdmin } = await import("@/lib/supabase/admin");
  const { data: ws } = await supabaseAdmin
    .from("workspaces")
    .select("onboarded_at")
    .eq("id", profile.workspace_id)
    .maybeSingle();

  redirect(ws?.onboarded_at ? "/dashboard" : "/onboarding");
}
