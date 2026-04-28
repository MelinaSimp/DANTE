// app/library/page.tsx — auth gate; data fetched client-side.

import { redirect } from "next/navigation";
import { getShellContext } from "@/lib/shell/workspace-context";
import AppShell from "@/components/shell/AppShell";
import LibraryClient from "./LibraryClient";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const ctx = await getShellContext();
  if (!ctx) redirect("/auth");
  return (
    <AppShell {...ctx}>
      <LibraryClient />
    </AppShell>
  );
}
