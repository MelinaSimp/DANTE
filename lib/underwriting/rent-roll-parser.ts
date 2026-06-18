// lib/underwriting/rent-roll-parser.ts
//
// Heuristic rent-roll parser. Takes a spreadsheet (XLSX/XLS/CSV)
// buffer and extracts a structured tenant schedule plus the
// aggregates an underwriting model needs: total SF, occupied SF,
// occupancy, and total annual base rent.
//
// Real rent rolls have no fixed schema — column names, header
// position, and rent basis (monthly vs annual vs PSF) all vary. We
// detect the header row by synonym density, map columns by synonym
// match, and record the source row for every tenant so each figure
// is traceable. The derived income figure is a *suggested default*:
// the underwriter screen lets the analyst override it.

import * as XLSX from "xlsx";

export interface TenantRow {
  /** 1-based row number in the source sheet (provenance). */
  sourceRow: number;
  tenant: string | null;
  suite: string | null;
  sf: number | null;
  annualRent: number | null;
  leaseStart: string | null;
  leaseEnd: string | null;
  isVacant: boolean;
}

export interface RentRollTotals {
  totalSf: number;
  occupiedSf: number;
  vacantSf: number;
  totalAnnualRent: number;
  occupancyPct: number;
  tenantCount: number;
  vacantCount: number;
}

export type RentBasis = "annual" | "monthly" | "psf" | "generic-annual";

export interface RentRollProvenance {
  sheetName: string;
  headerRow: number; // 1-based
  dataRowStart: number | null; // 1-based
  dataRowEnd: number | null; // 1-based
  columns: Record<string, string>; // field -> source column letter
  detectedRentBasis: RentBasis;
}

export interface ParsedRentRoll {
  ok: boolean;
  sheetName: string;
  tenants: TenantRow[];
  totals: RentRollTotals;
  detectedRentBasis: RentBasis;
  columnMap: Record<string, string>; // field -> source header text
  provenance: RentRollProvenance;
  warnings: string[];
  error?: string;
}

// ── Column synonyms ──────────────────────────────────────────────

const SYNONYMS: Record<string, string[]> = {
  tenant: ["tenant", "lessee", "occupant", "tenant name", "company", "business name", "tenant/lessee"],
  suite: ["suite", "unit", "space", "suite/unit", "unit #", "suite #", "bay", "suite no", "unit no"],
  sf: ["sf", "sq ft", "sqft", "square feet", "square footage", "rentable sf", "rsf", "gla", "area", "size", "leased sf", "rentable area", "rentable square feet"],
  annualRent: ["annual rent", "annual base rent", "yearly rent", "rent/year", "total annual rent", "annual rent ($)", "base rent annual", "annual base"],
  monthlyRent: ["monthly rent", "monthly base rent", "rent/mo", "monthly", "rent per month", "monthly rent ($)", "base rent monthly", "monthly base"],
  rentPsf: ["rent psf", "$/sf", "rate", "rent/sf", "psf", "annual psf", "base rent psf", "rent per sf", "$ psf", "rent rate"],
  baseRent: ["base rent", "rent", "current rent", "in-place rent", "contract rent"],
  status: ["status", "occupancy", "vacant", "occupied", "occupancy status"],
  leaseStart: ["lease start", "commencement", "start date", "commence", "lease from", "start", "commencement date"],
  leaseEnd: ["lease end", "expiration", "end date", "expiry", "lease to", "lease expiration", "exp date", "expiration date", "end"],
};

const ALL_SYNONYMS = new Set<string>(Object.values(SYNONYMS).flat());

const TOTAL_KEYWORDS = ["total", "subtotal", "grand total", "totals", "sum", "average", "weighted average"];
const VACANT_KEYWORDS = ["vacant", "available", "vacancy", "empty", "unoccupied"];

// ── Helpers ──────────────────────────────────────────────────────

function norm(v: unknown): string {
  return String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Parse a spreadsheet cell into a number, tolerating $, commas, %, and (parens) negatives. */
function toNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[$,\s]/g, "").replace(/%$/, "");
  if (s === "" || s === "-" || s === "--") return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

function matchField(headerText: string): string | null {
  const h = norm(headerText);
  if (!h) return null;
  // Exact match first, then contains. Check more-specific fields before
  // the generic baseRent so "annual rent" doesn't get grabbed as "rent".
  const order = ["annualRent", "monthlyRent", "rentPsf", "sf", "suite", "tenant", "status", "leaseStart", "leaseEnd", "baseRent"];
  for (const field of order) {
    for (const syn of SYNONYMS[field]) {
      if (h === syn) return field;
    }
  }
  for (const field of order) {
    for (const syn of SYNONYMS[field]) {
      if (h.includes(syn)) return field;
    }
  }
  return null;
}

function looksLikeTotalRow(cells: unknown[]): boolean {
  const joined = cells.map(norm).join(" ");
  return TOTAL_KEYWORDS.some((k) => joined.startsWith(k) || joined.includes(` ${k} `));
}

// ── Header detection ─────────────────────────────────────────────

/** Score a row by how many cells look like known column headers. */
function headerScore(cells: unknown[]): number {
  let score = 0;
  for (const c of cells) {
    const h = norm(c);
    if (!h) continue;
    if (ALL_SYNONYMS.has(h)) {
      score += 2;
    } else if ([...ALL_SYNONYMS].some((syn) => h.includes(syn))) {
      score += 1;
    }
  }
  return score;
}

// ── Main parse ───────────────────────────────────────────────────

export function parseRentRoll(buffer: Buffer | ArrayBuffer): ParsedRentRoll {
  const warnings: string[] = [];

  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  } catch {
    return emptyResult("Could not read the file. Provide an .xlsx, .xls, or .csv rent roll.");
  }

  const sheetName = wb.SheetNames[0];
  if (!sheetName) return emptyResult("The workbook has no sheets.");
  const sheet = wb.Sheets[sheetName];
  // Keep blank rows so a grid index maps to the true spreadsheet row —
  // provenance ("row N") must point at the actual line in the file.
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: true, defval: null });

  if (!grid.length) return emptyResult("The first sheet is empty.");

  // Find the header row: highest synonym score within the first 20 rows.
  let headerIdx = -1;
  let bestScore = 0;
  const scanLimit = Math.min(grid.length, 20);
  for (let r = 0; r < scanLimit; r++) {
    const s = headerScore(grid[r]);
    if (s > bestScore) {
      bestScore = s;
      headerIdx = r;
    }
  }
  if (headerIdx === -1 || bestScore < 2) {
    return emptyResult(
      "Could not locate a rent-roll header row. Expected columns like Tenant, SF, and Rent. You can still enter income manually.",
      sheetName,
    );
  }

  // Map columns.
  const headerCells = grid[headerIdx];
  const colIndex: Record<string, number> = {};
  const columnMap: Record<string, string> = {};
  const columnLetters: Record<string, string> = {};
  for (let c = 0; c < headerCells.length; c++) {
    const field = matchField(String(headerCells[c] ?? ""));
    if (field && colIndex[field] === undefined) {
      colIndex[field] = c;
      columnMap[field] = String(headerCells[c]).trim();
      columnLetters[field] = XLSX.utils.encode_col(c);
    }
  }

  // Determine rent basis.
  let detectedRentBasis: RentBasis;
  if (colIndex.annualRent !== undefined) detectedRentBasis = "annual";
  else if (colIndex.monthlyRent !== undefined) detectedRentBasis = "monthly";
  else if (colIndex.rentPsf !== undefined) detectedRentBasis = "psf";
  else detectedRentBasis = "generic-annual";

  if (detectedRentBasis === "generic-annual" && colIndex.baseRent !== undefined) {
    warnings.push(
      `A generic rent column ("${columnMap.baseRent}") was found; it is being read as annual base rent. Verify the basis (monthly vs annual) and adjust Gross Potential Rent if needed.`,
    );
  }

  const getCell = (row: unknown[], field: string): unknown =>
    colIndex[field] !== undefined ? row[colIndex[field]] : undefined;

  // Walk data rows.
  const tenants: TenantRow[] = [];
  let dataRowStart: number | null = null;
  let dataRowEnd: number | null = null;

  for (let r = headerIdx + 1; r < grid.length; r++) {
    const row = grid[r];
    if (!row || row.every((c) => c == null || String(c).trim() === "")) continue;
    if (looksLikeTotalRow(row)) continue;

    const tenantRaw = getCell(row, "tenant");
    const tenant = tenantRaw != null && String(tenantRaw).trim() !== "" ? String(tenantRaw).trim() : null;
    const suiteRaw = getCell(row, "suite");
    const suite = suiteRaw != null && String(suiteRaw).trim() !== "" ? String(suiteRaw).trim() : null;
    const sf = toNumber(getCell(row, "sf"));

    // Derive annual rent from the best available column.
    let annualRent: number | null = null;
    if (colIndex.annualRent !== undefined) {
      annualRent = toNumber(getCell(row, "annualRent"));
    } else if (colIndex.monthlyRent !== undefined) {
      const m = toNumber(getCell(row, "monthlyRent"));
      annualRent = m != null ? round2(m * 12) : null;
    } else if (colIndex.rentPsf !== undefined && sf != null) {
      const psf = toNumber(getCell(row, "rentPsf"));
      annualRent = psf != null ? round2(psf * sf) : null;
    } else if (colIndex.baseRent !== undefined) {
      annualRent = toNumber(getCell(row, "baseRent"));
    }

    // A row must carry at least one signal to count as a tenant line.
    if (tenant == null && sf == null && annualRent == null && suite == null) continue;

    // Vacancy detection.
    const statusText = norm(getCell(row, "status")) + " " + norm(tenantRaw);
    const isVacant =
      VACANT_KEYWORDS.some((k) => statusText.includes(k)) ||
      (tenant == null && sf != null && (annualRent == null || annualRent === 0));

    const leaseStart = cellToDateString(getCell(row, "leaseStart"));
    const leaseEnd = cellToDateString(getCell(row, "leaseEnd"));

    tenants.push({
      sourceRow: r + 1,
      tenant: isVacant && tenant == null ? "Vacant" : tenant,
      suite,
      sf,
      annualRent: isVacant ? (annualRent ?? 0) : annualRent,
      leaseStart,
      leaseEnd,
      isVacant,
    });
    if (dataRowStart == null) dataRowStart = r + 1;
    dataRowEnd = r + 1;
  }

  if (tenants.length === 0) {
    return {
      ...emptyResult("No tenant rows were found below the header.", sheetName),
      columnMap,
      detectedRentBasis,
    };
  }

  // Aggregates.
  let totalSf = 0;
  let occupiedSf = 0;
  let totalAnnualRent = 0;
  let vacantCount = 0;
  for (const t of tenants) {
    if (t.sf != null) totalSf += t.sf;
    if (t.isVacant) {
      vacantCount += 1;
    } else {
      if (t.sf != null) occupiedSf += t.sf;
      if (t.annualRent != null) totalAnnualRent += t.annualRent;
    }
  }
  const vacantSf = round2(totalSf - occupiedSf);
  const occupancyPct = totalSf > 0 ? round4(occupiedSf / totalSf) : 0;

  if (totalSf === 0) warnings.push("No square footage column was detected; value-per-SF will not be meaningful.");
  if (totalAnnualRent === 0) warnings.push("No rent could be derived; enter Gross Potential Rent manually.");

  return {
    ok: true,
    sheetName,
    tenants,
    totals: {
      totalSf: round2(totalSf),
      occupiedSf: round2(occupiedSf),
      vacantSf,
      totalAnnualRent: round2(totalAnnualRent),
      occupancyPct,
      tenantCount: tenants.length - vacantCount,
      vacantCount,
    },
    detectedRentBasis,
    columnMap,
    provenance: {
      sheetName,
      headerRow: headerIdx + 1,
      dataRowStart,
      dataRowEnd,
      columns: columnLetters,
      detectedRentBasis,
    },
    warnings,
  };
}

/**
 * Build provenance strings for the model inputs derived from a rent
 * roll, keyed by DCFInput field path. Fed into the workbook's
 * "Model Sources" tab.
 */
export function rentRollSourceStrings(
  parsed: ParsedRentRoll,
  fileName: string,
): Record<string, string> {
  const p = parsed.provenance;
  const where = `${fileName} — sheet "${p.sheetName}"`;
  const rowSpan =
    p.dataRowStart != null && p.dataRowEnd != null ? `rows ${p.dataRowStart}-${p.dataRowEnd}` : "data rows";
  const out: Record<string, string> = {};
  if (parsed.totals.totalSf > 0 && p.columns.sf) {
    out["property.sf"] = `${where}, sum of column ${p.columns.sf} (${rowSpan})`;
  }
  if (parsed.totals.totalAnnualRent > 0) {
    const basisNote =
      parsed.detectedRentBasis === "monthly"
        ? "monthly rent x 12"
        : parsed.detectedRentBasis === "psf"
          ? "rent PSF x SF"
          : "annual rent";
    out["income.gross_potential_rent"] =
      `${where}, ${basisNote} across ${parsed.totals.tenantCount} occupied tenant rows (${rowSpan})`;
  }
  return out;
}

// ── small utils ──────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function cellToDateString(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    return v.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  return s || null;
}

function emptyResult(error: string, sheetName = ""): ParsedRentRoll {
  return {
    ok: false,
    sheetName,
    tenants: [],
    totals: {
      totalSf: 0,
      occupiedSf: 0,
      vacantSf: 0,
      totalAnnualRent: 0,
      occupancyPct: 0,
      tenantCount: 0,
      vacantCount: 0,
    },
    detectedRentBasis: "generic-annual",
    columnMap: {},
    provenance: {
      sheetName,
      headerRow: 0,
      dataRowStart: null,
      dataRowEnd: null,
      columns: {},
      detectedRentBasis: "generic-annual",
    },
    warnings: [],
    error,
  };
}
