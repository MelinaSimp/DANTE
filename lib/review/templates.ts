// lib/review/templates.ts
//
// Pre-built review-table templates — Harvey's "one-click workflows"
// pattern. Each template defines a set of columns tailored to a
// document type, so the user can land on /review-tables/new, click
// the template, and get a fully populated wizard ready to point at
// docs.
//
// Templates are vertical-aware: real_estate gets listing /
// purchase / closing / lease forms; financial_advisor gets client
// onboarding / IPS / tax. The picker filters by the workspace's
// industry so users only see relevant ones.

export type ColumnKind =
  | "text"
  | "number"
  | "date"
  | "yes_no"
  | "currency"
  | "verbatim"
  | "list";

export interface TemplateColumn {
  name: string;
  prompt: string;
  kind: ColumnKind;
}

export interface ReviewTemplate {
  id: string;
  name: string;
  description: string;
  industry: "real_estate" | "financial_advisor" | "any";
  columns: TemplateColumn[];
}

export const TEMPLATES: ReviewTemplate[] = [
  {
    id: "re_listing_agreement",
    name: "Listing Agreement",
    description:
      "Pull terms across a stack of listing agreements — price, term, commission, exclusions.",
    industry: "real_estate",
    columns: [
      { name: "Property address", prompt: "What is the full property address?", kind: "text" },
      { name: "Seller name(s)", prompt: "Who are the seller(s) named in the agreement?", kind: "list" },
      { name: "List price", prompt: "What is the list price?", kind: "currency" },
      { name: "Listing term start", prompt: "What is the listing term start date?", kind: "date" },
      { name: "Listing term end", prompt: "What is the listing term expiration date?", kind: "date" },
      { name: "Commission %", prompt: "What is the total commission percentage?", kind: "number" },
      { name: "Exclusive?", prompt: "Is this an exclusive listing?", kind: "yes_no" },
      { name: "Excluded buyers", prompt: "Are any specific buyers explicitly excluded? List them.", kind: "list" },
      { name: "Termination clause (verbatim)", prompt: "Quote the termination clause word-for-word.", kind: "verbatim" },
    ],
  },
  {
    id: "re_purchase_offer",
    name: "Purchase Offer",
    description:
      "Compare buyer offers side by side — price, contingencies, closing timing.",
    industry: "real_estate",
    columns: [
      { name: "Buyer name(s)", prompt: "Who are the buyer(s)?", kind: "list" },
      { name: "Offer price", prompt: "What is the purchase price offered?", kind: "currency" },
      { name: "Earnest money", prompt: "How much earnest money is the buyer putting down?", kind: "currency" },
      { name: "Closing date", prompt: "What is the proposed closing date?", kind: "date" },
      { name: "Financing contingency?", prompt: "Is there a financing contingency?", kind: "yes_no" },
      { name: "Inspection contingency?", prompt: "Is there an inspection contingency?", kind: "yes_no" },
      { name: "Appraisal contingency?", prompt: "Is there an appraisal contingency?", kind: "yes_no" },
      { name: "Closing costs split", prompt: "How are closing costs split between buyer and seller?", kind: "text" },
      { name: "Special conditions (verbatim)", prompt: "Quote any unusual or special conditions verbatim.", kind: "verbatim" },
    ],
  },
  {
    id: "re_lease",
    name: "Lease Agreement",
    description:
      "Extract lease terms across rental agreements — rent, term, deposit, key clauses.",
    industry: "real_estate",
    columns: [
      { name: "Property address", prompt: "Full address of the leased property.", kind: "text" },
      { name: "Tenant name(s)", prompt: "Who are the tenant(s)?", kind: "list" },
      { name: "Landlord name", prompt: "Who is the landlord?", kind: "text" },
      { name: "Monthly rent", prompt: "What is the monthly rent?", kind: "currency" },
      { name: "Security deposit", prompt: "What is the security deposit amount?", kind: "currency" },
      { name: "Lease start", prompt: "When does the lease start?", kind: "date" },
      { name: "Lease end", prompt: "When does the lease end?", kind: "date" },
      { name: "Pets allowed?", prompt: "Are pets permitted?", kind: "yes_no" },
      { name: "Renewal terms (verbatim)", prompt: "Quote the renewal/extension clause verbatim.", kind: "verbatim" },
    ],
  },
  {
    id: "fa_client_onboarding",
    name: "Client Onboarding Form",
    description:
      "Pull KYC + suitability data across new-client forms — risk tolerance, income, goals.",
    industry: "financial_advisor",
    columns: [
      { name: "Client name", prompt: "Full legal name of the primary client.", kind: "text" },
      { name: "Date of birth", prompt: "Client's date of birth.", kind: "date" },
      { name: "Annual income", prompt: "Stated annual income.", kind: "currency" },
      { name: "Net worth", prompt: "Stated net worth.", kind: "currency" },
      { name: "Risk tolerance", prompt: "Stated risk tolerance level (conservative / moderate / aggressive / etc.).", kind: "text" },
      { name: "Investment objective", prompt: "Primary investment objective.", kind: "text" },
      { name: "Time horizon (years)", prompt: "Investment time horizon in years.", kind: "number" },
      { name: "Beneficiaries", prompt: "Listed beneficiaries.", kind: "list" },
      { name: "Suitability acknowledgment (verbatim)", prompt: "Quote the suitability acknowledgment paragraph verbatim.", kind: "verbatim" },
    ],
  },
  {
    id: "fa_investment_policy",
    name: "Investment Policy Statement",
    description:
      "Standardize IPS data — allocation targets, constraints, review cadence.",
    industry: "financial_advisor",
    columns: [
      { name: "Client", prompt: "Name of client / account.", kind: "text" },
      { name: "Target equity %", prompt: "Target equity allocation percentage.", kind: "number" },
      { name: "Target fixed income %", prompt: "Target fixed income allocation percentage.", kind: "number" },
      { name: "Target alternatives %", prompt: "Target alternatives allocation percentage.", kind: "number" },
      { name: "Rebalancing trigger", prompt: "When does the IPS trigger rebalancing?", kind: "text" },
      { name: "Review frequency", prompt: "How often is the IPS reviewed?", kind: "text" },
      { name: "Restrictions (verbatim)", prompt: "Quote any restricted holdings or sectors verbatim.", kind: "verbatim" },
      { name: "Effective date", prompt: "IPS effective date.", kind: "date" },
    ],
  },
  {
    id: "fa_1099",
    name: "1099 / Tax Form",
    description:
      "Extract reportable amounts across client tax forms — dividends, interest, gains.",
    industry: "financial_advisor",
    columns: [
      { name: "Recipient name", prompt: "Recipient name on the form.", kind: "text" },
      { name: "Tax year", prompt: "Tax year covered.", kind: "number" },
      { name: "Total ordinary dividends", prompt: "Total ordinary dividends reported.", kind: "currency" },
      { name: "Qualified dividends", prompt: "Qualified dividends.", kind: "currency" },
      { name: "Interest income", prompt: "Interest income reported.", kind: "currency" },
      { name: "Capital gains (LT)", prompt: "Long-term capital gains.", kind: "currency" },
      { name: "Capital gains (ST)", prompt: "Short-term capital gains.", kind: "currency" },
      { name: "Federal tax withheld", prompt: "Federal income tax withheld.", kind: "currency" },
    ],
  },
];

export function templatesForIndustry(
  industry: string | null | undefined
): ReviewTemplate[] {
  return TEMPLATES.filter(
    (t) => t.industry === "any" || t.industry === industry
  );
}
