// lib/autopilot/analyze.ts
//
// The autonomous pipeline orchestrator ("Hermes"). Called fire-and-
// forget after a document is ingested: classify it, run the matching
// analysis, and write a pending review item. Rent rolls are
// auto-underwritten deterministically (no LLM, no external calls);
// other recognized types produce a one-click suggestion. Nothing is
// sent anywhere — the review item IS the approval gate.

import { supabaseAdmin } from "@/lib/supabase/admin";
import { classifyDocument } from "./classify";

interface VaultItemRow {
  id: string;
  workspace_id: string;
  title: string | null;
  content: string | null;
  file_url: string | null;
  file_type: string | null;
}

function isSpreadsheet(fileType?: string | null): boolean {
  const ft = (fileType || "").toLowerCase();
  return (
    ft.includes("spreadsheet") || ft.includes("excel") || ft.includes("csv") ||
    ft.endsWith("xlsx") || ft.endsWith("xls") || ft === "xlsx" || ft === "xls" || ft === "csv"
  );
}

const usd0 = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/**
 * Classify a freshly-ingested document and produce its analysis.
 * Idempotent: skips if an analysis already exists (unless force).
 * Best-effort — callers should not await or let it throw.
 */
export async function runAutopilotForItem(
  itemId: string,
  opts: { force?: boolean } = {},
): Promise<void> {
  const { data: item } = await supabaseAdmin
    .from("vault_items")
    .select("id, workspace_id, title, content, file_url, file_type")
    .eq("id", itemId)
    .maybeSingle<VaultItemRow>();
  if (!item) return;

  if (!opts.force) {
    const { data: existing } = await supabaseAdmin
      .from("dante_document_analyses")
      .select("id")
      .eq("vault_item_id", itemId)
      .maybeSingle();
    if (existing) return;
  }

  const cls = classifyDocument({
    title: item.title,
    fileType: item.file_type,
    text: item.content,
  });
  if (cls.type === "other") return;

  let headline = "";
  let summary: Record<string, unknown> = { doc_type: cls.type, signals: cls.signals };

  if (cls.type === "rent_roll" && isSpreadsheet(item.file_type) && item.file_url) {
    const result = await autoUnderwrite(item);
    headline = result.headline;
    summary = { ...summary, ...result.summary };
  } else if (cls.type === "rent_roll") {
    headline = "Rent roll detected — open it in the Underwriter to build a model.";
    summary = { ...summary, suggested_action: "underwrite" };
  } else if (cls.type === "lease") {
    headline = "Lease detected — ready to abstract the key terms.";
    summary = { ...summary, suggested_action: "lease_abstract" };
  } else if (cls.type === "operating_statement") {
    headline = "Operating statement detected — review NOI and expense lines.";
    summary = { ...summary, suggested_action: "review_financials" };
  } else if (cls.type === "offering_memo") {
    headline = "Offering memorandum detected — extract the investment highlights.";
    summary = { ...summary, suggested_action: "extract_highlights" };
  }

  await supabaseAdmin
    .from("dante_document_analyses")
    .upsert(
      {
        workspace_id: item.workspace_id,
        vault_item_id: item.id,
        doc_type: cls.type,
        status: "pending",
        title: item.title,
        headline,
        confidence: cls.confidence,
        summary,
      },
      { onConflict: "vault_item_id" },
    );
}

/**
 * Deterministically underwrite a rent-roll spreadsheet: parse it,
 * seed default assumptions, and compute headline returns. No LLM.
 */
async function autoUnderwrite(
  item: VaultItemRow,
): Promise<{ headline: string; summary: Record<string, unknown> }> {
  try {
    const res = await fetch(item.file_url as string);
    if (!res.ok) throw new Error(`source fetch ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());

    const { parseRentRoll } = await import("@/lib/underwriting/rent-roll-parser");
    const { computeDcfSummary, DEFAULT_ASSUMPTIONS } = await import("@/lib/underwriting/dcf-math");

    const parsed = parseRentRoll(buffer);
    if (!parsed.ok || parsed.totals.totalAnnualRent <= 0 || parsed.totals.totalSf <= 0) {
      return {
        headline: "Rent roll detected — open it in the Underwriter to build a model.",
        summary: { auto_underwrite: false, note: "Could not auto-derive rent or area.", warnings: parsed.warnings },
      };
    }

    const gpr = parsed.totals.totalAnnualRent;
    const s = computeDcfSummary({
      property: { name: item.title || "Asset", address: "", sf: parsed.totals.totalSf },
      assumptions: { ...DEFAULT_ASSUMPTIONS },
      income: { gross_potential_rent: gpr, other_income: 0, reimbursements: 0 },
      expenses: {
        operating_expenses: Math.round(gpr * 0.35),
        management_fee: 0, reserves: 0, insurance: 0, taxes: 0,
      },
    });

    return {
      headline: `Indicated value ${usd0(s.indicatedValue)} · ${(s.impliedGoingInCapRate * 100).toFixed(2)}% implied cap · ${parsed.totals.tenantCount} tenants`,
      summary: {
        auto_underwrite: true,
        total_sf: parsed.totals.totalSf,
        gpr,
        occupancy_pct: parsed.totals.occupancyPct,
        tenant_count: parsed.totals.tenantCount,
        vacant_count: parsed.totals.vacantCount,
        year1_noi: s.year1NOI,
        indicated_value: s.indicatedValue,
        value_per_sf: s.valuePerSF,
        implied_cap: s.impliedGoingInCapRate,
        assumptions: "Drift defaults (10yr, 8.5% discount, 7% exit, 35% opex estimate)",
        warnings: parsed.warnings,
      },
    };
  } catch (e) {
    return {
      headline: "Rent roll detected — open it in the Underwriter to build a model.",
      summary: { auto_underwrite: false, error: e instanceof Error ? e.message : String(e) },
    };
  }
}
