// Provider registry — every third-party integration in one place.
//
// Each entry describes:
//   - what the integration does
//   - what kind of connection it uses (oauth | api_key | partner-only)
//   - the OAuth endpoints + scopes (when applicable)
//   - whether it's currently functional or scaffolded-pending-credentials
//
// Adding a new provider:
//   1. Add an entry here
//   2. Create lib/integrations/<provider>/{auth,sync}.ts
//   3. Add the OAuth callback route at app/api/integrations/<provider>/callback/route.ts
//
// The /integrations settings page reads this registry to render
// connect buttons. The display order is the array order.

export type ProviderKind =
  | "crm"           // Wealthbox, Redtail, Salesforce FS Cloud
  | "planning"      // RightCapital, eMoney, MoneyGuidePro
  | "risk"          // Nitrogen
  | "tax_planning"  // Holistiplan
  | "custodian"     // Schwab, Fidelity, Pershing, Altruist
  | "aggregator"    // Orion, Tamarac, Addepar, Black Diamond
  | "research"      // Morningstar, YCharts
  | "tax_content";  // CCH, Wolters Kluwer

export type AuthMethod =
  | "oauth"           // standard OAuth 2.0 — auth_url + token_url
  | "api_key"         // user pastes a key in the connect dialog
  | "partner_oauth"   // OAuth gated on partner approval (Schwab, Fidelity)
  | "partner_api"     // raw API gated on contract (Morningstar, CCH);

export type ProviderStatus =
  | "live"               // fully wired; connect → use
  | "scaffolded"         // adapter scaffold + UI in place; auth credentials pending
  | "partner_pending";   // need partner-program approval before any wiring works

export interface ProviderDefinition {
  id: string;
  name: string;
  kind: ProviderKind;
  description: string;
  auth_method: AuthMethod;
  status: ProviderStatus;
  /** OAuth: URL to redirect the user to. Token swap happens on /callback. */
  oauth_authorize_url?: string;
  oauth_token_url?: string;
  oauth_scope?: string;
  /** API-key adapters: human note about where to find the key. */
  api_key_help?: string;
  docs_url?: string;
  /** Phase 1-5 grouping for /integrations UI. */
  phase: 4 | 5;
  /** What we pull from this provider once connected. */
  capabilities: string[];
}

export const PROVIDERS: ProviderDefinition[] = [
  // ── Phase 4 — code-only ────────────────────────────────────
  {
    id: "wealthbox",
    name: "Wealthbox",
    kind: "crm",
    description:
      "RIA CRM. Pulls contacts, notes, opportunities, and tasks so Drift starts with a populated client roster instead of an empty one.",
    auth_method: "oauth",
    status: "scaffolded",
    oauth_authorize_url: "https://app.crmworkspace.com/oauth/authorize",
    oauth_token_url: "https://app.crmworkspace.com/oauth/token",
    oauth_scope: "login data",
    docs_url: "https://dev.wealthbox.com",
    phase: 4,
    capabilities: ["contacts", "notes", "tasks", "opportunities"],
  },
  {
    id: "redtail",
    name: "Redtail CRM",
    kind: "crm",
    description:
      "Veteran RIA CRM (Orion subsidiary). Contacts + activities + notes via the public REST API.",
    auth_method: "api_key",
    status: "scaffolded",
    api_key_help:
      "Generate an API key in Redtail under Manage Database → API Keys. We use Basic auth (key + user/pass).",
    docs_url: "https://help.redtailtechnology.com/hc/en-us/categories/360002148674",
    phase: 4,
    capabilities: ["contacts", "activities", "notes"],
  },
  {
    id: "holistiplan",
    name: "Holistiplan",
    kind: "tax_planning",
    description:
      "Tax-return analysis. Imports parsed 1040 scenarios + tax projection PDFs back into Drift's vault.",
    auth_method: "api_key",
    status: "scaffolded",
    api_key_help:
      "Account → API → Generate token. Holistiplan API access is included in the firm tier.",
    docs_url: "https://api.holistiplan.com/docs",
    phase: 4,
    capabilities: ["tax_scenarios", "projection_pdfs"],
  },
  {
    id: "nitrogen",
    name: "Nitrogen",
    kind: "risk",
    description:
      "Risk profiling (formerly Riskalyze). Imports per-client risk score + GPA so we can flag suitability mismatches.",
    auth_method: "api_key",
    status: "scaffolded",
    api_key_help: "Settings → Integrations → API Access.",
    docs_url: "https://api.nitrogenwealth.com",
    phase: 4,
    capabilities: ["risk_score", "gpa", "portfolio_risk"],
  },
  {
    id: "rightcapital",
    name: "RightCapital",
    kind: "planning",
    description:
      "Comprehensive financial planning. Pulls plan summaries (cash-flow, retirement projection, tax strategy) per client.",
    auth_method: "partner_oauth",
    status: "scaffolded",
    oauth_authorize_url: "https://api.rightcapital.com/oauth/authorize",
    oauth_token_url: "https://api.rightcapital.com/oauth/token",
    oauth_scope: "client.read plans.read",
    docs_url: "https://api.rightcapital.com",
    phase: 4,
    capabilities: ["plans", "client_facts"],
  },

  // ── Phase 5 — partner-required ──────────────────────────────
  {
    id: "schwab",
    name: "Schwab Advisor Center",
    kind: "custodian",
    description:
      "OpenView Gateway feed. Account balances, holdings, transactions, performance.",
    auth_method: "partner_oauth",
    status: "partner_pending",
    docs_url: "https://developer.schwab.com",
    phase: 5,
    capabilities: ["accounts", "holdings", "transactions", "performance"],
  },
  {
    id: "fidelity",
    name: "Fidelity Wealthscape",
    kind: "custodian",
    description: "Wealthscape Integration Xchange. Same data shape as Schwab.",
    auth_method: "partner_oauth",
    status: "partner_pending",
    docs_url: "https://www.fidelity.com/wealthscape",
    phase: 5,
    capabilities: ["accounts", "holdings", "transactions"],
  },
  {
    id: "pershing",
    name: "Pershing NetX360",
    kind: "custodian",
    description:
      "Pershing/BNY Mellon custodian feed. Long partner-approval cycle (6-12 mo).",
    auth_method: "partner_oauth",
    status: "partner_pending",
    docs_url: "https://www.pershing.com/us/en/business-solutions/netx360.html",
    phase: 5,
    capabilities: ["accounts", "holdings", "transactions"],
  },
  {
    id: "altruist",
    name: "Altruist",
    kind: "custodian",
    description:
      "Modern custodian for fee-only advisors. Public REST API; faster onboarding than the legacy custodians.",
    auth_method: "partner_oauth",
    status: "partner_pending",
    oauth_authorize_url: "https://api.altruist.com/oauth/authorize",
    oauth_token_url: "https://api.altruist.com/oauth/token",
    docs_url: "https://docs.altruist.com",
    phase: 5,
    capabilities: ["accounts", "holdings", "transactions"],
  },
  {
    id: "orion",
    name: "Orion",
    kind: "aggregator",
    description:
      "Portfolio accounting platform. Aggregates across multiple custodians; one connection covers the firm.",
    auth_method: "partner_oauth",
    status: "partner_pending",
    docs_url: "https://api.orionadvisor.com",
    phase: 5,
    capabilities: ["accounts", "holdings", "performance", "billing"],
  },
  {
    id: "tamarac",
    name: "Tamarac",
    kind: "aggregator",
    description:
      "Envestnet Tamarac. Reporting + rebalancing + compliance. Long-tenured RIAs run on this.",
    auth_method: "partner_api",
    status: "partner_pending",
    docs_url: "https://www.envestnet.com/our-companies/tamarac",
    phase: 5,
    capabilities: ["accounts", "holdings", "performance", "billing"],
  },
  {
    id: "addepar",
    name: "Addepar",
    kind: "aggregator",
    description:
      "High-end portfolio aggregator for HNW / multi-family-office.",
    auth_method: "partner_api",
    status: "partner_pending",
    docs_url: "https://developers.addepar.com",
    phase: 5,
    capabilities: ["accounts", "holdings", "performance"],
  },
  {
    id: "black_diamond",
    name: "Black Diamond (SS&C)",
    kind: "aggregator",
    description: "SS&C Advent's portfolio platform.",
    auth_method: "partner_api",
    status: "partner_pending",
    docs_url: "https://www.advent.com/products/black-diamond/",
    phase: 5,
    capabilities: ["accounts", "holdings", "performance"],
  },
  {
    id: "morningstar",
    name: "Morningstar Direct",
    kind: "research",
    description:
      "Holdings classification, expense ratios, returns, ESG scores, manager research. Required to defend research-grounded recommendations.",
    auth_method: "partner_api",
    status: "partner_pending",
    docs_url: "https://developer.morningstar.com",
    phase: 5,
    capabilities: [
      "security_master",
      "fund_metrics",
      "manager_research",
      "asset_allocation",
    ],
  },
  {
    id: "ycharts",
    name: "YCharts",
    kind: "research",
    description:
      "Equity / ETF research and visualization. Optional alternative or complement to Morningstar.",
    auth_method: "partner_api",
    status: "partner_pending",
    docs_url: "https://ycharts.com/help/api",
    phase: 5,
    capabilities: ["equities", "etfs", "macro_data"],
  },
  {
    id: "cch",
    name: "CCH IntelliConnect",
    kind: "tax_content",
    description:
      "Wolters Kluwer tax research database. Authoritative tax citations for the planning agents.",
    auth_method: "partner_api",
    status: "partner_pending",
    docs_url: "https://intelliconnect.cch.com",
    phase: 5,
    capabilities: ["tax_research", "court_decisions", "irs_publications"],
  },
  {
    id: "salesforce_fs_cloud",
    name: "Salesforce Financial Services Cloud",
    kind: "crm",
    description:
      "Enterprise RIA CRM. Common at $1B+ AUM firms. Two-way sync with contacts, accounts, opportunities.",
    auth_method: "partner_oauth",
    status: "partner_pending",
    oauth_authorize_url: "https://login.salesforce.com/services/oauth2/authorize",
    oauth_token_url: "https://login.salesforce.com/services/oauth2/token",
    oauth_scope: "api refresh_token full",
    docs_url: "https://developer.salesforce.com/docs/atlas.en-us.api.meta",
    phase: 5,
    capabilities: ["contacts", "accounts", "opportunities", "households"],
  },
];

export function getProvider(id: string): ProviderDefinition | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function providersByPhase(phase: 4 | 5): ProviderDefinition[] {
  return PROVIDERS.filter((p) => p.phase === phase);
}

export function providersByKind(kind: ProviderKind): ProviderDefinition[] {
  return PROVIDERS.filter((p) => p.kind === kind);
}
