import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import ParcelDetailClient from "./ParcelDetailClient";

export default async function ParcelDetailPage({
  params,
}: {
  params: Promise<{ parcelId: string }>;
}) {
  const { parcelId } = await params;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  return <ParcelDetailClient parcelId={parcelId} />;
}
