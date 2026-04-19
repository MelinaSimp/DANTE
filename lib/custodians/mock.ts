// Mock custodian driver.
//
// Returns deterministic fixture data so the dashboard, compliance
// scanner, and eventual RMD calculator have something realistic to
// work against while we're waiting on Schwab Institutional API access.
//
// The data is shaped like what a real Schwab response would look like:
// mixed account types per household, positions in common tickers,
// realistic cost-basis gaps. Nothing here should be treated as a real
// recommendation — it's fixture.
//
// To use: insert a row into custodian_connections with provider='mock'
// and run the sync worker. The worker sees provider='mock' and routes
// through this driver.

import type {
  CustodianAccount,
  CustodianDriver,
  CustodianSnapshot,
  DriverContext,
} from "./types";

// Seeded fixture — three households, six accounts.
const FIXTURE_ACCOUNTS: CustodianAccount[] = [
  {
    providerAccountId: "MOCK-IRA-11001",
    accountType: "ira",
    accountName: "Margaret Johnson IRA",
    contactHint: { name: "Margaret Johnson" },
    openedAt: "2019-03-14",
  },
  {
    providerAccountId: "MOCK-TAX-11002",
    accountType: "taxable",
    accountName: "Margaret Johnson Individual",
    contactHint: { name: "Margaret Johnson" },
    openedAt: "2019-03-14",
  },
  {
    providerAccountId: "MOCK-ROTH-22001",
    accountType: "roth_ira",
    accountName: "Daniel Park Roth IRA",
    contactHint: { name: "Daniel Park" },
    openedAt: "2021-06-02",
  },
  {
    providerAccountId: "MOCK-TAX-22002",
    accountType: "taxable",
    accountName: "Park Family Joint",
    contactHint: { name: "Daniel Park" },
    openedAt: "2020-11-10",
  },
  {
    providerAccountId: "MOCK-IRA-33001",
    accountType: "ira",
    accountName: "Angela Castillo Rollover IRA",
    contactHint: { name: "Angela Castillo" },
    openedAt: "2018-01-22",
  },
  {
    providerAccountId: "MOCK-TRUST-33002",
    accountType: "trust",
    accountName: "Castillo Family Revocable Trust",
    contactHint: { name: "Angela Castillo" },
    openedAt: "2022-09-15",
  },
];

// Per-account fixture positions. Numbers are illustrative.
const FIXTURE_SNAPSHOTS: Record<string, CustodianSnapshot> = {
  "MOCK-IRA-11001": {
    providerAccountId: "MOCK-IRA-11001",
    asOf: "",
    balance: { totalValue: 642300, cashValue: 18200, securitiesValue: 624100 },
    positions: [
      { symbol: "VTI", description: "Vanguard Total Stock Market ETF", quantity: 920, marketValue: 268400, costBasis: 178200, unrealizedGain: 90200 },
      { symbol: "BND", description: "Vanguard Total Bond Market ETF", quantity: 1420, marketValue: 102100, costBasis: 112800, unrealizedGain: -10700 },
      { symbol: "VXUS", description: "Vanguard Total International Stock", quantity: 1810, marketValue: 98400, costBasis: 88900, unrealizedGain: 9500 },
      { symbol: "SCHD", description: "Schwab US Dividend Equity ETF", quantity: 620, marketValue: 55200, costBasis: 49200, unrealizedGain: 6000 },
      { symbol: "QQQ", description: "Invesco QQQ Trust", quantity: 180, marketValue: 100000, costBasis: 60000, unrealizedGain: 40000 },
    ],
  },
  "MOCK-TAX-11002": {
    providerAccountId: "MOCK-TAX-11002",
    asOf: "",
    balance: { totalValue: 98400, cashValue: 4200, securitiesValue: 94200 },
    positions: [
      { symbol: "VTI", description: "Vanguard Total Stock Market ETF", quantity: 240, marketValue: 70080, costBasis: 51200, unrealizedGain: 18880 },
      { symbol: "MUB", description: "iShares National Muni Bond ETF", quantity: 220, marketValue: 24120, costBasis: 23800, unrealizedGain: 320 },
    ],
  },
  "MOCK-ROTH-22001": {
    providerAccountId: "MOCK-ROTH-22001",
    asOf: "",
    balance: { totalValue: 184600, cashValue: 1200, securitiesValue: 183400 },
    positions: [
      { symbol: "VOO", description: "Vanguard S&P 500 ETF", quantity: 320, marketValue: 156800, costBasis: 92100, unrealizedGain: 64700 },
      { symbol: "VGT", description: "Vanguard Information Technology ETF", quantity: 55, marketValue: 26600, costBasis: 18200, unrealizedGain: 8400 },
    ],
  },
  "MOCK-TAX-22002": {
    providerAccountId: "MOCK-TAX-22002",
    asOf: "",
    balance: { totalValue: 412900, cashValue: 22100, securitiesValue: 390800 },
    positions: [
      { symbol: "VTI", description: "Vanguard Total Stock Market ETF", quantity: 800, marketValue: 233600, costBasis: 164000, unrealizedGain: 69600 },
      { symbol: "VXUS", description: "Vanguard Total International Stock", quantity: 1400, marketValue: 76100, costBasis: 72000, unrealizedGain: 4100 },
      { symbol: "BND", description: "Vanguard Total Bond Market ETF", quantity: 1100, marketValue: 79100, costBasis: 84400, unrealizedGain: -5300 },
    ],
  },
  "MOCK-IRA-33001": {
    providerAccountId: "MOCK-IRA-33001",
    asOf: "",
    balance: { totalValue: 1284300, cashValue: 34200, securitiesValue: 1250100 },
    positions: [
      { symbol: "VTI", description: "Vanguard Total Stock Market ETF", quantity: 1850, marketValue: 540400, costBasis: 358000, unrealizedGain: 182400 },
      { symbol: "VXUS", description: "Vanguard Total International Stock", quantity: 2400, marketValue: 130400, costBasis: 122000, unrealizedGain: 8400 },
      { symbol: "BND", description: "Vanguard Total Bond Market ETF", quantity: 4200, marketValue: 302100, costBasis: 330000, unrealizedGain: -27900 },
      { symbol: "VNQ", description: "Vanguard Real Estate ETF", quantity: 900, marketValue: 85800, costBasis: 78000, unrealizedGain: 7800 },
      { symbol: "GLD", description: "SPDR Gold Shares", quantity: 480, marketValue: 191400, costBasis: 120000, unrealizedGain: 71400 },
    ],
  },
  "MOCK-TRUST-33002": {
    providerAccountId: "MOCK-TRUST-33002",
    asOf: "",
    balance: { totalValue: 612400, cashValue: 52400, securitiesValue: 560000 },
    positions: [
      { symbol: "VOO", description: "Vanguard S&P 500 ETF", quantity: 620, marketValue: 303800, costBasis: 188000, unrealizedGain: 115800 },
      { symbol: "MUB", description: "iShares National Muni Bond ETF", quantity: 1780, marketValue: 195100, costBasis: 197000, unrealizedGain: -1900 },
      { symbol: "VNQ", description: "Vanguard Real Estate ETF", quantity: 640, marketValue: 61100, costBasis: 58000, unrealizedGain: 3100 },
    ],
  },
};

export const mockCustodianDriver: CustodianDriver = {
  provider: "mock",

  async listAccounts(_ctx: DriverContext): Promise<CustodianAccount[]> {
    return FIXTURE_ACCOUNTS;
  },

  async snapshot(
    _ctx: DriverContext,
    providerAccountIds: string[],
    asOf: Date
  ): Promise<CustodianSnapshot[]> {
    const isoDate = asOf.toISOString().slice(0, 10);
    const out: CustodianSnapshot[] = [];
    for (const id of providerAccountIds) {
      const fixture = FIXTURE_SNAPSHOTS[id];
      if (!fixture) continue;
      out.push({ ...fixture, asOf: isoDate });
    }
    return out;
  },
};
