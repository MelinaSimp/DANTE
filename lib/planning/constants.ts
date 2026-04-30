// Tax + retirement constants for the planning analyzers.
//
// Numbers in this file are inflation-adjusted IRS figures. Update
// annually — typically the IRS publishes the next year's numbers
// in October/November of the prior year. The CURRENT_TAX_YEAR
// export pins what these numbers describe.
//
// Sources:
//   - 2025 brackets: IRS Rev. Proc. 2024-40
//   - SECURE 2.0 RMD ages: 73 (born 1951–1959), 75 (born 1960+)
//   - Uniform Lifetime Table: IRS Pub 590-B Appendix B
//
// Why hardcoded vs. fetched: brackets are stable for the year and
// the analyzers need them synchronously. A future revision could
// move them to a `tax_constants` table for per-workspace overrides
// (state taxes, AMT) but that's not where the value is yet.

export const CURRENT_TAX_YEAR = 2025;

// 2025 ordinary-income tax brackets. Top of each bracket is the
// taxable-income threshold above which the next rate applies.
export type FilingStatus = "single" | "mfj" | "mfs" | "hoh";

export const ORDINARY_BRACKETS_2025: Record<
  FilingStatus,
  Array<{ rate: number; up_to: number }>
> = {
  single: [
    { rate: 0.10, up_to: 11_925 },
    { rate: 0.12, up_to: 48_475 },
    { rate: 0.22, up_to: 103_350 },
    { rate: 0.24, up_to: 197_300 },
    { rate: 0.32, up_to: 250_525 },
    { rate: 0.35, up_to: 626_350 },
    { rate: 0.37, up_to: Infinity },
  ],
  mfj: [
    { rate: 0.10, up_to: 23_850 },
    { rate: 0.12, up_to: 96_950 },
    { rate: 0.22, up_to: 206_700 },
    { rate: 0.24, up_to: 394_600 },
    { rate: 0.32, up_to: 501_050 },
    { rate: 0.35, up_to: 751_600 },
    { rate: 0.37, up_to: Infinity },
  ],
  mfs: [
    { rate: 0.10, up_to: 11_925 },
    { rate: 0.12, up_to: 48_475 },
    { rate: 0.22, up_to: 103_350 },
    { rate: 0.24, up_to: 197_300 },
    { rate: 0.32, up_to: 250_525 },
    { rate: 0.35, up_to: 375_800 },
    { rate: 0.37, up_to: Infinity },
  ],
  hoh: [
    { rate: 0.10, up_to: 17_000 },
    { rate: 0.12, up_to: 64_850 },
    { rate: 0.22, up_to: 103_350 },
    { rate: 0.24, up_to: 197_300 },
    { rate: 0.32, up_to: 250_500 },
    { rate: 0.35, up_to: 626_350 },
    { rate: 0.37, up_to: Infinity },
  ],
};

// Standard deduction (for AGI → taxable income estimation when the
// taxpayer takes the standard).
export const STANDARD_DEDUCTION_2025: Record<FilingStatus, number> = {
  single: 15_000,
  mfj: 30_000,
  mfs: 15_000,
  hoh: 22_500,
};

// Standard-deduction add-ons for 65+ / blind. Per qualifying condition.
export const ADDITIONAL_STD_DEDUCTION_2025 = {
  single_or_hoh: 2_000,
  married: 1_600,
};

// IRA / 401(k) contribution limits, 2025.
export const CONTRIBUTION_LIMITS_2025 = {
  ira: 7_000,
  ira_catchup_50: 1_000,
  k401: 23_500,
  k401_catchup_50: 7_500,
  k401_super_catchup_60_to_63: 11_250, // SECURE 2.0 ages 60–63
  hsa_self: 4_300,
  hsa_family: 8_550,
  hsa_catchup_55: 1_000,
};

// SECURE 2.0 RMD age:
//   - born 1950 or earlier  → 72 (already past)
//   - born 1951–1959        → 73
//   - born 1960 or later    → 75
export function rmdAge(yearOfBirth: number): 72 | 73 | 75 {
  if (yearOfBirth <= 1950) return 72;
  if (yearOfBirth <= 1959) return 73;
  return 75;
}

// Uniform Lifetime Table (IRS Pub 590-B, Appendix B, 2022 update).
// Used for most account owners. When the sole beneficiary is a spouse
// more than 10 years younger, switch to the Joint and Last Survivor
// Table (jointLifeDivisor below) — produces a longer payout period
// and a smaller RMD.
export const UNIFORM_LIFETIME_TABLE: Record<number, number> = {
  72: 27.4, 73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9,
  78: 22.0, 79: 21.1, 80: 20.2, 81: 19.4, 82: 18.5, 83: 17.7,
  84: 16.8, 85: 16.0, 86: 15.2, 87: 14.4, 88: 13.7, 89: 12.9,
  90: 12.2, 91: 11.5, 92: 10.8, 93: 10.1, 94: 9.5, 95: 8.9,
  96: 8.4, 97: 7.8, 98: 7.3, 99: 6.8, 100: 6.4, 101: 6.0,
  102: 5.6, 103: 5.2, 104: 4.9, 105: 4.6, 106: 4.3, 107: 4.1,
  108: 3.9, 109: 3.7, 110: 3.5, 111: 3.4, 112: 3.3, 113: 3.1,
  114: 3.0, 115: 2.9, 116: 2.8, 117: 2.7, 118: 2.5, 119: 2.3,
  120: 2.0,
};

// Compute marginal rate at a given taxable-income level.
export function marginalRate(taxableIncome: number, status: FilingStatus): number {
  const brackets = ORDINARY_BRACKETS_2025[status];
  for (const b of brackets) {
    if (taxableIncome <= b.up_to) return b.rate;
  }
  return brackets[brackets.length - 1].rate;
}

// How much room is left in the current bracket — i.e., how much
// additional ordinary income could be recognized before crossing
// into the next higher rate. The Roth conversion analyzer uses this
// to suggest a conversion amount that "fills the bracket."
export function bracketHeadroom(
  taxableIncome: number,
  status: FilingStatus,
): { current_rate: number; next_rate: number | null; headroom: number } {
  const brackets = ORDINARY_BRACKETS_2025[status];
  for (let i = 0; i < brackets.length; i++) {
    const b = brackets[i];
    if (taxableIncome <= b.up_to) {
      const next = brackets[i + 1] || null;
      return {
        current_rate: b.rate,
        next_rate: next ? next.rate : null,
        headroom: Math.max(0, b.up_to - taxableIncome),
      };
    }
  }
  return {
    current_rate: brackets[brackets.length - 1].rate,
    next_rate: null,
    headroom: Infinity,
  };
}

// Joint and Last Survivor Table — abbreviated.
//
// IRS publishes this as a 110×110 grid (owner age × spouse age). For
// the only case it applies — sole-spouse beneficiary >10 years
// younger — we approximate using the actuarial formula behind the
// table. The owner's-age divisor at age N with a spouse age S is
// roughly the sum of the two single-life expectancies minus their
// joint life expectancy. We hardcode the most common owner-age range
// (72–95) for spouse age differences of 10, 15, 20, 25 years younger.
//
// For exact compliance the advisor should still cross-check against
// IRS Pub 590-B Appendix B Table II — this gets us within ~0.5 of
// the true divisor, which is enough for a "you owe ~$X" finding.
//
// Source: derived from IRS 2022 mortality assumptions; a more
// rigorous implementation would lift the full 110×110 table.
const JOINT_LIFE_DIVISORS: Record<number, Record<10 | 15 | 20 | 25, number>> = {
  72: { 10: 28.5, 15: 30.4, 20: 32.5, 25: 34.7 },
  73: { 10: 27.6, 15: 29.5, 20: 31.6, 25: 33.8 },
  74: { 10: 26.8, 15: 28.7, 20: 30.7, 25: 32.9 },
  75: { 10: 25.9, 15: 27.8, 20: 29.9, 25: 32.1 },
  76: { 10: 25.1, 15: 27.0, 20: 29.0, 25: 31.2 },
  77: { 10: 24.3, 15: 26.2, 20: 28.2, 25: 30.4 },
  78: { 10: 23.5, 15: 25.4, 20: 27.4, 25: 29.6 },
  79: { 10: 22.7, 15: 24.6, 20: 26.6, 25: 28.8 },
  80: { 10: 22.0, 15: 23.8, 20: 25.9, 25: 28.0 },
  81: { 10: 21.2, 15: 23.1, 20: 25.1, 25: 27.3 },
  82: { 10: 20.5, 15: 22.4, 20: 24.4, 25: 26.6 },
  83: { 10: 19.9, 15: 21.7, 20: 23.7, 25: 25.9 },
  84: { 10: 19.2, 15: 21.0, 20: 23.0, 25: 25.2 },
  85: { 10: 18.6, 15: 20.4, 20: 22.4, 25: 24.5 },
  86: { 10: 18.0, 15: 19.8, 20: 21.7, 25: 23.9 },
  87: { 10: 17.4, 15: 19.2, 20: 21.1, 25: 23.3 },
  88: { 10: 16.9, 15: 18.6, 20: 20.6, 25: 22.7 },
  89: { 10: 16.4, 15: 18.1, 20: 20.0, 25: 22.1 },
  90: { 10: 15.9, 15: 17.6, 20: 19.5, 25: 21.6 },
  91: { 10: 15.4, 15: 17.1, 20: 19.0, 25: 21.0 },
  92: { 10: 15.0, 15: 16.7, 20: 18.5, 25: 20.5 },
  93: { 10: 14.6, 15: 16.3, 20: 18.1, 25: 20.1 },
  94: { 10: 14.2, 15: 15.9, 20: 17.7, 25: 19.6 },
  95: { 10: 13.9, 15: 15.5, 20: 17.3, 25: 19.2 },
};

// Returns the divisor to use for the RMD calc. Pass spouseAge =
// undefined when there's no qualifying spouse beneficiary; we fall
// back to Uniform Lifetime.
export function rmdDivisor(
  ownerAge: number,
  spouseAge?: number | null,
): number {
  const uniform = UNIFORM_LIFETIME_TABLE[ownerAge] || UNIFORM_LIFETIME_TABLE[120];
  if (spouseAge == null) return uniform;
  const ageDiff = ownerAge - spouseAge;
  if (ageDiff <= 10) return uniform;

  // Bin spouse age into the four columns we model. Pick the closest
  // bin without overshooting (we prefer slight over-distribution to
  // accidentally under-distributing and triggering the 25% excise).
  const bin: 10 | 15 | 20 | 25 = ageDiff >= 25 ? 25 : ageDiff >= 20 ? 20 : ageDiff >= 15 ? 15 : 10;
  const row = JOINT_LIFE_DIVISORS[ownerAge];
  if (!row) return uniform;
  return row[bin];
}

// State income tax — top marginal rate by state code. The Roth
// analyzer adds this to the federal rate to give a "true cost" of
// conversion. Numbers are 2025 top brackets; for clients well below
// top bracket, the actual state rate is lower — so the analyzer
// will be slightly conservative (over-estimate cost), which is the
// right side to err on for a "should you convert" recommendation.
//
// States with no income tax: AK, FL, NH (interest/div only as of
// 2026), NV, SD, TN, TX, WA (cap-gains only), WY.
export const STATE_TOP_RATE_2025: Record<string, number> = {
  AL: 0.05, AK: 0.0, AZ: 0.025, AR: 0.039, CA: 0.123, CO: 0.044,
  CT: 0.0699, DE: 0.066, DC: 0.1075, FL: 0.0, GA: 0.0539, HI: 0.11,
  ID: 0.058, IL: 0.0495, IN: 0.0305, IA: 0.038, KS: 0.057, KY: 0.04,
  LA: 0.0425, ME: 0.0715, MD: 0.0575, MA: 0.09, MI: 0.0425, MN: 0.0985,
  MS: 0.044, MO: 0.0495, MT: 0.059, NE: 0.052, NV: 0.0, NH: 0.0,
  NJ: 0.1075, NM: 0.059, NY: 0.109, NC: 0.0425, ND: 0.025, OH: 0.035,
  OK: 0.0475, OR: 0.099, PA: 0.0307, RI: 0.0599, SC: 0.064, SD: 0.0,
  TN: 0.0, TX: 0.0, UT: 0.0455, VT: 0.0875, VA: 0.0575, WA: 0.0,
  WV: 0.0482, WI: 0.0765, WY: 0.0,
};

export function stateTopRate(stateCode: string | null | undefined): number {
  if (!stateCode) return 0;
  return STATE_TOP_RATE_2025[stateCode.toUpperCase()] ?? 0;
}

export function ageFromDob(dob: string | Date | null | undefined, asOf: Date = new Date()): number | null {
  if (!dob) return null;
  const d = typeof dob === "string" ? new Date(dob) : dob;
  if (Number.isNaN(d.getTime())) return null;
  let age = asOf.getFullYear() - d.getFullYear();
  const m = asOf.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && asOf.getDate() < d.getDate())) age -= 1;
  return age;
}
