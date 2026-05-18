// app/site-scan/[parcelId]/page.tsx

import { redirect } from "next/navigation";
import { getShellContext } from "@/lib/shell/workspace-context";
import AppShell from "@/components/shell/AppShell";
import ParcelDetailClient from "./ParcelDetailClient";

export const dynamic = "force-dynamic";

export default async function ParcelDetailPage({
  params,
}: {
  params: Promise<{ parcelId: string }>;
}) {
  const { parcelId } = await params;
  const ctx = await getShellContext();
  if (!ctx) redirect("/auth");
  return (
    <AppShell {...ctx}>
      <ParcelDetailClient parcelId={parcelId} />
    </AppShell>
  );
}
