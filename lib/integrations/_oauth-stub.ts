// Generic OAuth stub for scaffolded providers.
//
// The connect route handles the OAuth redirect flow itself (building
// the authorize URL, receiving the callback). This stub handles the
// token exchange on callback and stores the tokens. Sync is a no-op
// until a real adapter replaces this.

import type { IntegrationAdapter, ConnectInput, ConnectResult } from "./adapter";
import { getProvider } from "./registry";

export function makeOAuthStub(providerId: string): IntegrationAdapter {
  const provider = getProvider(providerId);
  if (!provider) {
    throw new Error(`Unknown provider '${providerId}'`);
  }
  return {
    provider,
    async connect(input: ConnectInput): Promise<ConnectResult> {
      if (!input.code) {
        throw new Error("OAuth authorization code is required");
      }
      return {
        credentials: { code: input.code },
        external_account_id: null,
        external_account_name: null,
      };
    },
    async sync() {
      return {
        records_pulled: 0,
        records_upserted: 0,
        records_skipped: 0,
        errors_count: 0,
        cursor: {},
        error_text: `${provider.name} sync adapter not yet implemented. OAuth tokens stored and ready.`,
      };
    },
  };
}
