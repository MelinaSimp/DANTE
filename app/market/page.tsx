// app/market/page.tsx

import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getShellContext } from "@/lib/shell/workspace-context";
import AppShell from "@/components/shell/AppShell";
import MarketClient from "./MarketClient";

export const metadata: Metadata = {
  title: "Market Comps — Drift AI",
  description:
    "Import comparable sales from your own licensed export (CoStar, county, CSV). Drift parses them locally into structured comps — no scraping, no redistribution.",
};

export const dynamic = "force-dynamic";

export default async function MarketPage() {
  const ctx = await getShellContext();
  if (!ctx) redirect("/auth");
  return (
    <AppShell {...ctx}>
      <MarketClient />
    </AppShell>
  );
}
