// Custodian driver registry + sync helpers.
//
// Usage:
//   import { getDriver, syncConnection } from "@/lib/custodians";
//
//   const driver = getDriver("mock");
//   const snapshots = await driver.snapshot(ctx, ids, new Date());
//
// Adding a real provider:
//   1. Implement a new driver (see lib/custodians/mock.ts) that
//      satisfies CustodianDriver.
//   2. Register it in DRIVERS below.
//   3. Ensure the connection row's credentials_vault_ref resolves to
//      the credential shape the new driver expects.

import type { CustodianDriver, DriverContext } from "./types";
import { mockCustodianDriver } from "./mock";

const DRIVERS: Record<string, CustodianDriver> = {
  mock: mockCustodianDriver,
  // schwab: schwabCustodianDriver,   // future
  // fidelity: fidelityCustodianDriver,
  // altruist: altruistCustodianDriver,
};

export function getDriver(provider: string): CustodianDriver | null {
  return DRIVERS[provider] || null;
}

export function listRegisteredProviders(): string[] {
  return Object.keys(DRIVERS);
}

export type { CustodianDriver, DriverContext };
export * from "./types";
