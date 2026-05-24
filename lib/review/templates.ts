// lib/review/templates.ts
//
// Pre-built review-table templates — Harvey's "one-click workflows"
// pattern. Each template defines a set of columns tailored to a
// document type, so the user can land on /review-tables/new, click
// the template, and get a fully populated wizard ready to point at
// docs.
//
// Templates are CRE-focused: listing / purchase / closing / lease
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
  industry: "real_estate" | "any";
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
];

export function templatesForIndustry(
  industry: string | null | undefined
): ReviewTemplate[] {
  return TEMPLATES.filter(
    (t) => t.industry === "any" || t.industry === industry
  );
}
