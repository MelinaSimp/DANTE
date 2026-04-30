// Phase 5 partner-required stub.
//
// Every Phase 5 provider (Schwab, Fidelity, Pershing, Morningstar,
// CCH, Salesforce FS Cloud, Orion, etc.) needs a contract / partner
// approval before any auth or data pull can happen. The schema and
// UI plumbing exist so we can accept "Connect" clicks, but the
// adapter cleanly errors with a "partner approval required" message
// and writes a meaningful sync_run row so the UI shows useful state.
//
// As each partnership lands, replace the stub adapter with a real
// one — same interface, same connection table, same sync runner.
// The /integrations UI already reads provider.status === 'live' to
// decide whether to allow connect.

import type { IntegrationAdapter } from "./adapter";
import { getProvider } from "./registry";

const NOT_AVAILABLE_MESSAGE =
  "This integration requires partner program approval and is not yet enabled. Drift submits the partner application as part of the customer onboarding process.";

export function makeStub(providerId: string): IntegrationAdapter {
  const provider = getProvider(providerId);
  if (!provider) {
    throw new Error(`Unknown provider '${providerId}'`);
  }
  return {
    provider,
    async connect() {
      throw new Error(`${provider.name}: ${NOT_AVAILABLE_MESSAGE}`);
    },
    async sync() {
      return {
        records_pulled: 0,
        records_upserted: 0,
        records_skipped: 0,
        errors_count: 0,
        cursor: {},
        error_text: NOT_AVAILABLE_MESSAGE,
      };
    },
  };
}
