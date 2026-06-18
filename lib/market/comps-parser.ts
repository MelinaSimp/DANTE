// lib/market/comps-parser.ts
//
// Parses a market-comparables export (CoStar / county / CSV) into
// structured comp records. Same heuristic approach as the rent-roll
// parser: detect the header row by synonym density, map columns by
// synonym match, parse rows, compute aggregates. Pure and
// dependency-light (XLSX only) so it's unit-testable. The user
// uploads data they're licensed to use — nothing is scraped.

import * as XLSX from "xlsx";

export interface Comp {
  sourceRow: number;
  address: string | null;
  city: string | null;
  state: string | null;
  propertyType: string | null;
  sf: number | null;
  salePrice: number | null;
  pricePerSf: number | null;
  capRate: number | null; // decimal (0.0625 = 6.25%)
  saleDate: string | null;
}

export interface CompsTotals {
  count: number;
  avgPricePerSf: number | null;
  medianPricePerSf: number | null;
  avgCapRate: number | null;
  avgSalePrice: number | null;
}

export interface ParsedComps {
  ok: boolean;
  sheetName: string;
  comps: Comp[];
  totals: CompsTotals;
  columnMap: Record<string, string>;
  warnings: string[];
  error?: string;
}

const SYNONYMS: Record<string, string[]> = {
  address: ["address", "property address", "location", "property", "property name", "street", "site address"],
  city: ["city", "municipality", "town"],
  state: ["state", "st", "province"],
  propertyType: ["property type", "type", "asset type", "use", "product type", "building type"],
  sf: ["sf", "sq ft", "sqft", "square feet", "building sf", "rentable sf", "rba", "gla", "size", "building size", "nra"],
  salePrice: ["sale price", "sales price", "price", "sold price", "transaction price", "sale amount", "consideration"],
  pricePerSf: ["price/sf", "$/sf", "price psf", "ppsf", "sale price/sf", "price per sf", "$ per sf", "psf"],
  capRate: ["cap rate", "cap", "going-in cap", "going in cap rate", "cap rate %", "yield"],
  saleDate: ["sale date", "date", "close date", "closing date", "transaction date", "sold date", "date sold", "recording date"],
};

const ALL_SYNONYMS = new Set<string>(Object.values(SYNONYMS).flat());
const TOTAL_KEYWORDS = ["total", "subtotal", "average", "median", "summary", "count"];

function norm(v: unknown): string {
  return String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function toNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[$,\s]/g, "").replace(/%$/, "");
  if (s === "" || s === "-" || s === "--") return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

/** Normalize a cap-rate cell to a decimal: "6.25%" -> 0.0625, 6.25 -> 0.0625, 0.0625 -> 0.0625. */
function toCapRate(v: unknown): number | null {
  const n = toNumber(v);
  if (n == null) return null;
  if (n <= 0) return null;
  if (n < 1) return n; // already a decimal
  return n / 100; // percent expressed as a whole number
}

function matchField(headerText: string): string | null {
  const h = norm(headerText);
  if (!h) return null;
  const order = ["pricePerSf", "salePrice", "capRate", "saleDate", "sf", "propertyType", "address", "city", "state"];
  for (const field of order) {
    for (const syn of SYNONYMS[field]) if (h === syn) return field;
  }
  for (const field of order) {
    for (const syn of SYNONYMS[field]) if (h.includes(syn)) return field;
  }
  return null;
}

function headerScore(cells: unknown[]): number {
  let score = 0;
  for (const c of cells) {
    const h = norm(c);
    if (!h) continue;
    if (ALL_SYNONYMS.has(h)) score += 2;
    else if ([...ALL_SYNONYMS].some((s) => h.includes(s))) score += 1;
  }
  return score;
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function round(n: number, d: number): number {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}

export function parseComps(buffer: Buffer | ArrayBuffer): ParsedComps {
  const warnings: string[] = [];
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  } catch {
    return empty("Could not read the file. Provide an .xlsx, .xls, or .csv export.");
  }

  const sheetName = wb.SheetNames[0];
  if (!sheetName) return empty("The workbook has no sheets.");
  const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
    header: 1,
    blankrows: true,
    defval: null,
  });
  if (!grid.length) return empty("The first sheet is empty.", sheetName);

  let headerIdx = -1;
  let best = 0;
  for (let r = 0; r < Math.min(grid.length, 20); r++) {
    const s = headerScore(grid[r]);
    if (s > best) { best = s; headerIdx = r; }
  }
  if (headerIdx === -1 || best < 2) {
    return empty("Could not find a comps header row. Expected columns like Address, Sale Price, SF, Cap Rate.", sheetName);
  }

  const header = grid[headerIdx];
  const colIndex: Record<string, number> = {};
  const columnMap: Record<string, string> = {};
  for (let c = 0; c < header.length; c++) {
    const field = matchField(String(header[c] ?? ""));
    if (field && colIndex[field] === undefined) {
      colIndex[field] = c;
      columnMap[field] = String(header[c]).trim();
    }
  }

  const get = (row: unknown[], field: string): unknown =>
    colIndex[field] !== undefined ? row[colIndex[field]] : undefined;

  const comps: Comp[] = [];
  for (let r = headerIdx + 1; r < grid.length; r++) {
    const row = grid[r];
    if (!row || row.every((c) => c == null || String(c).trim() === "")) continue;
    if (TOTAL_KEYWORDS.some((k) => norm(row[0]).startsWith(k))) continue;

    const address = strOrNull(get(row, "address"));
    const sf = toNumber(get(row, "sf"));
    const salePrice = toNumber(get(row, "salePrice"));
    let pricePerSf = toNumber(get(row, "pricePerSf"));
    if (pricePerSf == null && salePrice != null && sf != null && sf > 0) {
      pricePerSf = round(salePrice / sf, 2);
    }
    const capRate = toCapRate(get(row, "capRate"));

    // Row must carry at least one substantive signal.
    if (address == null && salePrice == null && sf == null && capRate == null) continue;

    comps.push({
      sourceRow: r + 1,
      address,
      city: strOrNull(get(row, "city")),
      state: strOrNull(get(row, "state")),
      propertyType: strOrNull(get(row, "propertyType")),
      sf,
      salePrice,
      pricePerSf,
      capRate,
      saleDate: dateOrNull(get(row, "saleDate")),
    });
  }

  if (comps.length === 0) {
    return { ...empty("No comparable rows found below the header.", sheetName), columnMap };
  }

  const ppsfs = comps.map((c) => c.pricePerSf).filter((n): n is number => n != null && n > 0);
  const caps = comps.map((c) => c.capRate).filter((n): n is number => n != null && n > 0);
  const prices = comps.map((c) => c.salePrice).filter((n): n is number => n != null && n > 0);

  if (!ppsfs.length) warnings.push("No price-per-SF could be derived; check the Sale Price / SF columns.");

  const totals: CompsTotals = {
    count: comps.length,
    avgPricePerSf: ppsfs.length ? round(ppsfs.reduce((a, b) => a + b, 0) / ppsfs.length, 2) : null,
    medianPricePerSf: ppsfs.length ? round(median(ppsfs) as number, 2) : null,
    avgCapRate: caps.length ? round(caps.reduce((a, b) => a + b, 0) / caps.length, 4) : null,
    avgSalePrice: prices.length ? round(prices.reduce((a, b) => a + b, 0) / prices.length, 0) : null,
  };

  return { ok: true, sheetName, comps, totals, columnMap, warnings };
}

function strOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}
function dateOrNull(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  return s || null;
}
function empty(error: string, sheetName = ""): ParsedComps {
  return {
    ok: false,
    sheetName,
    comps: [],
    totals: { count: 0, avgPricePerSf: null, medianPricePerSf: null, avgCapRate: null, avgSalePrice: null },
    columnMap: {},
    warnings: [],
    error,
  };
}
