// Planning analyzers — the four Phase 2 RIA agents.
//
// Each analyzer takes a contact's parsed data (1040, retirement
// statements, beneficiary forms, trust docs) and emits zero or one
// PlanningSignalDraft. The outer runner upserts those drafts into
// the planning_signals table.
//
// Design principles:
//   - Read-only computation. Analyzers don't mutate anything.
//   - Skip when data is missing. We'd rather emit nothing than emit
//     something speculative — RIAs lose trust the moment we hallucinate.
//   - Cite everything. Every signal carries citations[] pointing at
//     the document_extraction or contact field that grounded the
//     finding, so the drill-down view can show "this is why."
//   - Plain-English summary. No jargon the advisor has to translate
//     for the client.

import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  ageFromDob,
  bracketHeadroom,
  CURRENT_TAX_YEAR,
  marginalRate,
  rmdAge,
  STANDARD_DEDUCTION_2025,
  UNIFORM_LIFETIME_TABLE,
  type FilingStatus,
} from "./constants";

export type SignalType =
  | "roth_conversion"
  | "rmd_due"
  | "tax_loss_harvest"
  | "beneficiary_mismatch";

export type Severity = "info" | "warn" | "action";

export type Citation = {
  kind: "doc" | "mem" | "ext";
  id: string;
  label: string;
};

export type PlanningSignalDraft = {
  signal_type: SignalType;
  severity: Severity;
  title: string;
  summary: string;
  payload: Record<string, unknown>;
  citations: Citation[];
};

type Extraction = {
  id: string;
  document_id: string;
  doc_type: string;
  tax_year: number | null;
  fields: Record<string, any>;
  rows: any[];
};

type Contact = {
  id: string;
  workspace_id: string;
  name: string | null;
  date_of_birth: string | null;
  spouse_date_of_birth: string | null;
};

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[$,]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function fmtMoney(v: number): string {
  return v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function fmtPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

// ============================================================
// ROTH CONVERSION ANALYZER
// ============================================================
//
// Logic: take the most recent 1040, compute headroom in the current
// bracket, recommend a conversion amount equal to that headroom (or
// half of pre-tax IRA balance, whichever is lower). Skip clients who:
//   - are over their RMD age (RMDs eat into the conversion window)
//   - have no pre-tax balance to convert
//   - have no recent 1040 to anchor the bracket math on
//   - are already in the top bracket (no headroom to fill)
function analyzeRothConversion(
  extractions: Extraction[],
  contact: Contact,
): PlanningSignalDraft | null {
  // Most recent 1040
  const f1040 = extractions
    .filter((e) => e.doc_type === "form_1040")
    .sort((a, b) => (b.tax_year || 0) - (a.tax_year || 0))[0];
  if (!f1040) return null;

  const status = (f1040.fields.filing_status as FilingStatus) || null;
  if (!status || !["single", "mfj", "mfs", "hoh"].includes(status)) {
    return null;
  }

  const taxableIncome = num(f1040.fields.taxable_income);
  const agi = num(f1040.fields.agi);
  if (taxableIncome === null && agi === null) return null;

  // Use taxable income if we have it; otherwise approximate from AGI.
  const ti =
    taxableIncome !== null
      ? taxableIncome
      : agi! - STANDARD_DEDUCTION_2025[status];

  const bracket = bracketHeadroom(ti, status);
  // Top bracket — no point converting at 37%.
  if (bracket.next_rate === null) return null;
  if (bracket.headroom <= 5_000) return null; // Rounding noise; skip.

  // Pre-tax balance available to convert.
  let pretaxBalance = 0;
  const sources: Citation[] = [
    { kind: "ext", id: f1040.id, label: `1040 (TY ${f1040.tax_year ?? "?"})` },
  ];

  for (const e of extractions.filter((x) => x.doc_type === "retirement_statement")) {
    const f = e.fields;
    const acctType = String(f.account_type || "");
    const isPretax =
      acctType === "traditional_401k" ||
      acctType === "403b" ||
      acctType === "457b" ||
      acctType === "traditional_ira" ||
      acctType === "sep_ira" ||
      acctType === "simple_ira";
    if (!isPretax) continue;
    const bal = num(f.pretax_balance) ?? num(f.ending_balance);
    if (bal !== null) {
      pretaxBalance += bal;
      sources.push({
        kind: "ext",
        id: e.id,
        label: `${f.custodian || "Custodian"} ${acctType}`,
      });
    }
  }
  for (const e of extractions.filter((x) => x.doc_type === "form_5498")) {
    const f = e.fields;
    if (f.ira_type === "traditional" || f.ira_type === "sep" || f.ira_type === "simple") {
      const bal = num(f.fmv_of_account);
      if (bal !== null) {
        pretaxBalance += bal;
        sources.push({
          kind: "ext",
          id: e.id,
          label: `5498 ${f.ira_type} IRA (TY ${e.tax_year ?? "?"})`,
        });
      }
    }
  }

  if (pretaxBalance < 1_000) return null;

  // Skip clients past RMD age — different conversation.
  if (contact.date_of_birth) {
    const dob = new Date(contact.date_of_birth);
    if (!Number.isNaN(dob.getTime())) {
      const age = ageFromDob(contact.date_of_birth)!;
      const triggerAge = rmdAge(dob.getFullYear());
      if (age >= triggerAge) return null;
    }
  }

  const recommendedConversion = Math.min(
    bracket.headroom,
    Math.round(pretaxBalance * 0.5),
  );
  if (recommendedConversion < 5_000) return null;

  const taxAtCurrentRate = recommendedConversion * bracket.current_rate;
  const taxAtNextRate = recommendedConversion * (bracket.next_rate ?? 0);
  const savingsVsNextBracket = taxAtNextRate - taxAtCurrentRate;

  return {
    signal_type: "roth_conversion",
    severity: "action",
    title: `Convert up to ${fmtMoney(recommendedConversion)} to fill the ${fmtPercent(bracket.current_rate)} bracket`,
    summary:
      `Based on ${f1040.tax_year ?? "the most recent"} 1040 (${status.toUpperCase()}, taxable income ${fmtMoney(ti)}), ` +
      `there's about ${fmtMoney(bracket.headroom)} of headroom before this client crosses into the ${fmtPercent(bracket.next_rate ?? 0)} bracket. ` +
      `Pre-tax retirement balance is roughly ${fmtMoney(pretaxBalance)}. ` +
      `A Roth conversion of ${fmtMoney(recommendedConversion)} taxed at ${fmtPercent(bracket.current_rate)} ` +
      `(≈${fmtMoney(taxAtCurrentRate)} federal) saves about ${fmtMoney(savingsVsNextBracket)} versus paying tomorrow's rate at the next bracket.`,
    payload: {
      tax_year_anchor: f1040.tax_year,
      filing_status: status,
      taxable_income: ti,
      current_rate: bracket.current_rate,
      next_rate: bracket.next_rate,
      bracket_headroom: bracket.headroom,
      pretax_balance: pretaxBalance,
      recommended_conversion: recommendedConversion,
      tax_at_current_rate: taxAtCurrentRate,
      savings_vs_next_bracket: savingsVsNextBracket,
    },
    citations: sources,
  };
}

// ============================================================
// RMD ANALYZER
// ============================================================
//
// Logic: if the client is at or past their SECURE-2.0 RMD age, sum
// pre-tax balances and compute the required distribution against the
// Uniform Lifetime Table. Compare to YTD distributions if known
// (1099-R from current year). Flag if RMD owed > YTD distributed.
function analyzeRmd(
  extractions: Extraction[],
  contact: Contact,
): PlanningSignalDraft | null {
  if (!contact.date_of_birth) return null;
  const age = ageFromDob(contact.date_of_birth);
  if (age === null) return null;
  const dobYear = new Date(contact.date_of_birth).getFullYear();
  const triggerAge = rmdAge(dobYear);
  if (age < triggerAge) return null;

  // Prior year-end FMV is what RMD is computed against. The 5498 from
  // last tax year carries it (Box 5). If not present, fall back to
  // the most recent retirement_statement ending_balance.
  const priorYearFmvFromForm5498 = extractions
    .filter((e) => e.doc_type === "form_5498")
    .filter((e) => (e.tax_year ?? 0) === CURRENT_TAX_YEAR - 1)
    .reduce((sum, e) => {
      const t = String(e.fields.ira_type || "");
      if (t !== "traditional" && t !== "sep" && t !== "simple") return sum;
      const v = num(e.fields.fmv_of_account);
      return sum + (v ?? 0);
    }, 0);

  let pretaxBalance = priorYearFmvFromForm5498;
  const sources: Citation[] = [];

  if (priorYearFmvFromForm5498 > 0) {
    sources.push({
      kind: "ext",
      id: extractions.find(
        (e) =>
          e.doc_type === "form_5498" &&
          (e.tax_year ?? 0) === CURRENT_TAX_YEAR - 1,
      )?.id || "",
      label: `5498 FMV (TY ${CURRENT_TAX_YEAR - 1})`,
    });
  } else {
    for (const e of extractions.filter((x) => x.doc_type === "retirement_statement")) {
      const f = e.fields;
      const acctType = String(f.account_type || "");
      const isPretax =
        acctType === "traditional_401k" ||
        acctType === "403b" ||
        acctType === "457b" ||
        acctType === "traditional_ira" ||
        acctType === "sep_ira" ||
        acctType === "simple_ira";
      if (!isPretax) continue;
      const bal = num(f.pretax_balance) ?? num(f.ending_balance);
      if (bal !== null) {
        pretaxBalance += bal;
        sources.push({
          kind: "ext",
          id: e.id,
          label: `${f.custodian || "Custodian"} statement`,
        });
      }
    }
  }

  if (pretaxBalance < 1_000) return null;

  const divisor = UNIFORM_LIFETIME_TABLE[age] || UNIFORM_LIFETIME_TABLE[120];
  const requiredRmd = Math.round(pretaxBalance / divisor);

  // YTD distributions from 1099-R for the current tax year.
  const distributedYtd = extractions
    .filter(
      (e) => e.doc_type === "form_1099_r" && e.tax_year === CURRENT_TAX_YEAR,
    )
    .reduce((sum, e) => sum + (num(e.fields.gross_distribution) ?? 0), 0);

  const remaining = Math.max(0, requiredRmd - distributedYtd);
  const severity: Severity = remaining > 0 ? "action" : "info";

  return {
    signal_type: "rmd_due",
    severity,
    title:
      remaining > 0
        ? `${fmtMoney(remaining)} RMD remaining for ${CURRENT_TAX_YEAR}`
        : `${CURRENT_TAX_YEAR} RMD on track`,
    summary:
      `At age ${age} (RMD age ${triggerAge}), the required minimum distribution against an estimated ` +
      `${fmtMoney(pretaxBalance)} in pre-tax balances is ${fmtMoney(requiredRmd)} ` +
      `(uniform lifetime divisor ${divisor.toFixed(1)}). ` +
      (distributedYtd > 0
        ? `Distributions taken so far this year: ${fmtMoney(distributedYtd)}. `
        : `No distributions recorded yet this year. `) +
      (remaining > 0
        ? `Remaining: ${fmtMoney(remaining)}. Missed RMDs trigger a 25% excise tax (10% if corrected within 2 years).`
        : `On track.`),
    payload: {
      age,
      trigger_age: triggerAge,
      pretax_balance: pretaxBalance,
      divisor,
      required_rmd: requiredRmd,
      distributed_ytd: distributedYtd,
      remaining,
    },
    citations: sources,
  };
}

// ============================================================
// TAX-LOSS HARVESTING ANALYZER
// ============================================================
//
// v1: from the most recent 1099-B, sum realized losses and short-term
// vs long-term, identify positions where wash_sale_loss_disallowed > 0,
// and flag if substantial unused losses exist OR wash sales eliminated
// material loss.
//
// v2 (out of scope here): pair with current-price feed to identify
// candidate positions to sell. Out of scope until the custodian feed
// is wired up in Phase 5.
function analyzeTLH(extractions: Extraction[]): PlanningSignalDraft | null {
  const f1099Bs = extractions.filter(
    (e) =>
      e.doc_type === "form_1099_b" &&
      (e.tax_year ?? 0) === CURRENT_TAX_YEAR,
  );
  if (f1099Bs.length === 0) return null;

  let realizedShort = 0;
  let realizedLong = 0;
  let washDisallowed = 0;
  const lossPositions: Array<{
    description: string;
    proceeds: number;
    basis: number;
    loss: number;
    wash_disallowed: number;
    short_or_long: string;
  }> = [];
  const sources: Citation[] = [];

  for (const e of f1099Bs) {
    sources.push({
      kind: "ext",
      id: e.id,
      label: `1099-B ${e.fields.payer_name || ""} TY ${e.tax_year}`,
    });
    for (const r of e.rows || []) {
      const proceeds = num(r.proceeds) ?? 0;
      const basis = num(r.cost_basis) ?? 0;
      const wash = num(r.wash_sale_loss_disallowed) ?? 0;
      const realizedGain = proceeds - basis;
      const term = String(r.short_or_long_term || "");
      if (term === "short") realizedShort += realizedGain;
      else if (term === "long") realizedLong += realizedGain;
      washDisallowed += wash;

      if (realizedGain < 0) {
        lossPositions.push({
          description: String(r.description || "(unspecified)"),
          proceeds,
          basis,
          loss: realizedGain,
          wash_disallowed: wash,
          short_or_long: term,
        });
      }
    }
  }

  const netLoss =
    realizedShort < 0 || realizedLong < 0
      ? Math.min(0, realizedShort) + Math.min(0, realizedLong)
      : 0;

  const isFlagWorthy = netLoss < -3_000 || washDisallowed > 1_000;
  if (!isFlagWorthy && lossPositions.length === 0) return null;

  // Up to $3,000 of net capital loss offsets ordinary income; the rest
  // carries forward.
  const offsetVsOrdinary = Math.max(netLoss, -3_000);
  const carryforward = netLoss < -3_000 ? netLoss + 3_000 : 0;

  lossPositions.sort((a, b) => a.loss - b.loss);

  return {
    signal_type: "tax_loss_harvest",
    severity:
      washDisallowed > 1_000
        ? "warn"
        : netLoss < -3_000
        ? "action"
        : "info",
    title:
      washDisallowed > 1_000
        ? `${fmtMoney(washDisallowed)} of losses disallowed by wash-sale rule`
        : netLoss < 0
        ? `${fmtMoney(Math.abs(netLoss))} in realized losses YTD`
        : `Realized loss positions to review`,
    summary:
      `Realized short-term: ${fmtMoney(realizedShort)}. Long-term: ${fmtMoney(realizedLong)}. ` +
      (washDisallowed > 0
        ? `${fmtMoney(washDisallowed)} of those losses were disallowed by the 30-day wash-sale rule. `
        : ``) +
      (netLoss < 0
        ? `${fmtMoney(Math.abs(offsetVsOrdinary))} can offset ordinary income this year` +
          (carryforward < 0
            ? `, with ${fmtMoney(Math.abs(carryforward))} carrying forward.`
            : `.`)
        : ``) +
      (lossPositions.length > 0
        ? ` ${lossPositions.length} loss position${lossPositions.length === 1 ? "" : "s"} on the 1099-B.`
        : ``),
    payload: {
      tax_year: CURRENT_TAX_YEAR,
      realized_short: realizedShort,
      realized_long: realizedLong,
      wash_disallowed: washDisallowed,
      net_loss: netLoss,
      offset_vs_ordinary: offsetVsOrdinary,
      carryforward,
      loss_positions: lossPositions.slice(0, 25),
      total_loss_positions: lossPositions.length,
    },
    citations: sources,
  };
}

// ============================================================
// BENEFICIARY MISMATCH ANALYZER
// ============================================================
//
// Logic: pull beneficiary designations from beneficiary_form +
// insurance_policy + the 1099-R recipient. Pull beneficiaries from
// trust_document. Flag two patterns:
//
//   1. Account designates "Estate" or "no beneficiary" — the asset
//      will probate, defeating the point of having a trust.
//   2. Account beneficiaries don't include people the trust says
//      should receive. (Not always wrong — sometimes intentional —
//      but worth surfacing.)
//   3. Primary tier doesn't sum to 100%, OR no contingent named.
function analyzeBeneficiaries(
  extractions: Extraction[],
): PlanningSignalDraft | null {
  type DesignationRow = {
    account_label: string;
    source_extraction: string;
    tier: string;
    name: string;
    percent: number | null;
    is_trust: boolean;
  };
  const designations: DesignationRow[] = [];

  const accounts = new Map<
    string,
    { custodian: string; account_type: string; primary_total: number; has_contingent: boolean; estate_named: boolean; ext_id: string }
  >();

  for (const e of extractions.filter((x) => x.doc_type === "beneficiary_form")) {
    const f = e.fields;
    const label = `${f.custodian || "Account"} · ${f.account_type || ""}`;
    let primarySum = 0;
    let hasContingent = false;
    let estateNamed = false;
    for (const r of e.rows || []) {
      const tier = String(r.tier || "primary");
      const name = String(r.beneficiary_name || "").trim();
      if (!name) continue;
      const pct = num(r.percent);
      if (tier === "primary" && pct !== null) primarySum += pct;
      if (tier === "contingent") hasContingent = true;
      if (/estate/i.test(name)) estateNamed = true;
      designations.push({
        account_label: label,
        source_extraction: e.id,
        tier,
        name,
        percent: pct,
        is_trust: r.is_trust === true,
      });
    }
    accounts.set(e.id, {
      custodian: String(f.custodian || ""),
      account_type: String(f.account_type || ""),
      primary_total: primarySum,
      has_contingent: hasContingent,
      estate_named: estateNamed,
      ext_id: e.id,
    });
  }

  for (const e of extractions.filter((x) => x.doc_type === "insurance_policy")) {
    const f = e.fields;
    const label = `${f.carrier || "Carrier"} · ${f.policy_type || ""}`;
    let primarySum = 0;
    let hasContingent = false;
    let estateNamed = false;
    for (const r of e.rows || []) {
      const tier = String(r.tier || "primary");
      const name = String(r.beneficiary_name || "").trim();
      if (!name) continue;
      const pct = num(r.percent);
      if (tier === "primary" && pct !== null) primarySum += pct;
      if (tier === "contingent") hasContingent = true;
      if (/estate/i.test(name)) estateNamed = true;
      designations.push({
        account_label: label,
        source_extraction: e.id,
        tier,
        name,
        percent: pct,
        is_trust: r.is_trust === true,
      });
    }
    accounts.set(e.id, {
      custodian: String(f.carrier || ""),
      account_type: String(f.policy_type || ""),
      primary_total: primarySum,
      has_contingent: hasContingent,
      estate_named: estateNamed,
      ext_id: e.id,
    });
  }

  if (accounts.size === 0) return null;

  // Issues across accounts
  const accountsWithEstate: string[] = [];
  const accountsMissingPrimary100: Array<{ label: string; total: number }> = [];
  const accountsMissingContingent: string[] = [];

  for (const acc of accounts.values()) {
    const label = `${acc.custodian} ${acc.account_type}`.trim();
    if (acc.estate_named) accountsWithEstate.push(label);
    if (acc.primary_total > 0 && Math.abs(acc.primary_total - 100) > 0.5) {
      accountsMissingPrimary100.push({ label, total: acc.primary_total });
    }
    if (!acc.has_contingent) accountsMissingContingent.push(label);
  }

  // Cross-check against trust_document beneficiaries.
  const trust = extractions.find((e) => e.doc_type === "trust_document");
  let trustMismatches: string[] = [];
  if (trust) {
    const trustBeneficiaries = String(trust.fields.primary_beneficiaries || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (trustBeneficiaries.length > 0) {
      // For each account, check if any trust beneficiary appears in
      // the designation roster (or if the account names the trust).
      for (const acc of accounts.values()) {
        const accDesignations = designations.filter(
          (d) => d.source_extraction === acc.ext_id,
        );
        const namesTrust = accDesignations.some(
          (d) =>
            d.is_trust ||
            d.name.toLowerCase().includes("trust") ||
            d.name.toLowerCase().includes(
              String(trust.fields.trust_name || "").toLowerCase().slice(0, 20),
            ),
        );
        if (namesTrust) continue; // Account routes to the trust — fine.
        const overlapsAnyTrustBeneficiary = accDesignations.some((d) =>
          trustBeneficiaries.some((tb) => d.name.toLowerCase().includes(tb)),
        );
        if (!overlapsAnyTrustBeneficiary && accDesignations.length > 0) {
          trustMismatches.push(
            `${acc.custodian} ${acc.account_type}`.trim() || "Account",
          );
        }
      }
    }
  }

  const issueCount =
    accountsWithEstate.length +
    accountsMissingPrimary100.length +
    accountsMissingContingent.length +
    trustMismatches.length;
  if (issueCount === 0) return null;

  const lines: string[] = [];
  if (accountsWithEstate.length > 0) {
    lines.push(
      `${accountsWithEstate.length} account${accountsWithEstate.length === 1 ? "" : "s"} name "Estate" as beneficiary — assets will probate.`,
    );
  }
  if (accountsMissingPrimary100.length > 0) {
    lines.push(
      `${accountsMissingPrimary100.length} account${accountsMissingPrimary100.length === 1 ? "" : "s"} have primary beneficiary percentages that don't sum to 100%.`,
    );
  }
  if (accountsMissingContingent.length > 0) {
    lines.push(
      `${accountsMissingContingent.length} account${accountsMissingContingent.length === 1 ? "" : "s"} have no contingent beneficiary named.`,
    );
  }
  if (trustMismatches.length > 0) {
    lines.push(
      `${trustMismatches.length} account${trustMismatches.length === 1 ? "" : "s"} don't list any trust-named beneficiary or the trust itself.`,
    );
  }

  const sources: Citation[] = Array.from(accounts.values()).map((a) => ({
    kind: "ext",
    id: a.ext_id,
    label: `${a.custodian} ${a.account_type}`.trim() || "Account",
  }));
  if (trust) {
    sources.unshift({
      kind: "ext",
      id: trust.id,
      label: `Trust: ${trust.fields.trust_name || "(unnamed)"}`,
    });
  }

  return {
    signal_type: "beneficiary_mismatch",
    severity: accountsWithEstate.length > 0 || trustMismatches.length > 0 ? "action" : "warn",
    title: `${issueCount} beneficiary issue${issueCount === 1 ? "" : "s"} found`,
    summary: lines.join(" "),
    payload: {
      issue_count: issueCount,
      accounts_naming_estate: accountsWithEstate,
      accounts_missing_primary_100: accountsMissingPrimary100,
      accounts_missing_contingent: accountsMissingContingent,
      trust_mismatches: trustMismatches,
      designations: designations.slice(0, 50),
    },
    citations: sources,
  };
}

// ============================================================
// RUNNER
// ============================================================

const ANALYZERS = [
  analyzeRothConversion,
  analyzeRmd,
  analyzeTLH,
  analyzeBeneficiaries,
] as const;

export async function runPlanningForContact(
  workspaceId: string,
  contactId: string,
  runId?: string,
): Promise<PlanningSignalDraft[]> {
  const { data: contactRow } = await supabaseAdmin
    .from("contacts")
    .select("id, workspace_id, name, date_of_birth, spouse_date_of_birth")
    .eq("id", contactId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!contactRow) return [];
  const contact = contactRow as Contact;

  const { data: docs } = await supabaseAdmin
    .from("documents")
    .select("id")
    .eq("contact_id", contactId)
    .eq("workspace_id", workspaceId);
  const docIds = (docs || []).map((d: any) => d.id);
  if (docIds.length === 0) return [];

  const { data: rawExt } = await supabaseAdmin
    .from("document_extractions")
    .select("id, document_id, doc_type, tax_year, fields, rows, created_at")
    .in("document_id", docIds)
    .order("created_at", { ascending: false });

  // Newest per (document_id, doc_type)
  const seen = new Set<string>();
  const extractions = ((rawExt || []) as any[]).filter((e) => {
    const k = `${e.document_id}:${e.doc_type}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }) as Extraction[];

  const drafts: PlanningSignalDraft[] = [];
  for (const fn of ANALYZERS) {
    try {
      const r = (fn as any)(extractions, contact);
      if (r) drafts.push(r);
    } catch (err) {
      console.error(`[planning] ${fn.name} failed for contact ${contactId}:`, err);
    }
  }

  // Upsert results. One row per (workspace, contact, signal_type).
  for (const d of drafts) {
    const { error } = await supabaseAdmin
      .from("planning_signals")
      .upsert(
        {
          workspace_id: workspaceId,
          contact_id: contactId,
          signal_type: d.signal_type,
          severity: d.severity,
          title: d.title,
          summary: d.summary,
          payload: d.payload,
          citations: d.citations,
          computed_at: new Date().toISOString(),
          computed_by_run: runId || null,
          dismissed_at: null, // unblock any prior dismiss when fresh data arrives
          dismissed_by: null,
          dismissed_reason: null,
        },
        { onConflict: "workspace_id,contact_id,signal_type" },
      );
    if (error) {
      console.error("[planning] signal upsert failed:", error.message);
    }
  }

  // For analyzers that emitted nothing this round, clear stale signals.
  const emittedTypes = new Set(drafts.map((d) => d.signal_type));
  const staleTypes = (
    ["roth_conversion", "rmd_due", "tax_loss_harvest", "beneficiary_mismatch"] as SignalType[]
  ).filter((t) => !emittedTypes.has(t));
  if (staleTypes.length > 0) {
    await supabaseAdmin
      .from("planning_signals")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("contact_id", contactId)
      .in("signal_type", staleTypes);
  }

  return drafts;
}

export async function runPlanningForWorkspace(
  workspaceId: string,
  trigger: "cron" | "manual" | "contact" = "cron",
  triggeredBy?: string,
): Promise<{ runId: string; contactCount: number; signalCount: number; errors: number }> {
  const { data: run } = await supabaseAdmin
    .from("planning_runs")
    .insert({
      workspace_id: workspaceId,
      trigger,
      triggered_by: triggeredBy || null,
    })
    .select("id")
    .single();
  const runId = (run as any)?.id as string;

  const { data: contacts } = await supabaseAdmin
    .from("contacts")
    .select("id")
    .eq("workspace_id", workspaceId);

  let signalCount = 0;
  let errors = 0;
  for (const c of contacts || []) {
    try {
      const drafts = await runPlanningForContact(
        workspaceId,
        (c as any).id,
        runId,
      );
      signalCount += drafts.length;
    } catch (err) {
      errors += 1;
      console.error("[planning] contact run failed:", err);
    }
  }

  await supabaseAdmin
    .from("planning_runs")
    .update({
      contact_count: contacts?.length || 0,
      signal_count: signalCount,
      errors_count: errors,
      completed_at: new Date().toISOString(),
    })
    .eq("id", runId);

  return {
    runId,
    contactCount: contacts?.length || 0,
    signalCount,
    errors,
  };
}
