import { createServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ClientDetailsOverviewClient from "./ClientDetailsOverviewClient";

export default async function ClientDetailsOverviewPage() {
  const supabase = await createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      <ClientDetailsOverviewClient />
    </div>
  );
}
