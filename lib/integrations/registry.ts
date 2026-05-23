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
  | "crm"              // Salesforce, HubSpot, Apto, Buildout
  | "property_mgmt"    // Yardi, AppFolio, RealPage, Entrata
  | "accounting"       // QuickBooks, Sage Intacct, NetSuite, Xero
  | "market_data"      // CoStar, Reonomy, Placer.ai, Yardi Matrix, RCA
  | "deal_mgmt"        // Dealpath, Juniper Square, Northspyre
  | "esignature"       // DocuSign, PandaDoc
  | "networking"       // ZoomInfo, Apollo.io, LinkedIn
  | "listings";        // Crexi, Auction.com, Ten-X

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
  /** Phase grouping for /integrations UI. */
  phase: 6;
  /** What we pull from this provider once connected. */
  capabilities: string[];
}

export const PROVIDERS: ProviderDefinition[] = [
  // ── CRE integrations (customer provides API key) ───
  //
  // Category D from the CRE strategy doc: the customer already pays for
  // these services. We store their API key and pull data into Drift.

  // ── Property Management Systems ──
  {
    id: "yardi",
    name: "Yardi Voyager",
    kind: "property_mgmt",
    description:
      "Enterprise property management. Pulls rent rolls, leases, tenants, GL, and maintenance data.",
    auth_method: "api_key",
    status: "scaffolded",
    api_key_help:
      "Contact your Yardi account rep to enable API access. You'll receive a client ID and secret for the Voyager API.",
    docs_url: "https://www.yardi.com/products/voyager/",
    phase: 6,
    capabilities: ["rent_rolls", "leases", "tenants", "gl", "maintenance"],
  },
  {
    id: "yardi_breeze",
    name: "Yardi Breeze",
    kind: "property_mgmt",
    description:
      "Simplified Yardi for smaller portfolios. Same data, lighter setup.",
    auth_method: "api_key",
    status: "scaffolded",
    api_key_help:
      "In Yardi Breeze, go to Settings > API Access to generate your key.",
    docs_url: "https://www.yardi.com/products/yardi-breeze/",
    phase: 6,
    capabilities: ["rent_rolls", "leases", "tenants"],
  },
  {
    id: "appfolio",
    name: "AppFolio",
    kind: "property_mgmt",
    description:
      "Multifamily-focused PM. Pulls units, tenants, leases, work orders, and owner statements.",
    auth_method: "api_key",
    status: "scaffolded",
    api_key_help:
      "In AppFolio, go to Settings > Integrations > API Access. Generate a new API key and paste it here.",
    docs_url: "https://help.appfolio.com/s/article/AppFolio-API",
    phase: 6,
    capabilities: ["units", "tenants", "leases", "work_orders", "owner_statements"],
  },
  {
    id: "realpage",
    name: "RealPage",
    kind: "property_mgmt",
    description:
      "PM + revenue management for large portfolios. Pulls occupancy, rent rolls, and revenue data.",
    auth_method: "api_key",
    status: "scaffolded",
    api_key_help:
      "Contact your RealPage account manager to request API credentials for the OneSite or Propertyware API.",
    docs_url: "https://www.realpage.com/",
    phase: 6,
    capabilities: ["occupancy", "rent_rolls", "revenue", "tenants"],
  },
  {
    id: "entrata",
    name: "Entrata",
    kind: "property_mgmt",
    description:
      "Multifamily operating platform. Pulls leases, residents, amenities, and accounting data.",
    auth_method: "api_key",
    status: "scaffolded",
    api_key_help:
      "In Entrata, go to Setup > API > Manage API Keys. Generate a key and paste it here.",
    docs_url: "https://www.entrata.com/",
    phase: 6,
    capabilities: ["leases", "residents", "amenities", "accounting"],
  },
  {
    id: "mri_software",
    name: "MRI Software",
    kind: "property_mgmt",
    description:
      "Enterprise CRE platform. Pulls property data, leases, GL, and tenant information.",
    auth_method: "api_key",
    status: "scaffolded",
    api_key_help:
      "Contact MRI support to enable the MRI Platform X API and obtain your credentials.",
    docs_url: "https://www.mrisoftware.com/",
    phase: 6,
    capabilities: ["properties", "leases", "gl", "tenants"],
  },
  {
    id: "buildium",
    name: "Buildium",
    kind: "property_mgmt",
    description:
      "PM for smaller portfolios. Pulls tenants, leases, maintenance, and accounting.",
    auth_method: "api_key",
    status: "scaffolded",
    api_key_help:
      "In Buildium, go to Settings > API Settings. Create a new API key.",
    docs_url: "https://developer.buildium.com/",
    phase: 6,
    capabilities: ["tenants", "leases", "maintenance", "accounting"],
  },

  // ── Accounting ──
  {
    id: "quickbooks",
    name: "QuickBooks Online",
    kind: "accounting",
    description:
      "Most common SMB CRE accounting. Syncs chart of accounts, transactions, vendors, and bank feeds.",
    auth_method: "oauth",
    status: "scaffolded",
    oauth_authorize_url: "https://appcenter.intuit.com/connect/oauth2",
    oauth_token_url: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
    oauth_scope: "com.intuit.quickbooks.accounting",
    docs_url: "https://developer.intuit.com/app/developer/qbo/docs/develop",
    phase: 6,
    capabilities: ["chart_of_accounts", "transactions", "vendors", "bank_feeds"],
  },
  {
    id: "sage_intacct",
    name: "Sage Intacct",
    kind: "accounting",
    description:
      "Mid-market accounting for CRE operators. Pulls GL, AP/AR, and financial reports.",
    auth_method: "api_key",
    status: "scaffolded",
    api_key_help:
      "In Sage Intacct, go to Company > Admin > Web Services credentials. Create a Web Services user and paste the credentials here.",
    docs_url: "https://developer.intacct.com/",
    phase: 6,
    capabilities: ["gl", "ap_ar", "financial_reports", "vendors"],
  },
  {
    id: "netsuite",
    name: "NetSuite",
    kind: "accounting",
    description:
      "Oracle ERP for larger CRE operators. Pulls financials, entities, and transactions.",
    auth_method: "api_key",
    status: "scaffolded",
    api_key_help:
      "In NetSuite, go to Setup > Integration > Manage Integrations. Create a new integration record and enable Token-Based Authentication.",
    docs_url: "https://docs.oracle.com/en/cloud/saas/netsuite/",
    phase: 6,
    capabilities: ["financials", "entities", "transactions"],
  },
  {
    id: "xero",
    name: "Xero",
    kind: "accounting",
    description:
      "Cloud accounting. Syncs contacts, invoices, bank transactions, and reports.",
    auth_method: "oauth",
    status: "scaffolded",
    oauth_authorize_url: "https://login.xero.com/identity/connect/authorize",
    oauth_token_url: "https://identity.xero.com/connect/token",
    oauth_scope: "openid profile email accounting.transactions accounting.contacts",
    docs_url: "https://developer.xero.com/",
    phase: 6,
    capabilities: ["contacts", "invoices", "bank_transactions", "reports"],
  },

  // ── CRM & Deal Management ──
  {
    id: "salesforce",
    name: "Salesforce",
    kind: "crm",
    description:
      "Enterprise CRM. Two-way sync with contacts, accounts, opportunities, and activities.",
    auth_method: "oauth",
    status: "scaffolded",
    oauth_authorize_url: "https://login.salesforce.com/services/oauth2/authorize",
    oauth_token_url: "https://login.salesforce.com/services/oauth2/token",
    oauth_scope: "api refresh_token full",
    docs_url: "https://developer.salesforce.com/docs",
    phase: 6,
    capabilities: ["contacts", "accounts", "opportunities", "activities"],
  },
  {
    id: "hubspot",
    name: "HubSpot",
    kind: "crm",
    description:
      "Broader market CRM. Pulls contacts, companies, deals, and engagement data.",
    auth_method: "api_key",
    status: "scaffolded",
    api_key_help:
      "In HubSpot, go to Settings > Integrations > Private Apps. Create a private app and copy the access token.",
    docs_url: "https://developers.hubspot.com/docs/api/overview",
    phase: 6,
    capabilities: ["contacts", "companies", "deals", "engagements"],
  },
  {
    id: "apto",
    name: "Apto",
    kind: "crm",
    description:
      "Broker-specific CRM built on Salesforce. Pulls deals, contacts, properties, and comps.",
    auth_method: "api_key",
    status: "scaffolded",
    api_key_help:
      "In Apto, go to Settings > API. Generate an API token.",
    docs_url: "https://apto.com/",
    phase: 6,
    capabilities: ["deals", "contacts", "properties", "comps"],
  },
  {
    id: "buildout",
    name: "Buildout",
    kind: "crm",
    description:
      "CRE listings + CRM platform. Pulls listings, contacts, and deal pipeline.",
    auth_method: "api_key",
    status: "scaffolded",
    api_key_help:
      "In Buildout, go to Admin > API Settings. Generate your API key.",
    docs_url: "https://buildout.com/",
    phase: 6,
    capabilities: ["listings", "contacts", "deals"],
  },
  {
    id: "dealpath",
    name: "Dealpath",
    kind: "deal_mgmt",
    description:
      "Investment management and deal pipeline. Pulls deals, underwriting data, and pipeline stages.",
    auth_method: "api_key",
    status: "scaffolded",
    api_key_help:
      "In Dealpath, go to Settings > API Access. Generate a new API key.",
    docs_url: "https://www.dealpath.com/",
    phase: 6,
    capabilities: ["deals", "pipeline", "underwriting_data"],
  },
  {
    id: "juniper_square",
    name: "Juniper Square",
    kind: "deal_mgmt",
    description:
      "Investor management for CRE funds. Pulls investor data, capital calls, distributions, and reports.",
    auth_method: "api_key",
    status: "scaffolded",
    api_key_help:
      "Contact Juniper Square support to enable API access for your fund.",
    docs_url: "https://junipersquare.com/",
    phase: 6,
    capabilities: ["investors", "capital_calls", "distributions", "reports"],
  },
  {
    id: "northspyre",
    name: "Northspyre",
    kind: "deal_mgmt",
    description:
      "Development project tracking. Pulls budgets, change orders, draw schedules, and vendor bids.",
    auth_method: "api_key",
    status: "scaffolded",
    api_key_help:
      "In Northspyre, go to Settings > Integrations. Generate an API key.",
    docs_url: "https://www.northspyre.com/",
    phase: 6,
    capabilities: ["budgets", "change_orders", "draw_schedules", "vendors"],
  },

  // ── Market Data ──
  {
    id: "costar",
    name: "CoStar",
    kind: "market_data",
    description:
      "CRE market intelligence. Read-only access to comps, listings, and market analytics. Requires attorney-reviewed TOS compliance.",
    auth_method: "api_key",
    status: "scaffolded",
    api_key_help:
      "CoStar API access requires an enterprise subscription. Contact your CoStar rep to request API credentials. TOS restricts redistribution.",
    docs_url: "https://www.costar.com/",
    phase: 6,
    capabilities: ["comps", "listings", "market_analytics", "tenants"],
  },
  {
    id: "crexi",
    name: "Crexi",
    kind: "listings",
    description:
      "CRE marketplace. Pulls listings, transactions, and market data.",
    auth_method: "api_key",
    status: "scaffolded",
    api_key_help:
      "In Crexi, go to your account settings > API Access to generate a key.",
    docs_url: "https://www.crexi.com/",
    phase: 6,
    capabilities: ["listings", "transactions", "market_data"],
  },
  {
    id: "reonomy",
    name: "Reonomy",
    kind: "market_data",
    description:
      "Owner intelligence and off-market property data. Pulls ownership, building details, and transaction history.",
    auth_method: "api_key",
    status: "scaffolded",
    api_key_help:
      "In Reonomy, go to Settings > API. Generate your API key.",
    docs_url: "https://www.reonomy.com/",
    phase: 6,
    capabilities: ["ownership", "building_details", "transaction_history"],
  },
  {
    id: "placer_ai",
    name: "Placer.ai",
    kind: "market_data",
    description:
      "Foot traffic analytics. Pulls visit counts, visitor demographics, trade area, and competitive benchmarks.",
    auth_method: "api_key",
    status: "scaffolded",
    api_key_help:
      "In Placer.ai, go to Settings > API Access. Copy your API key. Requires a Placer Pro or Enterprise subscription.",
    docs_url: "https://www.placer.ai/",
    phase: 6,
    capabilities: ["foot_traffic", "demographics", "trade_area", "benchmarks"],
  },
  {
    id: "yardi_matrix",
    name: "Yardi Matrix",
    kind: "market_data",
    description:
      "Multifamily and commercial market intelligence. Pulls rent comps, supply pipeline, and market fundamentals.",
    auth_method: "api_key",
    status: "scaffolded",
    api_key_help:
      "Contact Yardi Matrix to request API access for your subscription tier.",
    docs_url: "https://www.yardimatrix.com/",
    phase: 6,
    capabilities: ["rent_comps", "supply_pipeline", "market_fundamentals"],
  },
  {
    id: "rca",
    name: "Real Capital Analytics",
    kind: "market_data",
    description:
      "Institutional transaction data. Pulls commercial property sales, pricing trends, and capital flows.",
    auth_method: "api_key",
    status: "scaffolded",
    api_key_help:
      "Contact MSCI Real Capital Analytics to request API credentials for your subscription.",
    docs_url: "https://www.msci.com/our-solutions/real-assets",
    phase: 6,
    capabilities: ["transactions", "pricing_trends", "capital_flows"],
  },

  // ── E-Signature ──
  {
    id: "docusign",
    name: "DocuSign",
    kind: "esignature",
    description:
      "E-signature and closing coordination. Pulls envelope status, signed documents, and audit trails.",
    auth_method: "oauth",
    status: "scaffolded",
    oauth_authorize_url: "https://account.docusign.com/oauth/auth",
    oauth_token_url: "https://account.docusign.com/oauth/token",
    oauth_scope: "signature extended",
    docs_url: "https://developers.docusign.com/",
    phase: 6,
    capabilities: ["envelopes", "signed_documents", "audit_trails"],
  },
  {
    id: "pandadoc",
    name: "PandaDoc",
    kind: "esignature",
    description:
      "Document automation and e-signature. Pulls document status, templates, and completed agreements.",
    auth_method: "api_key",
    status: "scaffolded",
    api_key_help:
      "In PandaDoc, go to Settings > API > API Key. Copy your key.",
    docs_url: "https://developers.pandadoc.com/",
    phase: 6,
    capabilities: ["documents", "templates", "agreements"],
  },

  // ── Networking & Outreach ──
  {
    id: "zoominfo",
    name: "ZoomInfo",
    kind: "networking",
    description:
      "Contact intelligence. Pulls verified contact details, company info, and org charts for CRE principals.",
    auth_method: "api_key",
    status: "scaffolded",
    api_key_help:
      "In ZoomInfo, go to Admin > Integrations > API. Copy your API key.",
    docs_url: "https://developer.zoominfo.com/",
    phase: 6,
    capabilities: ["contacts", "companies", "org_charts"],
  },
  {
    id: "apollo",
    name: "Apollo.io",
    kind: "networking",
    description:
      "Contact database + outreach. Pulls prospect data, email sequences, and engagement analytics.",
    auth_method: "api_key",
    status: "scaffolded",
    api_key_help:
      "In Apollo, go to Settings > Integrations > API. Copy your API key.",
    docs_url: "https://apolloio.github.io/apollo-api-docs/",
    phase: 6,
    capabilities: ["prospects", "sequences", "engagement"],
  },
  {
    id: "linkedin_sales_nav",
    name: "LinkedIn Sales Navigator",
    kind: "networking",
    description:
      "Relationship graph for CRE professionals. Pulls saved leads, accounts, and InMail status.",
    auth_method: "oauth",
    status: "partner_pending",
    docs_url: "https://developer.linkedin.com/",
    phase: 6,
    capabilities: ["leads", "accounts", "relationship_graph"],
  },

  // ── Listings & Auctions ──
  {
    id: "auction_com",
    name: "Auction.com",
    kind: "listings",
    description:
      "Distressed property auctions. Pulls active listings, bid history, and property details.",
    auth_method: "api_key",
    status: "scaffolded",
    api_key_help:
      "Contact Auction.com to request API access for your account.",
    docs_url: "https://www.auction.com/",
    phase: 6,
    capabilities: ["auction_listings", "bid_history", "property_details"],
  },
  {
    id: "ten_x",
    name: "Ten-X Commercial",
    kind: "listings",
    description:
      "Institutional CRE auction platform. Pulls listing data and transaction outcomes.",
    auth_method: "api_key",
    status: "scaffolded",
    api_key_help:
      "Contact Ten-X to request API access for your account.",
    docs_url: "https://www.ten-x.com/company/commercial/",
    phase: 6,
    capabilities: ["listings", "transactions"],
  },
];

export function getProvider(id: string): ProviderDefinition | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function providersByPhase(phase: 6): ProviderDefinition[] {
  return PROVIDERS.filter((p) => p.phase === phase);
}

export function providersByKind(kind: ProviderKind): ProviderDefinition[] {
  return PROVIDERS.filter((p) => p.kind === kind);
}
