// lib/dante/calculators/rmd.ts
//
// Required Minimum Distribution calculator. Deterministic Python-
// equivalent math, runs in milliseconds, returns a structured
// result the agent can quote with confidence — every output line
// includes a citation to the controlling IRS publication or rule.
//
// Why this exists: the panel-III synthesis of the Harvey 2026 deep
// dive landed on a single sharpest pitch line — "Harvey explicitly
// says it does not perform calculations; we do the math." Mira's
// YC framing depends on that being a real product capability, not
// a slide. RMD calculation is the canonical test case: it's
// rule-based, the IRS publishes the tables, edge cases (inherited
// IRA, EDB, sole-spouse beneficiary >10y younger) are well-defined,
// and getting it wrong has real fiduciary consequences.
//
// Source authority for everything in this file:
//   • IRS Publication 590-B (2024 rev.) — Distributions From
//     Individual Retirement Arrangements (IRAs)
//   • Treas. Reg. §1.401(a)(9)
//   • SECURE Act 1.0 (2019), SECURE 2.0 Act (2022)
//   • IRC §401(a)(9), §408(a)(6), §403(b)(10)
//
// What this calculator covers:
//   • Lifetime RMDs from traditional IRAs, SEP-IRAs, SIMPLE IRAs,
//     401(k)/403(b)/457(b) plans (post-tax-deferred only)
//   • Three life-expectancy tables: Uniform Lifetime, Joint and
//     Last Survivor (sole-spouse-beneficiary >10y younger),
//     Single Life
//   • SECURE-Act-compliant RMD age (73 from 2023; 75 from 2033)
//   • Inherited IRA: 10-year rule for non-Eligible Designated
//     Beneficiaries; life-expectancy stretch for EDBs
//   • Year-of-death RMD rule (decedent's RMD if not yet taken)
//
// What this calculator does NOT cover (yet):
//   • Roth IRA RMDs (none required during owner's lifetime; Roth
//     401(k) RMDs eliminated by SECURE 2.0 starting 2024)
//   • Aggregation rules across multiple IRAs vs. 401(k)s (different
//     aggregation: IRAs aggregate, 401(k)s do NOT)
//   • Required Beginning Date (RBD) edge cases for still-working
//     participants in their employer's plan
//   • Penalty calculations for missed RMDs (50% pre-2023, reduced
//     to 25% / 10% by SECURE 2.0)
//
// Those are session-2 work. This file is the foundation.

import { UNIFORM_LIFETIME_TABLE } from "./irs-tables/uniform-lifetime";
import { SINGLE_LIFE_TABLE } from "./irs-tables/single-life";
import { JOINT_LAST_SURVIVOR_TABLE } from "./irs-tables/joint-last-survivor";

export type AccountKind =
  | "traditional_ira"
  | "sep_ira"
  | "simple_ira"
  | "401k"
  | "403b"
  | "457b"
  | "inherited_ira_edb"     // Eligible Designated Beneficiary — life-expectancy stretch
  | "inherited_ira_non_edb"; // Non-EDB — 10-year rule

export type BeneficiaryKind =
  | "spouse_sole"            // sole spouse beneficiary
  | "spouse_sole_younger_10" // sole spouse beneficiary >10y younger (Joint & Last Survivor table)
  | "non_spouse"
  | "trust"
  | "estate"
  | "none";                  // no living designated beneficiary

export interface RmdInput {
  /** Account holder's date of birth (or decedent's, for inherited). */
  date_of_birth: string;     // YYYY-MM-DD
  /** Tax year for which we're computing the RMD. */
  tax_year: number;
  /** Prior-year December 31 balance, in dollars. */
  prior_year_end_balance: number;
  /** Account type — drives RBD and aggregation rules. */
  account_kind: AccountKind;
  /** Optional — drives table selection for sole-spouse-beneficiary
   *  >10y younger case. */
  beneficiary_kind?: BeneficiaryKind;
  /** Required when beneficiary_kind = spouse_sole_younger_10 — the
   *  spouse's date of birth, used to look up Joint & Last Survivor. */
  spouse_date_of_birth?: string;
  /** Inherited-IRA cases: date of original owner's death. Drives
   *  the 10-year clock + first-year fixed life expectancy. */
  decedent_date_of_death?: string;
  /** Inherited-IRA cases: original owner's date of birth — needed
   *  if the decedent had reached RBD (different rules apply). */
  decedent_date_of_birth?: string;
}

export interface RmdResult {
  /** The required distribution amount, rounded to cents. */
  required_amount: number;
  /** Which table was used and at what age. */
  table_name: "uniform_lifetime" | "joint_last_survivor" | "single_life";
  age_used: number;
  divisor: number;
  /** Whether the holder has actually reached RBD this tax year. */
  required_this_year: boolean;
  /** Sentence-form explanation the agent can quote. */
  explanation: string;
  /** Inline citations the agent should attribute claims to. */
  citations: RmdCitation[];
  /** Edge cases / caveats the user should be aware of. */
  caveats: string[];
}

export interface RmdCitation {
  /** Short label the renderer can show, e.g. "IRS Pub 590-B". */
  label: string;
  /** Section / paragraph reference. */
  section?: string;
  /** Canonical URL on irs.gov when available. */
  url?: string;
}

const PUB_590B: RmdCitation = {
  label: "IRS Publication 590-B",
  section: "Required Minimum Distributions",
  url: "https://www.irs.gov/publications/p590b",
};
const TREAS_REG_401_a_9: RmdCitation = {
  label: "Treas. Reg. §1.401(a)(9)",
  url: "https://www.ecfr.gov/current/title-26/chapter-I/subchapter-A/part-1/subject-group-ECFRf04bd1f47ee48f5/section-1.401(a)(9)-9",
};
const SECURE_ACT_2_0: RmdCitation = {
  label: "SECURE 2.0 Act of 2022 § 107",
  section: "RMD age increase",
  url: "https://www.congress.gov/bill/117th-congress/house-bill/2617",
};

// Age at which RMDs are required to begin. SECURE Act 1.0 raised
// from 70½ → 72; SECURE 2.0 raised again to 73 starting 2023, then
// 75 starting 2033.
function rmdStartAge(taxYear: number): number {
  if (taxYear >= 2033) return 75;
  if (taxYear >= 2023) return 73;
  if (taxYear >= 2020) return 72;
  return 70; // pre-SECURE — 70½ rounded down for our purposes
}

function ageInYear(dob: string, year: number): number {
  // Age the holder ATTAINS during the year (RMD calc uses end-of-
  // year age, per Treas. Reg. §1.401(a)(9)-5, A-3).
  const birth = new Date(dob);
  return year - birth.getFullYear();
}

/**
 * Look up the divisor for the appropriate IRS life-expectancy
 * table. Throws if the table doesn't have an entry — caller
 * surfaces that as an error rather than silently using a wrong
 * value.
 */
function divisorFor(
  table: "uniform_lifetime" | "joint_last_survivor" | "single_life",
  age: number,
  spouseAge?: number,
): number {
  if (table === "uniform_lifetime") {
    const v = UNIFORM_LIFETIME_TABLE[age];
    if (v == null) {
      throw new Error(
        `RMD: no Uniform Lifetime divisor for age ${age} (table covers 72-120)`,
      );
    }
    return v;
  }
  if (table === "single_life") {
    const v = SINGLE_LIFE_TABLE[age];
    if (v == null) {
      throw new Error(`RMD: no Single Life divisor for age ${age}`);
    }
    return v;
  }
  // joint_last_survivor: keyed on (owner_age, spouse_age)
  if (spouseAge == null) {
    throw new Error("RMD: Joint & Last Survivor requires spouse age");
  }
  const row = JOINT_LAST_SURVIVOR_TABLE[age];
  const v = row?.[spouseAge];
  if (v == null) {
    throw new Error(
      `RMD: no Joint & Last Survivor divisor for owner age ${age}, spouse age ${spouseAge}`,
    );
  }
  return v;
}

export function calculateRmd(input: RmdInput): RmdResult {
  const caveats: string[] = [];
  const citations: RmdCitation[] = [PUB_590B, TREAS_REG_401_a_9];

  // Inherited IRAs follow a different ruleset entirely.
  if (input.account_kind === "inherited_ira_non_edb") {
    return rmdInheritedNonEdb(input, citations);
  }
  if (input.account_kind === "inherited_ira_edb") {
    return rmdInheritedEdb(input, citations);
  }

  // Lifetime RMDs (traditional IRA, SEP, SIMPLE, 401(k), 403(b), 457(b)).
  const startAge = rmdStartAge(input.tax_year);
  const age = ageInYear(input.date_of_birth, input.tax_year);

  if (age < startAge) {
    return {
      required_amount: 0,
      table_name: "uniform_lifetime",
      age_used: age,
      divisor: 0,
      required_this_year: false,
      explanation: `No RMD required for ${input.tax_year}. The holder turns ${age} this year; the SECURE 2.0 RMD start age for tax years ${
        input.tax_year >= 2033 ? "2033 and later" : "2023-2032"
      } is ${startAge}.`,
      citations: [PUB_590B, SECURE_ACT_2_0],
      caveats: [],
    };
  }

  // Table selection. Joint & Last Survivor only when sole spouse
  // beneficiary AND >10 years younger than the holder.
  let table: "uniform_lifetime" | "joint_last_survivor" = "uniform_lifetime";
  let spouseAge: number | undefined = undefined;
  if (
    input.beneficiary_kind === "spouse_sole_younger_10" &&
    input.spouse_date_of_birth
  ) {
    spouseAge = ageInYear(input.spouse_date_of_birth, input.tax_year);
    if (age - spouseAge > 10) {
      table = "joint_last_survivor";
    } else {
      caveats.push(
        `Beneficiary is spouse but the 10-year age gap rule isn't met (owner ${age}, spouse ${spouseAge}). Joint & Last Survivor table doesn't apply; defaulting to Uniform Lifetime.`,
      );
    }
  }

  const divisor = divisorFor(table, age, spouseAge);
  const amount =
    Math.round((input.prior_year_end_balance / divisor) * 100) / 100;

  return {
    required_amount: amount,
    table_name: table,
    age_used: age,
    divisor,
    required_this_year: true,
    explanation: `RMD for ${input.tax_year}: $${amount.toFixed(
      2,
    )} = $${input.prior_year_end_balance.toFixed(2)} ÷ ${divisor.toFixed(1)} (${
      table === "joint_last_survivor"
        ? `Joint & Last Survivor table, owner age ${age} / spouse age ${spouseAge}`
        : `Uniform Lifetime table, age ${age}`
    }).`,
    citations,
    caveats,
  };
}

/**
 * Non-EDB inherited IRA — the 10-year rule under SECURE Act 1.0.
 * Account must be fully distributed by Dec 31 of the 10th year
 * after the original owner's death. Annual RMDs may also be
 * required during years 1-9 if the decedent had reached their RBD
 * before death (per the IRS proposed regs in 2022 and finalized in
 * 2024).
 */
function rmdInheritedNonEdb(
  input: RmdInput,
  citations: RmdCitation[],
): RmdResult {
  const caveats: string[] = [];
  if (!input.decedent_date_of_death) {
    throw new Error("RMD: inherited_ira_non_edb requires decedent_date_of_death");
  }
  const death = new Date(input.decedent_date_of_death);
  const tenthYearEnd = new Date(death.getFullYear() + 10, 11, 31);

  caveats.push(
    `Account must be fully distributed by ${tenthYearEnd.toISOString().slice(0, 10)} (Dec 31 of the 10th year after death) under the SECURE Act 10-year rule.`,
  );

  // Determine if decedent had reached RBD. If yes, annual RMDs may
  // be required during years 1-9 of the 10-year window (per the
  // 2024 final regulations under §401(a)(9)).
  let annualRmdRequired = false;
  if (input.decedent_date_of_birth) {
    const decedentAgeAtDeath =
      death.getFullYear() - new Date(input.decedent_date_of_birth).getFullYear();
    const decedentRbdAge = rmdStartAge(death.getFullYear());
    if (decedentAgeAtDeath >= decedentRbdAge) {
      annualRmdRequired = true;
      caveats.push(
        `Decedent had reached their Required Beginning Date (age ${decedentRbdAge}) before death, so annual RMDs are required in years 1-9 of the 10-year window in addition to the year-10 full distribution. (Treas. Reg. §1.401(a)(9)-5, finalized 2024.)`,
      );
    } else {
      caveats.push(
        `Decedent had NOT reached their Required Beginning Date before death — no annual RMDs required during years 1-9. The full balance must be distributed by year 10.`,
      );
    }
  } else {
    caveats.push(
      `decedent_date_of_birth not provided — cannot determine whether annual RMDs are required during years 1-9 of the 10-year window. Provide decedent_date_of_birth to compute precisely.`,
    );
  }

  return {
    required_amount: annualRmdRequired ? -1 : 0, // -1 = "computed annually using Single Life table; not a single number from this call"
    table_name: "single_life",
    age_used: 0,
    divisor: 0,
    required_this_year: annualRmdRequired,
    explanation: annualRmdRequired
      ? `This is an inherited IRA subject to the 10-year rule (non-EDB beneficiary). The decedent had reached RBD before death, so annual RMDs are required during years 1-9 (use Single Life table, beneficiary's age). Plus the account must be fully distributed by Dec 31 of year 10.`
      : `This is an inherited IRA subject to the 10-year rule (non-EDB beneficiary). The decedent had not reached RBD before death, so no annual RMDs are required during years 1-9 — only the full distribution by Dec 31 of year 10.`,
    citations,
    caveats,
  };
}

/**
 * EDB inherited IRA — Eligible Designated Beneficiary stretch.
 * Five categories qualify: surviving spouse, minor child of
 * decedent (until age 21), disabled, chronically ill, or person
 * not more than 10 years younger than decedent. Beneficiary uses
 * the Single Life table with their own age in year 1, then
 * subtracts 1 for each subsequent year.
 */
function rmdInheritedEdb(
  input: RmdInput,
  citations: RmdCitation[],
): RmdResult {
  const caveats: string[] = [];
  if (!input.decedent_date_of_death) {
    throw new Error("RMD: inherited_ira_edb requires decedent_date_of_death");
  }

  const beneficiaryAge = ageInYear(input.date_of_birth, input.tax_year);
  const death = new Date(input.decedent_date_of_death);
  const yearsSinceDeath = input.tax_year - death.getFullYear();

  // First year: actual Single Life divisor for beneficiary's age in
  // the year after death. Subsequent years: subtract 1 each year.
  if (yearsSinceDeath < 1) {
    caveats.push(
      `Year-of-death RMD: if the decedent had not yet taken their full RMD for ${death.getFullYear()}, the beneficiary must take any remaining amount by Dec 31, ${death.getFullYear()}. That's separate from the EDB life-expectancy distribution starting next year.`,
    );
    return {
      required_amount: 0,
      table_name: "single_life",
      age_used: beneficiaryAge,
      divisor: 0,
      required_this_year: false,
      explanation: `Beneficiary RMDs begin in the year after death (${death.getFullYear() + 1}).`,
      citations,
      caveats,
    };
  }

  const ageAtFirstRmd =
    ageInYear(input.date_of_birth, death.getFullYear() + 1);
  const baseDivisor = SINGLE_LIFE_TABLE[ageAtFirstRmd];
  if (baseDivisor == null) {
    throw new Error(
      `RMD: no Single Life divisor for beneficiary age ${ageAtFirstRmd}`,
    );
  }
  const divisor = baseDivisor - (yearsSinceDeath - 1);
  if (divisor <= 0) {
    caveats.push(
      `Computed divisor is ≤ 0 — life expectancy exhausted. Account should have been fully distributed by now; consult tax counsel.`,
    );
    return {
      required_amount: input.prior_year_end_balance,
      table_name: "single_life",
      age_used: beneficiaryAge,
      divisor: 0,
      required_this_year: true,
      explanation: `Life expectancy exhausted under the Single Life table. The remaining balance is the RMD.`,
      citations,
      caveats,
    };
  }

  const amount =
    Math.round((input.prior_year_end_balance / divisor) * 100) / 100;
  return {
    required_amount: amount,
    table_name: "single_life",
    age_used: beneficiaryAge,
    divisor,
    required_this_year: true,
    explanation: `Inherited IRA EDB stretch RMD for ${
      input.tax_year
    }: $${amount.toFixed(2)} = $${input.prior_year_end_balance.toFixed(
      2,
    )} ÷ ${divisor.toFixed(
      1,
    )} (Single Life table, beneficiary age ${ageAtFirstRmd} at first RMD year, minus ${yearsSinceDeath - 1} for elapsed years).`,
    citations,
    caveats,
  };
}
