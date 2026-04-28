import { redirect } from "next/navigation";
import { getShellContext } from "@/lib/shell/workspace-context";
import AppShell from "@/components/shell/AppShell";
import NewReviewTableClient from "./NewReviewTableClient";

export const dynamic = "force-dynamic";

export default async function NewReviewTablePage() {
  const ctx = await getShellContext();
  if (!ctx) redirect("/auth");
  return (
    <AppShell {...ctx}>
      <NewReviewTableClient />
    </AppShell>
  );
}
