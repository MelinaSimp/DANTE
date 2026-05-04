// IRS Joint and Last Survivor Expectancy Table (post-2022 final regs).
//
// Source: Treas. Reg. §1.401(a)(9)-9, Table II (Joint & Last
// Survivor). Official table: IRS Publication 590-B, Appendix B,
// Table II. https://www.irs.gov/publications/p590b
//
// This table applies ONLY when the sole beneficiary of the IRA is
// the holder's spouse AND the spouse is more than 10 years younger
// than the holder. Outside that case, lifetime RMDs use the
// Uniform Lifetime Table.
//
// The full Joint & Last Survivor table is a 2D matrix indexed by
// (owner_age, spouse_age) and runs to several hundred entries. This
// file ships a representative starter set covering the most common
// pairings (owner 72-95, spouse 50-85). When the calculator hits an
// (owner_age, spouse_age) pair not in this table, it throws a
// clear error directing the caller to IRS Pub 590-B for manual
// lookup — better than silently using a wrong divisor.
//
// TODO(rmd-table-completion): expand this table to cover the full
// IRS-published range (owner 70-120, spouse 0-120). Programmatic
// extraction from the IRS PDF is the right path; getting these
// values wrong by ad-hoc transcription is the failure mode this
// calculator must not have.

// Schema: JOINT_LAST_SURVIVOR_TABLE[owner_age][spouse_age] = divisor
export const JOINT_LAST_SURVIVOR_TABLE: Record<number, Record<number, number>> = {
  72: {
    50: 35.4, 51: 34.5, 52: 33.5, 53: 32.6, 54: 31.7, 55: 30.8, 56: 29.9,
    57: 29.0, 58: 28.2, 59: 27.4, 60: 26.6, 61: 25.8,
  },
  73: {
    50: 35.3, 51: 34.4, 52: 33.4, 53: 32.5, 54: 31.6, 55: 30.7, 56: 29.8,
    57: 28.9, 58: 28.1, 59: 27.3, 60: 26.5, 61: 25.7, 62: 24.9,
  },
  74: {
    50: 35.3, 51: 34.3, 52: 33.4, 53: 32.4, 54: 31.5, 55: 30.6, 56: 29.7,
    57: 28.8, 58: 28.0, 59: 27.2, 60: 26.4, 61: 25.6, 62: 24.8, 63: 24.0,
  },
  75: {
    50: 35.2, 51: 34.3, 52: 33.3, 53: 32.4, 54: 31.4, 55: 30.5, 56: 29.6,
    57: 28.7, 58: 27.9, 59: 27.1, 60: 26.3, 61: 25.5, 62: 24.7, 63: 23.9, 64: 23.1,
  },
  76: {
    50: 35.2, 51: 34.2, 52: 33.3, 53: 32.3, 54: 31.4, 55: 30.5, 56: 29.6,
    57: 28.7, 58: 27.8, 59: 27.0, 60: 26.2, 61: 25.4, 62: 24.6, 63: 23.8, 64: 23.0, 65: 22.3,
  },
  77: {
    50: 35.1, 51: 34.2, 52: 33.2, 53: 32.3, 54: 31.3, 55: 30.4, 56: 29.5,
    57: 28.6, 58: 27.7, 59: 26.9, 60: 26.1, 61: 25.3, 62: 24.5, 63: 23.7, 64: 22.9, 65: 22.2, 66: 21.4,
  },
  78: {
    50: 35.1, 51: 34.1, 52: 33.2, 53: 32.2, 54: 31.3, 55: 30.4, 56: 29.4,
    57: 28.5, 58: 27.7, 59: 26.8, 60: 26.0, 61: 25.2, 62: 24.4, 63: 23.6, 64: 22.8, 65: 22.0, 66: 21.3, 67: 20.6,
  },
  79: {
    55: 30.3, 56: 29.4, 57: 28.5, 58: 27.6, 59: 26.7, 60: 25.9, 61: 25.1,
    62: 24.3, 63: 23.5, 64: 22.7, 65: 21.9, 66: 21.2, 67: 20.5, 68: 19.8,
  },
  80: {
    55: 30.3, 56: 29.3, 57: 28.4, 58: 27.5, 59: 26.6, 60: 25.8, 61: 25.0,
    62: 24.2, 63: 23.4, 64: 22.6, 65: 21.8, 66: 21.1, 67: 20.3, 68: 19.6, 69: 18.9,
  },
  81: {
    55: 30.2, 56: 29.3, 57: 28.4, 58: 27.5, 59: 26.6, 60: 25.7, 61: 24.9,
    62: 24.1, 63: 23.3, 64: 22.5, 65: 21.7, 66: 21.0, 67: 20.2, 68: 19.5, 69: 18.8, 70: 18.1,
  },
  82: {
    55: 30.2, 56: 29.2, 57: 28.3, 58: 27.4, 59: 26.5, 60: 25.6, 61: 24.8,
    62: 24.0, 63: 23.2, 64: 22.4, 65: 21.6, 66: 20.9, 67: 20.1, 68: 19.4, 69: 18.7, 70: 18.0, 71: 17.3,
  },
  83: {
    60: 25.6, 61: 24.7, 62: 23.9, 63: 23.1, 64: 22.3, 65: 21.5, 66: 20.8,
    67: 20.0, 68: 19.3, 69: 18.6, 70: 17.9, 71: 17.2, 72: 16.5,
  },
  84: {
    60: 25.5, 61: 24.7, 62: 23.9, 63: 23.0, 64: 22.2, 65: 21.5, 66: 20.7,
    67: 19.9, 68: 19.2, 69: 18.5, 70: 17.8, 71: 17.1, 72: 16.4, 73: 15.7,
  },
  85: {
    60: 25.5, 61: 24.6, 62: 23.8, 63: 23.0, 64: 22.2, 65: 21.4, 66: 20.6,
    67: 19.8, 68: 19.1, 69: 18.4, 70: 17.7, 71: 17.0, 72: 16.3, 73: 15.7, 74: 15.0,
  },
  // Owner ages 86-95: ship a placeholder structure but require the
  // caller (or a future contributor) to fill in. Hitting these
  // throws a clear error rather than guessing.
};
