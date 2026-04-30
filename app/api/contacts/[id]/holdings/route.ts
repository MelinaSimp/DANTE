// GET /api/contacts/[id]/holdings
//
// Aggregates portfolio + retirement + insurance positions for a contact
// from the document_extractions table. Pulls every extraction whose
// parent document is linked to this contact, picks the latest per
// document × doc_type, and rolls up:
//
//   accounts:     one row per retirement_statement (custodian, type,
//                 ending balance, deferral rate, vested %, RMD)
//   holdings:     flattened from each retirement_statement's rows
//                 (fund, ticker, shares, market_value, allocation%)
//   insurance:    one row per insurance_policy (carrier, type, face
//                 amount, cash value, premium)
//   beneficiaries: aggregated from insurance + beneficiary_form rows,
//                 normalized into { account_label, tier, name, %, is_trust }
//
// This is what the Holdings section of /client-details-overview reads
// to give the advisor a single-glance view of "everything we know
// about this client's accounts, from documents we've parsed."

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Extraction = {
  id: string;
  document_id: string;
  doc_type: string;
  tax_year: number | null;
  fields: Record<string, unknown>;
  rows: Array<Record<string, unknown>>;
  confidence: number | null;
  verified_at: string | null;
  created_at: string;
};

type DocumentRow = {
  id: string;
  file_name: string | null;
  contact_id: string;
};

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[$,]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: contactId } = await params;

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify contact access via RLS
  const { data: contact } = await supabase
    .from("contacts")
    .select("id, name")
    .eq("id", contactId)
    .maybeSingle();
  if (!contact) {
    return NextResponse.json(
      { error: "Contact not found or access denied" },
      { status: 404 }
    );
  }

  // Documents for this contact
  const { data: docs, error: docErr } = await supabase
    .from("documents")
    .select("id, file_name, contact_id")
    .eq("contact_id", contactId);
  if (docErr) {
    return NextResponse.json({ error: docErr.message }, { status: 500 });
  }

  const documents = (docs || []) as DocumentRow[];
  if (documents.length === 0) {
    return NextResponse.json({
      accounts: [],
      holdings: [],
      insurance: [],
      beneficiaries: [],
      summary: { total_assets: 0, document_count: 0 },
    });
  }

  // Pull extractions for all of those documents
  const docIds = documents.map((d) => d.id);
  const { data: rawExtractions, error: extErr } = await supabase
    .from("document_extractions")
    .select(
      "id, document_id, doc_type, tax_year, fields, rows, confidence, verified_at, created_at"
    )
    .in("document_id", docIds)
    .order("created_at", { ascending: false });
  if (extErr) {
    return NextResponse.json({ error: extErr.message }, { status: 500 });
  }

  // Keep newest per (document_id, doc_type)
  const seen = new Set<string>();
  const extractions = ((rawExtractions || []) as Extraction[]).filter((e) => {
    const k = `${e.document_id}:${e.doc_type}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const docMap = new Map(documents.map((d) => [d.id, d]));

  // ── Retirement / brokerage statements ───────────────────────
  const accounts = extractions
    .filter((e) => e.doc_type === "retirement_statement")
    .map((e) => {
      const f = e.fields || {};
      return {
        extraction_id: e.id,
        document_id: e.document_id,
        document_name: docMap.get(e.document_id)?.file_name || null,
        custodian: str(f.custodian),
        plan_name: str(f.plan_name),
        account_type: str(f.account_type),
        period_end: str(f.period_end),
        ending_balance: num(f.ending_balance),
        beginning_balance: num(f.beginning_balance),
        employee_contributions_ytd: num(f.employee_contributions_ytd),
        employer_match_ytd: num(f.employer_match_ytd),
        deferral_rate: num(f.deferral_rate),
        vested_balance: num(f.vested_balance),
        vesting_percent: num(f.vesting_percent),
        roth_balance: num(f.roth_balance),
        pretax_balance: num(f.pretax_balance),
        after_tax_balance: num(f.after_tax_balance),
        loan_balance: num(f.loan_balance),
        rmd_due: num(f.rmd_due),
        verified: !!e.verified_at,
        confidence: e.confidence,
      };
    })
    .sort((a, b) => (b.ending_balance || 0) - (a.ending_balance || 0));

  // Flatten holdings rows from every retirement statement
  const holdings: Array<{
    document_id: string;
    custodian: string | null;
    account_type: string | null;
    fund_name: string | null;
    ticker: string | null;
    shares: number | null;
    price: number | null;
    market_value: number | null;
    allocation_percent: number | null;
    asset_class: string | null;
  }> = [];
  for (const acc of accounts) {
    const e = extractions.find((x) => x.id === acc.extraction_id);
    if (!e || !Array.isArray(e.rows)) continue;
    for (const r of e.rows) {
      holdings.push({
        document_id: e.document_id,
        custodian: acc.custodian,
        account_type: acc.account_type,
        fund_name: str(r.fund_name),
        ticker: str(r.ticker),
        shares: num(r.shares),
        price: num(r.price),
        market_value: num(r.market_value),
        allocation_percent: num(r.allocation_percent),
        asset_class: str(r.asset_class),
      });
    }
  }
  holdings.sort((a, b) => (b.market_value || 0) - (a.market_value || 0));

  // ── Insurance ───────────────────────────────────────────────
  const insurance = extractions
    .filter((e) => e.doc_type === "insurance_policy")
    .map((e) => {
      const f = e.fields || {};
      return {
        extraction_id: e.id,
        document_id: e.document_id,
        document_name: docMap.get(e.document_id)?.file_name || null,
        policy_type: str(f.policy_type),
        carrier: str(f.carrier),
        policy_number: str(f.policy_number),
        policy_owner: str(f.policy_owner),
        insured_name: str(f.insured_name),
        face_amount: num(f.face_amount),
        cash_value: num(f.cash_value),
        premium_amount: num(f.premium_amount),
        premium_frequency: str(f.premium_frequency),
        surrender_period_end: str(f.surrender_period_end),
        loan_balance: num(f.loan_balance),
        riders: str(f.rider_summary),
        verified: !!e.verified_at,
        confidence: e.confidence,
      };
    })
    .sort((a, b) => (b.face_amount || 0) - (a.face_amount || 0));

  // ── Beneficiaries (from beneficiary_form + insurance) ───────
  const beneficiaries: Array<{
    source_doc: string | null;
    account_label: string;
    custodian: string | null;
    account_type: string | null;
    tier: "primary" | "contingent" | string;
    name: string;
    relationship: string | null;
    percent: number | null;
    is_trust: boolean;
    is_per_stirpes: boolean;
  }> = [];

  for (const e of extractions.filter((x) => x.doc_type === "beneficiary_form")) {
    const f = e.fields || {};
    const accountLabel = [str(f.custodian), str(f.account_type)]
      .filter(Boolean)
      .join(" · ") || "Account";
    for (const r of e.rows || []) {
      const name = str(r.beneficiary_name);
      if (!name) continue;
      beneficiaries.push({
        source_doc: docMap.get(e.document_id)?.file_name || null,
        account_label: accountLabel,
        custodian: str(f.custodian),
        account_type: str(f.account_type),
        tier: (str(r.tier) as any) || "primary",
        name,
        relationship: str(r.relationship),
        percent: num(r.percent),
        is_trust: r.is_trust === true,
        is_per_stirpes: r.is_per_stirpes === true,
      });
    }
  }
  for (const e of extractions.filter((x) => x.doc_type === "insurance_policy")) {
    const f = e.fields || {};
    const accountLabel = [str(f.carrier), str(f.policy_type)]
      .filter(Boolean)
      .join(" · ") || "Insurance policy";
    for (const r of e.rows || []) {
      const name = str(r.beneficiary_name);
      if (!name) continue;
      beneficiaries.push({
        source_doc: docMap.get(e.document_id)?.file_name || null,
        account_label: accountLabel,
        custodian: str(f.carrier),
        account_type: str(f.policy_type),
        tier: (str(r.tier) as any) || "primary",
        name,
        relationship: str(r.relationship),
        percent: num(r.percent),
        is_trust: r.is_trust === true,
        is_per_stirpes: false,
      });
    }
  }

  const totalAssets = accounts.reduce(
    (s, a) => s + (a.ending_balance || 0),
    0
  );
  const totalDeathBenefit = insurance.reduce(
    (s, p) => s + (p.face_amount || 0),
    0
  );

  return NextResponse.json({
    accounts,
    holdings,
    insurance,
    beneficiaries,
    summary: {
      total_assets: totalAssets,
      total_death_benefit: totalDeathBenefit,
      account_count: accounts.length,
      holding_count: holdings.length,
      policy_count: insurance.length,
      beneficiary_count: beneficiaries.length,
      document_count: documents.length,
      extraction_count: extractions.length,
    },
  });
}
