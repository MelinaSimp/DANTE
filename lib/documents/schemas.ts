// Per-document extraction schemas.
//
// Each schema describes what fields we expect to pull out of that
// document type, with a plain-English description used in the LLM
// prompt. The extractor (lib/documents/extract.ts) picks the schema
// by doc_type, renders the prompt, and validates the response shape.
//
// Adding a new doc type:
//   1. Write a DocSchema with fields + rows.
//   2. Register in SCHEMAS.
//   3. Add to the DocType union.
//
// Intentionally not using Zod — the schema is just a description and
// a list of keys. Runtime validation is lightweight (key presence +
// types). Too much ceremony up front makes iteration slower.

export type DocType =
  | "form_1099_b"
  | "form_1099_div"
  | "form_1099_r"
  | "form_w2"
  | "form_k1"
  | "form_5498"
  | "other";

export type FieldSpec = {
  key: string;
  label: string;
  description: string;
  type: "string" | "number" | "date" | "boolean";
  required?: boolean;
};

export type DocSchema = {
  docType: DocType;
  title: string; // Human title for the prompt
  taxYearHint: string; // How to locate the tax year on this form
  fields: FieldSpec[]; // Scalar header fields
  rows?: {
    label: string; // e.g. "transactions" for 1099-B lines
    description: string;
    fields: FieldSpec[];
  };
};

// ---------- Form 1099-B ----------
// Proceeds from broker/barter exchange transactions. The RIA cares
// about this because cost-basis accuracy feeds tax-loss harvesting,
// wash-sale detection, and year-end tax projections.
const FORM_1099_B: DocSchema = {
  docType: "form_1099_b",
  title: "IRS Form 1099-B (Proceeds from Broker and Barter Exchange)",
  taxYearHint:
    "Near the top of the form — look for 'For calendar year 20XX' or a year in the form header.",
  fields: [
    { key: "payer_name", label: "Payer name", description: "The broker or barter exchange who filed the form (e.g. 'Charles Schwab & Co')", type: "string", required: true },
    { key: "payer_tin", label: "Payer TIN", description: "The payer's federal ID number (formatted XX-XXXXXXX)", type: "string" },
    { key: "recipient_name", label: "Recipient name", description: "The taxpayer's name as shown on the form", type: "string", required: true },
    { key: "recipient_tin", label: "Recipient TIN", description: "Last 4 digits only — mask the rest as XXX-XX-####", type: "string" },
    { key: "account_number", label: "Account number", description: "The brokerage account number if printed", type: "string" },
    { key: "tax_year", label: "Tax year", description: "Four-digit year (e.g. 2025)", type: "number", required: true },
    { key: "corrected", label: "Corrected form", description: "True if the CORRECTED box is checked", type: "boolean" },
  ],
  rows: {
    label: "transactions",
    description:
      "One row per transaction line on the 1099-B. A single 1099-B commonly has dozens of these on continuation pages; extract every one.",
    fields: [
      { key: "description", label: "Description of property (Box 1a)", description: "Security description / ticker + share count (e.g. '100 sh VOO')", type: "string", required: true },
      { key: "date_acquired", label: "Date acquired (Box 1b)", description: "ISO date YYYY-MM-DD, or 'VARIOUS' if that's literally printed", type: "string" },
      { key: "date_sold", label: "Date sold (Box 1c)", description: "ISO date YYYY-MM-DD", type: "string", required: true },
      { key: "proceeds", label: "Proceeds (Box 1d)", description: "Dollar amount as a number (no $ sign)", type: "number", required: true },
      { key: "cost_basis", label: "Cost or other basis (Box 1e)", description: "Dollar amount", type: "number" },
      { key: "accrued_market_discount", label: "Accrued market discount (Box 1f)", description: "Dollar amount", type: "number" },
      { key: "wash_sale_loss_disallowed", label: "Wash sale loss disallowed (Box 1g)", description: "Dollar amount", type: "number" },
      { key: "short_or_long_term", label: "Short- or long-term", description: "'short' if Box 2 indicates short-term; 'long' if long-term", type: "string" },
      { key: "basis_reported_to_irs", label: "Basis reported to IRS (Box 12)", description: "True if covered/reported, false if noncovered", type: "boolean" },
    ],
  },
};

// ---------- Stubs for the other forms we'll flesh out next ----------
const FORM_1099_DIV: DocSchema = {
  docType: "form_1099_div",
  title: "IRS Form 1099-DIV (Dividends and Distributions)",
  taxYearHint: "Top of the form — look for the calendar year.",
  fields: [
    { key: "payer_name", label: "Payer name", description: "Broker / mutual fund", type: "string", required: true },
    { key: "recipient_name", label: "Recipient name", description: "Taxpayer name", type: "string", required: true },
    { key: "tax_year", label: "Tax year", description: "Four-digit year", type: "number", required: true },
    { key: "total_ordinary_dividends", label: "Total ordinary dividends (Box 1a)", description: "Dollar amount", type: "number" },
    { key: "qualified_dividends", label: "Qualified dividends (Box 1b)", description: "Dollar amount", type: "number" },
    { key: "total_capital_gain", label: "Total capital gain distr. (Box 2a)", description: "Dollar amount", type: "number" },
    { key: "nondividend_distributions", label: "Nondividend distributions (Box 3)", description: "Dollar amount", type: "number" },
    { key: "foreign_tax_paid", label: "Foreign tax paid (Box 7)", description: "Dollar amount", type: "number" },
  ],
};

const FORM_1099_R: DocSchema = {
  docType: "form_1099_r",
  title: "IRS Form 1099-R (Distributions from Pensions, Annuities, Retirement Plans, IRAs)",
  taxYearHint: "Top of the form.",
  fields: [
    { key: "payer_name", label: "Payer name", description: "Plan custodian or insurer", type: "string", required: true },
    { key: "recipient_name", label: "Recipient name", description: "Taxpayer name", type: "string", required: true },
    { key: "tax_year", label: "Tax year", description: "Four-digit year", type: "number", required: true },
    { key: "gross_distribution", label: "Gross distribution (Box 1)", description: "Dollar amount", type: "number", required: true },
    { key: "taxable_amount", label: "Taxable amount (Box 2a)", description: "Dollar amount", type: "number" },
    { key: "federal_tax_withheld", label: "Federal income tax withheld (Box 4)", description: "Dollar amount", type: "number" },
    { key: "distribution_code", label: "Distribution code (Box 7)", description: "IRS code indicating the type (e.g. '7' for normal, '1' for early)", type: "string" },
    { key: "ira_sep_simple", label: "IRA/SEP/SIMPLE box checked", description: "True if box 7 IRA/SEP/SIMPLE is checked", type: "boolean" },
  ],
};

export const SCHEMAS: Record<DocType, DocSchema | null> = {
  form_1099_b: FORM_1099_B,
  form_1099_div: FORM_1099_DIV,
  form_1099_r: FORM_1099_R,
  form_w2: null,
  form_k1: null,
  form_5498: null,
  other: null,
};

export function getSchema(docType: DocType): DocSchema | null {
  return SCHEMAS[docType] || null;
}
