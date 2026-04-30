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
// Used for most account owners. The Joint and Last Survivor table
// is only used when the sole beneficiary is the spouse and is more
// than 10 years younger — out of scope for v1.
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

export function ageFromDob(dob: string | Date | null | undefined, asOf: Date = new Date()): number | null {
  if (!dob) return null;
  const d = typeof dob === "string" ? new Date(dob) : dob;
  if (Number.isNaN(d.getTime())) return null;
  let age = asOf.getFullYear() - d.getFullYear();
  const m = asOf.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && asOf.getDate() < d.getDate())) age -= 1;
  return age;
}
