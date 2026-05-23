// Generic API-key adapter for scaffolded providers.
//
// Stores the customer's API key in integration_connections.credentials
// so it's ready when the real sync adapter is built. Connect always
// succeeds (we don't validate the key against the remote API yet).
// Sync returns a no-op result until a real adapter replaces this stub.

import type { IntegrationAdapter, ConnectInput, ConnectResult } from "./adapter";
import { getProvider } from "./registry";

export function makeApiKeyStub(providerId: string): IntegrationAdapter {
  const provider = getProvider(providerId);
  if (!provider) {
    throw new Error(`Unknown provider '${providerId}'`);
  }
  return {
    provider,
    async connect(input: ConnectInput): Promise<ConnectResult> {
      if (!input.api_key) {
        throw new Error("API key is required");
      }
      const credentials: Record<string, any> = {
        api_key: input.api_key,
      };
      if (input.username) credentials.username = input.username;
      if (input.password) credentials.password = input.password;

      return {
        credentials,
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
        error_text: `${provider.name} sync adapter not yet implemented. API key stored and ready.`,
      };
    },
  };
}
