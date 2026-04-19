// Shared types across custodian drivers. Each driver (Schwab, Fidelity,
// Altruist, mock) implements the CustodianDriver interface against its
// provider-specific API, and the sync worker iterates over connections
// and asks the matching driver for its latest snapshot.
//
// The goal is that switching Schwab on for a firm means:
//   1. Write a lib/custodians/schwab.ts file that implements
//      CustodianDriver.
//   2. Add 'schwab' to the provider enum.
//   3. Everything downstream (dashboard, compliance scanner, RMD
//      calc, client-doc cross-check) keeps working.

export type AccountType =
  | "ira"
  | "roth_ira"
  | "taxable"
  | "401k"
  | "trust"
  | "joint"
  | "other";

export type CustodianAccount = {
  providerAccountId: string;
  accountType: AccountType;
  accountName?: string;
  // Attempted match against an internal contact. Drivers should set
  // this when the custodian hands back a name/email that resolves to
  // exactly one contact in the workspace; otherwise leave null and let
  // the advisor match manually.
  contactHint?: {
    name?: string;
    email?: string;
    taxIdLast4?: string;
  };
  openedAt?: string; // ISO date
  closedAt?: string;
};

export type CustodianPosition = {
  symbol: string;
  description?: string;
  quantity: number;
  marketValue: number;
  costBasis?: number;
  unrealizedGain?: number;
};

export type CustodianBalance = {
  totalValue: number;
  cashValue?: number;
  securitiesValue?: number;
};

export type CustodianSnapshot = {
  providerAccountId: string;
  asOf: string; // ISO date
  balance: CustodianBalance;
  positions: CustodianPosition[];
};

export type DriverContext = {
  connectionId: string;
  workspaceId: string;
  // Resolved from the Vault ref on the connection row. Each driver
  // knows the shape of its own credentials.
  credentials?: Record<string, string>;
};

export interface CustodianDriver {
  readonly provider: string;

  // Return the list of accounts currently visible to this connection.
  // Called on initial connect and nightly to catch new/closed accounts.
  listAccounts(ctx: DriverContext): Promise<CustodianAccount[]>;

  // Return a full balance + positions snapshot for the given accounts.
  // Drivers may batch, parallelize, or paginate internally.
  snapshot(
    ctx: DriverContext,
    providerAccountIds: string[],
    asOf: Date
  ): Promise<CustodianSnapshot[]>;
}
