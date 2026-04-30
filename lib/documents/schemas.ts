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
//
// ── Schema coverage (Phase 1 of the RIA build-out) ────────────────
//
// Tax forms:
//   form_1040        — federal income tax return
//   form_k1          — partnership / S-corp / trust pass-through
//   form_w2          — wage & tax statement
//   form_1099_b      — broker proceeds (cost basis, wash sales)
//   form_1099_div    — dividends & distributions
//   form_1099_int    — interest income
//   form_1099_misc   — miscellaneous income
//   form_1099_nec    — non-employee compensation
//   form_1099_r      — pension / IRA distributions
//   form_5498        — IRA contribution information
//   form_ssa_1099    — Social Security benefit statement
//
// Estate planning:
//   trust_document   — revocable / irrevocable trust agreements
//   beneficiary_form — beneficiary designation forms
//
// Retirement:
//   retirement_statement — 401(k) / 403(b) / IRA periodic statement
//
// Insurance:
//   insurance_policy — life / disability / LTC / annuity declarations

export type DocType =
  // Tax — federal income
  | "form_1040"
  | "form_k1"
  | "form_w2"
  // Tax — 1099 family
  | "form_1099_b"
  | "form_1099_div"
  | "form_1099_int"
  | "form_1099_misc"
  | "form_1099_nec"
  | "form_1099_r"
  | "form_5498"
  | "form_ssa_1099"
  // Estate planning
  | "trust_document"
  | "beneficiary_form"
  // Retirement
  | "retirement_statement"
  // Insurance
  | "insurance_policy"
  // Catch-all
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

// ============================================================
// TAX — federal income forms
// ============================================================

// ---------- Form 1040 ----------
// The federal individual income tax return. The line-item totals here
// are the single highest-leverage data we ingest: AGI drives Roth
// conversion math, taxable income drives bracket planning, capital
// gains drive TLH, and itemized vs. standard deduction drives charitable
// strategies. Schedules A/B/C/D/E reference 1040 line numbers, so the
// extractor is most useful when it captures the headline lines first.
const FORM_1040: DocSchema = {
  docType: "form_1040",
  title: "IRS Form 1040 (U.S. Individual Income Tax Return)",
  taxYearHint:
    "Top of the form — 'For the year Jan. 1 – Dec. 31, 20XX'. Look in the upper-right header.",
  fields: [
    { key: "tax_year", label: "Tax year", description: "Four-digit year (e.g. 2024)", type: "number", required: true },
    { key: "filing_status", label: "Filing status", description: "One of: 'single', 'mfj' (married filing jointly), 'mfs' (married filing separately), 'hoh' (head of household), 'qss' (qualifying surviving spouse)", type: "string", required: true },
    { key: "taxpayer_name", label: "Taxpayer name", description: "Primary taxpayer's full name as printed", type: "string", required: true },
    { key: "taxpayer_ssn", label: "Taxpayer SSN", description: "Last 4 digits only — mask the rest as XXX-XX-####", type: "string" },
    { key: "spouse_name", label: "Spouse name", description: "Spouse's full name if MFJ/MFS, else null", type: "string" },
    { key: "spouse_ssn", label: "Spouse SSN", description: "Last 4 digits only, masked", type: "string" },
    { key: "dependents_count", label: "Number of dependents", description: "Count of dependents listed on the form", type: "number" },
    { key: "wages", label: "Wages, salaries, tips (Line 1a)", description: "Dollar amount", type: "number" },
    { key: "taxable_interest", label: "Taxable interest (Line 2b)", description: "Dollar amount", type: "number" },
    { key: "tax_exempt_interest", label: "Tax-exempt interest (Line 2a)", description: "Dollar amount", type: "number" },
    { key: "ordinary_dividends", label: "Ordinary dividends (Line 3b)", description: "Dollar amount", type: "number" },
    { key: "qualified_dividends", label: "Qualified dividends (Line 3a)", description: "Dollar amount", type: "number" },
    { key: "ira_distributions", label: "IRA distributions taxable (Line 4b)", description: "Dollar amount", type: "number" },
    { key: "pensions_taxable", label: "Pensions/annuities taxable (Line 5b)", description: "Dollar amount", type: "number" },
    { key: "social_security_taxable", label: "Social Security taxable (Line 6b)", description: "Dollar amount", type: "number" },
    { key: "capital_gain_loss", label: "Capital gain or loss (Line 7)", description: "Dollar amount; can be negative", type: "number" },
    { key: "total_income", label: "Total income (Line 9)", description: "Dollar amount", type: "number" },
    { key: "adjustments", label: "Adjustments to income (Line 10)", description: "Dollar amount", type: "number" },
    { key: "agi", label: "Adjusted gross income (Line 11)", description: "Dollar amount", type: "number", required: true },
    { key: "standard_or_itemized", label: "Standard or itemized", description: "'standard' if standard deduction taken, 'itemized' if Schedule A used", type: "string" },
    { key: "deduction_amount", label: "Deduction amount (Line 12)", description: "Dollar amount of standard or itemized deduction", type: "number" },
    { key: "qbi_deduction", label: "QBI deduction (Line 13)", description: "Dollar amount", type: "number" },
    { key: "taxable_income", label: "Taxable income (Line 15)", description: "Dollar amount", type: "number", required: true },
    { key: "total_tax", label: "Total tax (Line 24)", description: "Dollar amount", type: "number" },
    { key: "federal_withholding", label: "Federal income tax withheld (Line 25a)", description: "Dollar amount", type: "number" },
    { key: "estimated_payments", label: "Estimated tax payments (Line 26)", description: "Dollar amount", type: "number" },
    { key: "refund_or_owed", label: "Refund or amount owed", description: "'refund' if Line 34 has a value, 'owed' if Line 37 has a value", type: "string" },
    { key: "refund_amount", label: "Refund amount (Line 35a)", description: "Dollar amount; null if owed", type: "number" },
    { key: "amount_owed", label: "Amount owed (Line 37)", description: "Dollar amount; null if refund", type: "number" },
  ],
};

// ---------- Schedule K-1 ----------
// Pass-through income from partnerships (1065), S-corps (1120-S), or
// trusts/estates (1041). Critical for advisors with business-owner
// clients — K-1 income flows into 1040 lines 3, 5, 7, 17, 21, etc.,
// and the timing of distributions vs. allocations is a planning lever.
const FORM_K1: DocSchema = {
  docType: "form_k1",
  title: "IRS Schedule K-1 (Partner/Shareholder/Beneficiary Share)",
  taxYearHint:
    "Top of the form — 'For calendar year 20XX'. K-1s are issued by entities, so the tax year may also appear with the entity name.",
  fields: [
    { key: "tax_year", label: "Tax year", description: "Four-digit year", type: "number", required: true },
    { key: "k1_form_type", label: "K-1 form type", description: "'1065' (partnership), '1120s' (S-corp), or '1041' (trust/estate). Look at the form header.", type: "string", required: true },
    { key: "entity_name", label: "Entity name", description: "Partnership / S-corp / trust name (Part I)", type: "string", required: true },
    { key: "entity_ein", label: "Entity EIN", description: "Federal ID number, formatted XX-XXXXXXX", type: "string" },
    { key: "recipient_name", label: "Recipient name", description: "Partner / shareholder / beneficiary name (Part II)", type: "string", required: true },
    { key: "recipient_tin", label: "Recipient TIN", description: "Last 4 digits only, masked", type: "string" },
    { key: "ownership_percent", label: "Ownership / profit-share percentage", description: "Percent value (e.g. 25.0 for 25%); null if not stated", type: "number" },
    { key: "ordinary_business_income", label: "Ordinary business income/loss (Box 1)", description: "Dollar amount; can be negative", type: "number" },
    { key: "rental_real_estate_income", label: "Net rental real estate income (Box 2)", description: "Dollar amount", type: "number" },
    { key: "interest_income", label: "Interest income (Box 5)", description: "Dollar amount", type: "number" },
    { key: "ordinary_dividends", label: "Ordinary dividends (Box 6a)", description: "Dollar amount", type: "number" },
    { key: "qualified_dividends", label: "Qualified dividends (Box 6b)", description: "Dollar amount", type: "number" },
    { key: "royalties", label: "Royalties (Box 7)", description: "Dollar amount", type: "number" },
    { key: "net_short_term_capital_gain", label: "Net short-term capital gain", description: "Dollar amount", type: "number" },
    { key: "net_long_term_capital_gain", label: "Net long-term capital gain", description: "Dollar amount", type: "number" },
    { key: "section_179_deduction", label: "Section 179 deduction", description: "Dollar amount", type: "number" },
    { key: "qbi_qualified", label: "QBI-qualified income", description: "True if any boxes are flagged Section 199A qualified business income", type: "boolean" },
    { key: "distributions", label: "Distributions / cash distributions", description: "Dollar amount of actual cash distributed to the partner during the year", type: "number" },
  ],
};

// ---------- Form W-2 ----------
// Wage and tax statement. Drives 1040 Line 1a and federal withholding.
// The 401(k)/Roth 401(k) figures in Box 12 (codes D, AA, BB, EE) are
// the data point for retirement-savings rate analysis — surprisingly
// hard to get from anywhere else.
const FORM_W2: DocSchema = {
  docType: "form_w2",
  title: "IRS Form W-2 (Wage and Tax Statement)",
  taxYearHint: "Top-right corner of the form — the year in large print.",
  fields: [
    { key: "tax_year", label: "Tax year", description: "Four-digit year", type: "number", required: true },
    { key: "employer_name", label: "Employer name", description: "Box C — employer's name", type: "string", required: true },
    { key: "employer_ein", label: "Employer EIN", description: "Box B, formatted XX-XXXXXXX", type: "string" },
    { key: "employee_name", label: "Employee name", description: "Box E — employee's full name", type: "string", required: true },
    { key: "employee_ssn", label: "Employee SSN", description: "Box A, last 4 digits only", type: "string" },
    { key: "wages", label: "Wages, tips, other compensation (Box 1)", description: "Dollar amount", type: "number", required: true },
    { key: "federal_withholding", label: "Federal income tax withheld (Box 2)", description: "Dollar amount", type: "number" },
    { key: "social_security_wages", label: "Social Security wages (Box 3)", description: "Dollar amount", type: "number" },
    { key: "social_security_tax", label: "Social Security tax withheld (Box 4)", description: "Dollar amount", type: "number" },
    { key: "medicare_wages", label: "Medicare wages (Box 5)", description: "Dollar amount", type: "number" },
    { key: "medicare_tax", label: "Medicare tax withheld (Box 6)", description: "Dollar amount", type: "number" },
    { key: "retirement_401k", label: "401(k) elective deferrals (Box 12, code D)", description: "Dollar amount", type: "number" },
    { key: "retirement_403b", label: "403(b) elective deferrals (Box 12, code E)", description: "Dollar amount", type: "number" },
    { key: "roth_401k", label: "Roth 401(k) contributions (Box 12, code AA)", description: "Dollar amount", type: "number" },
    { key: "roth_403b", label: "Roth 403(b) contributions (Box 12, code BB)", description: "Dollar amount", type: "number" },
    { key: "hsa_contribution", label: "HSA contribution (Box 12, code W)", description: "Dollar amount — employer + employee combined", type: "number" },
    { key: "dependent_care", label: "Dependent care benefits (Box 10)", description: "Dollar amount", type: "number" },
    { key: "retirement_plan_box13", label: "Retirement plan box (Box 13)", description: "True if 'Retirement plan' box is checked — affects IRA deduction limits", type: "boolean" },
    { key: "state_wages", label: "State wages (Box 16)", description: "Dollar amount", type: "number" },
    { key: "state_withholding", label: "State income tax (Box 17)", description: "Dollar amount", type: "number" },
    { key: "state_code", label: "State code (Box 15)", description: "Two-letter state abbreviation (e.g. 'CA')", type: "string" },
  ],
};

// ============================================================
// TAX — 1099 family
// ============================================================

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

// ---------- Form 1099-DIV ----------
const FORM_1099_DIV: DocSchema = {
  docType: "form_1099_div",
  title: "IRS Form 1099-DIV (Dividends and Distributions)",
  taxYearHint: "Top of the form — look for the calendar year.",
  fields: [
    { key: "payer_name", label: "Payer name", description: "Broker / mutual fund", type: "string", required: true },
    { key: "recipient_name", label: "Recipient name", description: "Taxpayer name", type: "string", required: true },
    { key: "recipient_tin", label: "Recipient TIN", description: "Last 4 digits only, masked", type: "string" },
    { key: "account_number", label: "Account number", description: "Brokerage account number", type: "string" },
    { key: "tax_year", label: "Tax year", description: "Four-digit year", type: "number", required: true },
    { key: "total_ordinary_dividends", label: "Total ordinary dividends (Box 1a)", description: "Dollar amount", type: "number" },
    { key: "qualified_dividends", label: "Qualified dividends (Box 1b)", description: "Dollar amount", type: "number" },
    { key: "total_capital_gain", label: "Total capital gain distr. (Box 2a)", description: "Dollar amount", type: "number" },
    { key: "unrecap_section_1250", label: "Unrecaptured Sec. 1250 gain (Box 2b)", description: "Dollar amount", type: "number" },
    { key: "section_199a_dividends", label: "Section 199A dividends (Box 5)", description: "Dollar amount; QBI-eligible", type: "number" },
    { key: "nondividend_distributions", label: "Nondividend distributions (Box 3)", description: "Dollar amount", type: "number" },
    { key: "federal_withholding", label: "Federal income tax withheld (Box 4)", description: "Dollar amount", type: "number" },
    { key: "foreign_tax_paid", label: "Foreign tax paid (Box 7)", description: "Dollar amount", type: "number" },
    { key: "exempt_interest_dividends", label: "Exempt-interest dividends (Box 12)", description: "Dollar amount; muni-fund distributions", type: "number" },
  ],
};

// ---------- Form 1099-INT ----------
const FORM_1099_INT: DocSchema = {
  docType: "form_1099_int",
  title: "IRS Form 1099-INT (Interest Income)",
  taxYearHint: "Top of the form.",
  fields: [
    { key: "payer_name", label: "Payer name", description: "Bank, broker, or other interest payer", type: "string", required: true },
    { key: "recipient_name", label: "Recipient name", description: "Taxpayer name", type: "string", required: true },
    { key: "recipient_tin", label: "Recipient TIN", description: "Last 4 digits only, masked", type: "string" },
    { key: "tax_year", label: "Tax year", description: "Four-digit year", type: "number", required: true },
    { key: "interest_income", label: "Interest income (Box 1)", description: "Dollar amount", type: "number", required: true },
    { key: "early_withdrawal_penalty", label: "Early withdrawal penalty (Box 2)", description: "Dollar amount", type: "number" },
    { key: "us_treasury_interest", label: "Interest on U.S. savings bonds & Treasury (Box 3)", description: "Dollar amount; state-tax-exempt", type: "number" },
    { key: "federal_withholding", label: "Federal income tax withheld (Box 4)", description: "Dollar amount", type: "number" },
    { key: "investment_expenses", label: "Investment expenses (Box 5)", description: "Dollar amount", type: "number" },
    { key: "foreign_tax_paid", label: "Foreign tax paid (Box 6)", description: "Dollar amount", type: "number" },
    { key: "tax_exempt_interest", label: "Tax-exempt interest (Box 8)", description: "Dollar amount; muni-bond interest", type: "number" },
    { key: "specified_private_activity", label: "Specified private activity bond interest (Box 9)", description: "Dollar amount; AMT preference item", type: "number" },
  ],
};

// ---------- Form 1099-MISC ----------
const FORM_1099_MISC: DocSchema = {
  docType: "form_1099_misc",
  title: "IRS Form 1099-MISC (Miscellaneous Information)",
  taxYearHint: "Top of the form.",
  fields: [
    { key: "payer_name", label: "Payer name", description: "Payer of miscellaneous income", type: "string", required: true },
    { key: "recipient_name", label: "Recipient name", description: "Taxpayer name", type: "string", required: true },
    { key: "tax_year", label: "Tax year", description: "Four-digit year", type: "number", required: true },
    { key: "rents", label: "Rents (Box 1)", description: "Dollar amount", type: "number" },
    { key: "royalties", label: "Royalties (Box 2)", description: "Dollar amount", type: "number" },
    { key: "other_income", label: "Other income (Box 3)", description: "Dollar amount", type: "number" },
    { key: "federal_withholding", label: "Federal income tax withheld (Box 4)", description: "Dollar amount", type: "number" },
    { key: "fishing_boat_proceeds", label: "Fishing boat proceeds (Box 5)", description: "Dollar amount", type: "number" },
    { key: "medical_health_payments", label: "Medical and health care payments (Box 6)", description: "Dollar amount", type: "number" },
    { key: "substitute_payments", label: "Substitute payments in lieu of dividends (Box 8)", description: "Dollar amount", type: "number" },
    { key: "crop_insurance_proceeds", label: "Crop insurance proceeds (Box 9)", description: "Dollar amount", type: "number" },
    { key: "gross_attorney_proceeds", label: "Gross proceeds paid to an attorney (Box 10)", description: "Dollar amount", type: "number" },
  ],
};

// ---------- Form 1099-NEC ----------
const FORM_1099_NEC: DocSchema = {
  docType: "form_1099_nec",
  title: "IRS Form 1099-NEC (Nonemployee Compensation)",
  taxYearHint: "Top of the form.",
  fields: [
    { key: "payer_name", label: "Payer name", description: "Payer who issued the form", type: "string", required: true },
    { key: "payer_tin", label: "Payer TIN", description: "Federal ID, formatted XX-XXXXXXX", type: "string" },
    { key: "recipient_name", label: "Recipient name", description: "Taxpayer name", type: "string", required: true },
    { key: "recipient_tin", label: "Recipient TIN", description: "Last 4 digits only, masked", type: "string" },
    { key: "tax_year", label: "Tax year", description: "Four-digit year", type: "number", required: true },
    { key: "nonemployee_compensation", label: "Nonemployee compensation (Box 1)", description: "Dollar amount; flows to Schedule C", type: "number", required: true },
    { key: "federal_withholding", label: "Federal income tax withheld (Box 4)", description: "Dollar amount", type: "number" },
  ],
};

// ---------- Form 1099-R ----------
const FORM_1099_R: DocSchema = {
  docType: "form_1099_r",
  title: "IRS Form 1099-R (Distributions from Pensions, Annuities, Retirement Plans, IRAs)",
  taxYearHint: "Top of the form.",
  fields: [
    { key: "payer_name", label: "Payer name", description: "Plan custodian or insurer", type: "string", required: true },
    { key: "recipient_name", label: "Recipient name", description: "Taxpayer name", type: "string", required: true },
    { key: "recipient_tin", label: "Recipient TIN", description: "Last 4 digits only, masked", type: "string" },
    { key: "account_number", label: "Account number", description: "Account number if printed", type: "string" },
    { key: "tax_year", label: "Tax year", description: "Four-digit year", type: "number", required: true },
    { key: "gross_distribution", label: "Gross distribution (Box 1)", description: "Dollar amount", type: "number", required: true },
    { key: "taxable_amount", label: "Taxable amount (Box 2a)", description: "Dollar amount", type: "number" },
    { key: "taxable_amount_not_determined", label: "Taxable amount not determined (Box 2b)", description: "True if the box is checked", type: "boolean" },
    { key: "total_distribution", label: "Total distribution (Box 2b)", description: "True if the 'Total distribution' box is checked", type: "boolean" },
    { key: "federal_tax_withheld", label: "Federal income tax withheld (Box 4)", description: "Dollar amount", type: "number" },
    { key: "employee_contributions", label: "Employee contributions / Roth basis (Box 5)", description: "Dollar amount", type: "number" },
    { key: "distribution_code", label: "Distribution code (Box 7)", description: "IRS code indicating the type (e.g. '7' for normal, '1' for early, 'G' for direct rollover, 'B' for designated Roth, 'Q' for qualified Roth)", type: "string" },
    { key: "ira_sep_simple", label: "IRA/SEP/SIMPLE box checked", description: "True if box 7 IRA/SEP/SIMPLE is checked", type: "boolean" },
    { key: "rollover_amount", label: "Amount allocable to IRR within 5 years (Box 10)", description: "Dollar amount", type: "number" },
  ],
};

// ---------- Form 5498 ----------
// IRA contribution information. Critical because contributions limit
// how much room remains for current-year contributions, and rollover
// info shows what came from a 401(k) → IRA, which affects the pro-rata
// rule for backdoor Roth.
const FORM_5498: DocSchema = {
  docType: "form_5498",
  title: "IRS Form 5498 (IRA Contribution Information)",
  taxYearHint: "Top of the form.",
  fields: [
    { key: "trustee_name", label: "Trustee/issuer name", description: "IRA custodian name", type: "string", required: true },
    { key: "participant_name", label: "Participant name", description: "IRA owner name", type: "string", required: true },
    { key: "participant_tin", label: "Participant TIN", description: "Last 4 digits only, masked", type: "string" },
    { key: "account_number", label: "Account number", description: "IRA account number", type: "string" },
    { key: "tax_year", label: "Tax year", description: "Four-digit year", type: "number", required: true },
    { key: "ira_type", label: "IRA type", description: "One of: 'traditional', 'roth', 'sep', 'simple', based on which box is checked (Boxes 7)", type: "string", required: true },
    { key: "ira_contributions", label: "IRA contributions (Box 1)", description: "Dollar amount of traditional IRA contributions for the tax year", type: "number" },
    { key: "rollover_contributions", label: "Rollover contributions (Box 2)", description: "Dollar amount", type: "number" },
    { key: "roth_conversion_amount", label: "Roth IRA conversion amount (Box 3)", description: "Dollar amount", type: "number" },
    { key: "recharacterized_contributions", label: "Recharacterized contributions (Box 4)", description: "Dollar amount", type: "number" },
    { key: "fmv_of_account", label: "Fair market value of account (Box 5)", description: "Year-end FMV; used for next year's RMD calculation", type: "number", required: true },
    { key: "life_insurance_cost", label: "Life insurance cost (Box 6)", description: "Dollar amount", type: "number" },
    { key: "sep_contributions", label: "SEP contributions (Box 8)", description: "Dollar amount", type: "number" },
    { key: "simple_contributions", label: "SIMPLE contributions (Box 9)", description: "Dollar amount", type: "number" },
    { key: "roth_contributions", label: "Roth IRA contributions (Box 10)", description: "Dollar amount", type: "number" },
    { key: "rmd_required", label: "RMD required next year (Box 11)", description: "True if the Required Minimum Distribution box is checked", type: "boolean" },
    { key: "rmd_amount", label: "RMD amount (Box 12b)", description: "Dollar amount of next year's required RMD if reported", type: "number" },
    { key: "postponed_contribution", label: "Postponed contribution (Box 13a)", description: "Dollar amount", type: "number" },
  ],
};

// ---------- Form SSA-1099 ----------
// Social Security benefit statement. Drives the Social Security
// taxability calculation (up to 85% of benefits taxable depending on
// provisional income). Also informs claiming-strategy retrospectives.
const FORM_SSA_1099: DocSchema = {
  docType: "form_ssa_1099",
  title: "Form SSA-1099 (Social Security Benefit Statement)",
  taxYearHint: "Top of the form — '20XX' under the title.",
  fields: [
    { key: "tax_year", label: "Tax year", description: "Four-digit year", type: "number", required: true },
    { key: "beneficiary_name", label: "Beneficiary name", description: "Name on the form", type: "string", required: true },
    { key: "beneficiary_ssn", label: "Beneficiary SSN", description: "Last 4 digits only, masked", type: "string" },
    { key: "benefits_paid", label: "Benefits paid (Box 3)", description: "Total Social Security benefits paid in the year — dollar amount", type: "number", required: true },
    { key: "benefits_repaid", label: "Benefits repaid (Box 4)", description: "Dollar amount", type: "number" },
    { key: "net_benefits", label: "Net benefits (Box 5)", description: "Box 3 minus Box 4 — flows to 1040 Line 6a", type: "number", required: true },
    { key: "voluntary_federal_withholding", label: "Voluntary federal income tax withheld (Box 6)", description: "Dollar amount", type: "number" },
    { key: "medicare_premiums", label: "Medicare premiums (Description of Amount in Box 3)", description: "Dollar amount of Part B/D premiums deducted — useful for IRMAA tracking", type: "number" },
  ],
};

// ============================================================
// ESTATE PLANNING
// ============================================================

// ---------- Trust document ----------
// Revocable / irrevocable trust agreements. The structure varies
// wildly — there's no IRS form to anchor to — so the schema captures
// the fields advisors actually need: who's in charge, who gets what,
// how income is distributed. Free-form clause text is captured in
// 'distribution_standard' and 'special_provisions' so a search later
// can surface "trusts that include HEMS language" or "trusts naming
// the spouse as primary trustee".
const TRUST_DOCUMENT: DocSchema = {
  docType: "trust_document",
  title: "Trust Agreement",
  taxYearHint: "Trusts don't have a tax year. Use the execution date instead.",
  fields: [
    { key: "trust_name", label: "Trust name", description: "Full legal name of the trust (e.g. 'The Henderson Family Revocable Trust dated 3/14/2018')", type: "string", required: true },
    { key: "trust_type", label: "Trust type", description: "One of: 'revocable', 'irrevocable', 'testamentary', 'living', 'charitable_remainder', 'charitable_lead', 'ilit', 'slat', 'qtip', 'bypass', 'special_needs', 'other'. Pick the most specific type the document supports.", type: "string", required: true },
    { key: "execution_date", label: "Execution date", description: "Date the trust was signed/executed (ISO YYYY-MM-DD)", type: "date", required: true },
    { key: "governing_state", label: "Governing state", description: "Two-letter state abbreviation (e.g. 'CA', 'FL') of the governing law clause", type: "string" },
    { key: "grantor_names", label: "Grantor / settlor names", description: "Comma-separated list of grantor / settlor / trustor names", type: "string", required: true },
    { key: "primary_trustee", label: "Primary trustee", description: "Name of the initial / current trustee", type: "string", required: true },
    { key: "successor_trustees", label: "Successor trustees", description: "Comma-separated list of successor trustees in order of succession", type: "string" },
    { key: "primary_beneficiaries", label: "Primary beneficiaries", description: "Comma-separated list of primary beneficiary names", type: "string", required: true },
    { key: "contingent_beneficiaries", label: "Contingent beneficiaries", description: "Comma-separated list of contingent / remainder beneficiary names", type: "string" },
    { key: "distribution_standard", label: "Distribution standard", description: "The standard governing trustee distributions, e.g. 'HEMS' (health, education, maintenance, support), 'absolute discretion', 'income only', 'unitrust 5%'. Quote the document if unclear.", type: "string" },
    { key: "income_distribution", label: "Income distribution rule", description: "How income is distributed: 'all_to_grantor' (revocable), 'discretionary', 'mandatory_to_beneficiary', 'accumulate'", type: "string" },
    { key: "is_grantor_trust", label: "Grantor trust for tax purposes", description: "True if the document specifies grantor-trust status (income taxed to grantor)", type: "boolean" },
    { key: "tax_id", label: "Trust tax ID (EIN)", description: "Federal EIN if assigned to the trust", type: "string" },
    { key: "amendment_count", label: "Number of amendments referenced", description: "Count of amendments mentioned in the document", type: "number" },
    { key: "spendthrift_clause", label: "Spendthrift clause present", description: "True if the document contains a spendthrift / creditor-protection clause", type: "boolean" },
    { key: "no_contest_clause", label: "No-contest (in terrorem) clause present", description: "True if there's a no-contest clause", type: "boolean" },
    { key: "special_provisions", label: "Special provisions", description: "Free-text notes on anything unusual: GST tax allocations, GRAT terms, charitable provisions, special-needs language, etc. Up to 500 words, quote where possible.", type: "string" },
  ],
};

// ---------- Beneficiary designation form ----------
// The fact that 60% of beneficiary designations are out-of-date or
// inconsistent with the estate plan is a perennial RIA finding. This
// schema makes that detectable: extract the designations on every
// account, cross-reference against the trust beneficiaries.
const BENEFICIARY_FORM: DocSchema = {
  docType: "beneficiary_form",
  title: "Beneficiary Designation Form",
  taxYearHint:
    "Beneficiary forms don't have a tax year. Use the form date or last-updated date.",
  fields: [
    { key: "form_date", label: "Form date / signature date", description: "ISO YYYY-MM-DD of the signature or last update", type: "date", required: true },
    { key: "account_owner", label: "Account owner", description: "Name of the account holder", type: "string", required: true },
    { key: "account_owner_tin", label: "Account owner TIN", description: "Last 4 digits only, masked", type: "string" },
    { key: "custodian", label: "Custodian / institution", description: "Bank, broker, insurer, or plan name (e.g. 'Charles Schwab', 'Fidelity', 'Northwestern Mutual')", type: "string", required: true },
    { key: "account_number", label: "Account number", description: "Account or policy number", type: "string" },
    { key: "account_type", label: "Account type", description: "One of: 'traditional_ira', 'roth_ira', 'sep_ira', 'simple_ira', '401k', '403b', '457', 'pension', 'life_insurance', 'annuity', 'tod_brokerage', 'pod_bank', 'hsa', 'other'", type: "string", required: true },
  ],
  rows: {
    label: "designations",
    description:
      "One row per named beneficiary, primary or contingent. Capture every line.",
    fields: [
      { key: "tier", label: "Tier", description: "'primary' or 'contingent'", type: "string", required: true },
      { key: "beneficiary_name", label: "Beneficiary name", description: "Full name as printed (or 'Estate of [owner]' if estate is named)", type: "string", required: true },
      { key: "relationship", label: "Relationship", description: "Relationship to the account owner if stated (e.g. 'spouse', 'son', 'trust')", type: "string" },
      { key: "percent", label: "Percentage", description: "Allocation percentage (0–100). Primary tier should sum to 100; contingent tier should sum to 100.", type: "number", required: true },
      { key: "is_per_stirpes", label: "Per stirpes", description: "True if 'per stirpes' is indicated for this beneficiary", type: "boolean" },
      { key: "is_trust", label: "Beneficiary is a trust", description: "True if the beneficiary is a trust (e.g. 'The Smith Family Trust')", type: "boolean" },
      { key: "date_of_birth", label: "Date of birth", description: "ISO YYYY-MM-DD if the form requires DOB and it's printed", type: "string" },
      { key: "tin_last_4", label: "TIN last 4", description: "Last 4 digits of the beneficiary's SSN/EIN if printed", type: "string" },
    ],
  },
};

// ============================================================
// RETIREMENT
// ============================================================

// ---------- Retirement statement ----------
// A unified schema for periodic statements from 401(k), 403(b),
// 457(b), pension, and IRA accounts. The shape is similar enough
// across plan types that one schema covers them. Key data: balance,
// contribution rate, vesting, holdings, employer match.
const RETIREMENT_STATEMENT: DocSchema = {
  docType: "retirement_statement",
  title: "Retirement Account Statement (401(k) / 403(b) / 457 / IRA / Pension)",
  taxYearHint:
    "Statements have a period (e.g. 'Q4 2024' or '12/1/24 – 12/31/24'). Use the period-end year as tax_year.",
  fields: [
    { key: "tax_year", label: "Statement period year", description: "Four-digit year of the statement-period end date", type: "number", required: true },
    { key: "period_start", label: "Period start", description: "ISO YYYY-MM-DD of the statement period start", type: "date" },
    { key: "period_end", label: "Period end", description: "ISO YYYY-MM-DD of the statement period end", type: "date", required: true },
    { key: "custodian", label: "Custodian / recordkeeper", description: "Plan recordkeeper or IRA custodian name (e.g. 'Fidelity', 'Vanguard', 'Empower')", type: "string", required: true },
    { key: "plan_name", label: "Plan name", description: "Employer plan name if applicable (e.g. 'ACME CORP 401(K) PLAN')", type: "string" },
    { key: "account_type", label: "Account type", description: "One of: 'traditional_401k', 'roth_401k', '403b', '457b', 'traditional_ira', 'roth_ira', 'sep_ira', 'simple_ira', 'pension', 'cash_balance', 'other'", type: "string", required: true },
    { key: "participant_name", label: "Participant / account-holder name", description: "Name of the account owner", type: "string", required: true },
    { key: "account_number", label: "Account number", description: "Account or plan-participant number, masked if it includes SSN", type: "string" },
    { key: "beginning_balance", label: "Beginning balance", description: "Account value at period start — dollar amount", type: "number" },
    { key: "ending_balance", label: "Ending balance", description: "Account value at period end — dollar amount", type: "number", required: true },
    { key: "employee_contributions_period", label: "Employee contributions (period)", description: "Dollar amount contributed by the employee this period", type: "number" },
    { key: "employee_contributions_ytd", label: "Employee contributions (YTD)", description: "Year-to-date employee contributions", type: "number" },
    { key: "employer_match_period", label: "Employer match (period)", description: "Dollar amount of employer match this period", type: "number" },
    { key: "employer_match_ytd", label: "Employer match (YTD)", description: "Year-to-date employer match", type: "number" },
    { key: "roth_balance", label: "Roth source balance", description: "Portion of ending balance attributable to Roth contributions, if reported", type: "number" },
    { key: "pretax_balance", label: "Pre-tax source balance", description: "Portion of ending balance from pre-tax contributions, if reported", type: "number" },
    { key: "after_tax_balance", label: "After-tax (non-Roth) source balance", description: "Portion of ending balance from after-tax non-Roth contributions, if reported (relevant for mega-backdoor analysis)", type: "number" },
    { key: "vested_balance", label: "Vested balance", description: "Dollar amount currently vested", type: "number" },
    { key: "vesting_percent", label: "Vesting percent", description: "Overall vesting percentage if reported (0–100)", type: "number" },
    { key: "loan_balance", label: "Outstanding loan balance", description: "Dollar amount of any outstanding plan loan", type: "number" },
    { key: "deferral_rate", label: "Current deferral rate", description: "Employee deferral rate as a percent (e.g. 6.0 for 6%)", type: "number" },
    { key: "rmd_due", label: "RMD due this year", description: "Dollar amount of required minimum distribution this year, if reported", type: "number" },
  ],
  rows: {
    label: "holdings",
    description:
      "One row per holding shown on the statement. Many statements have a holdings or 'investments' section listing each fund. Extract every line.",
    fields: [
      { key: "fund_name", label: "Fund name", description: "Fund or investment name (e.g. 'Vanguard Target Retirement 2045')", type: "string", required: true },
      { key: "ticker", label: "Ticker", description: "Symbol if printed (e.g. 'VTIVX')", type: "string" },
      { key: "shares", label: "Shares / units", description: "Number of shares or units held", type: "number" },
      { key: "price", label: "Price per share", description: "Per-share NAV", type: "number" },
      { key: "market_value", label: "Market value", description: "Dollar amount of position at period end", type: "number", required: true },
      { key: "allocation_percent", label: "Allocation percent", description: "Position as a percent of the account (0–100)", type: "number" },
      { key: "asset_class", label: "Asset class", description: "If labeled, the fund's asset class (e.g. 'large-cap blend', 'core bond', 'target-date')", type: "string" },
    ],
  },
};

// ============================================================
// INSURANCE
// ============================================================

// ---------- Insurance policy ----------
// Life / disability / LTC / annuity declarations pages. The
// declarations page is the part with the carrier, owner, insured,
// face amount, premium, and beneficiaries. Extracting these makes
// the beneficiary-mismatch detector possible.
const INSURANCE_POLICY: DocSchema = {
  docType: "insurance_policy",
  title: "Insurance Policy (Life / Disability / LTC / Annuity declarations)",
  taxYearHint: "Insurance policies don't have a tax year. Use the issue date or current period.",
  fields: [
    { key: "policy_type", label: "Policy type", description: "One of: 'term_life', 'whole_life', 'universal_life', 'variable_universal_life', 'indexed_universal_life', 'disability_income', 'long_term_care', 'fixed_annuity', 'variable_annuity', 'fixed_indexed_annuity', 'immediate_annuity', 'other'", type: "string", required: true },
    { key: "carrier", label: "Carrier / insurance company", description: "Insurer name (e.g. 'Northwestern Mutual', 'Lincoln Financial')", type: "string", required: true },
    { key: "policy_number", label: "Policy number", description: "Policy or contract number", type: "string", required: true },
    { key: "issue_date", label: "Issue date", description: "Policy issue date (ISO YYYY-MM-DD)", type: "date" },
    { key: "policy_owner", label: "Policy owner", description: "Name of the owner (may differ from insured)", type: "string", required: true },
    { key: "insured_name", label: "Insured / annuitant name", description: "Name of the insured person or annuitant", type: "string", required: true },
    { key: "insured_dob", label: "Insured date of birth", description: "ISO YYYY-MM-DD if printed", type: "date" },
    { key: "face_amount", label: "Death benefit / face amount", description: "Life: face amount. Annuity: account value or guaranteed death benefit. Dollar amount.", type: "number" },
    { key: "cash_value", label: "Current cash value", description: "Dollar amount; null for term life and pure DI/LTC", type: "number" },
    { key: "premium_amount", label: "Premium amount", description: "Dollar amount per premium period", type: "number" },
    { key: "premium_frequency", label: "Premium frequency", description: "One of: 'monthly', 'quarterly', 'semiannual', 'annual', 'single', 'paid_up'", type: "string" },
    { key: "premium_paid_through", label: "Premium paid-through date", description: "ISO YYYY-MM-DD", type: "date" },
    { key: "term_length_years", label: "Term length (years)", description: "For term life: length of the level-premium period. For DI/LTC: benefit period in years if applicable.", type: "number" },
    { key: "guaranteed_interest_rate", label: "Guaranteed interest rate", description: "Percent (e.g. 3.0 for 3%) — for whole life, fixed annuity, IUL minimums", type: "number" },
    { key: "current_interest_rate", label: "Current crediting rate", description: "Percent currently being credited — UL, IUL, fixed annuity", type: "number" },
    { key: "surrender_charge", label: "Current surrender charge", description: "Dollar amount of surrender penalty if liquidated today", type: "number" },
    { key: "surrender_period_end", label: "Surrender period end", description: "ISO YYYY-MM-DD when surrender charges expire", type: "date" },
    { key: "loan_balance", label: "Outstanding loan balance", description: "Policy loan balance — dollar amount", type: "number" },
    { key: "rider_summary", label: "Riders / additional benefits", description: "Comma-separated list of riders (e.g. 'waiver of premium, accelerated death benefit, LTC rider')", type: "string" },
    { key: "1035_exchangeable", label: "1035-exchange eligible", description: "True if the policy is in a status that permits a 1035 exchange (after surrender period, life or annuity)", type: "boolean" },
  ],
  rows: {
    label: "beneficiaries",
    description:
      "Beneficiary designations listed on the declarations page. Capture primary and contingent.",
    fields: [
      { key: "tier", label: "Tier", description: "'primary' or 'contingent'", type: "string", required: true },
      { key: "beneficiary_name", label: "Beneficiary name", description: "Full name (or trust name)", type: "string", required: true },
      { key: "relationship", label: "Relationship", description: "Relationship to insured if stated", type: "string" },
      { key: "percent", label: "Percentage", description: "Allocation percent (0–100); primary should sum to 100", type: "number", required: true },
      { key: "is_trust", label: "Beneficiary is a trust", description: "True if the beneficiary is named as a trust", type: "boolean" },
    ],
  },
};

// ============================================================
// REGISTRY
// ============================================================

export const SCHEMAS: Record<DocType, DocSchema | null> = {
  // Tax — federal income
  form_1040: FORM_1040,
  form_k1: FORM_K1,
  form_w2: FORM_W2,
  // Tax — 1099 family
  form_1099_b: FORM_1099_B,
  form_1099_div: FORM_1099_DIV,
  form_1099_int: FORM_1099_INT,
  form_1099_misc: FORM_1099_MISC,
  form_1099_nec: FORM_1099_NEC,
  form_1099_r: FORM_1099_R,
  form_5498: FORM_5498,
  form_ssa_1099: FORM_SSA_1099,
  // Estate planning
  trust_document: TRUST_DOCUMENT,
  beneficiary_form: BENEFICIARY_FORM,
  // Retirement
  retirement_statement: RETIREMENT_STATEMENT,
  // Insurance
  insurance_policy: INSURANCE_POLICY,
  // Catch-all
  other: null,
};

export function getSchema(docType: DocType): DocSchema | null {
  return SCHEMAS[docType] || null;
}

// Human-readable label for each doc_type, used in vault dropdowns
// and the parsed-fields tab header. Keep in sync with DocType.
export const DOC_TYPE_LABELS: Record<DocType, string> = {
  form_1040: "Form 1040 — Federal income tax return",
  form_k1: "Schedule K-1 — Pass-through income",
  form_w2: "Form W-2 — Wage and tax statement",
  form_1099_b: "Form 1099-B — Broker proceeds",
  form_1099_div: "Form 1099-DIV — Dividends",
  form_1099_int: "Form 1099-INT — Interest income",
  form_1099_misc: "Form 1099-MISC — Miscellaneous income",
  form_1099_nec: "Form 1099-NEC — Nonemployee compensation",
  form_1099_r: "Form 1099-R — Retirement distributions",
  form_5498: "Form 5498 — IRA contribution information",
  form_ssa_1099: "Form SSA-1099 — Social Security benefits",
  trust_document: "Trust agreement",
  beneficiary_form: "Beneficiary designation form",
  retirement_statement: "Retirement account statement",
  insurance_policy: "Insurance policy (life / DI / LTC / annuity)",
  other: "Other / unrecognized",
};

// Doc types grouped for UI rendering. Order matters — this is the
// order they appear in dropdowns and on the vault detail page.
export const DOC_TYPE_GROUPS: Array<{ label: string; types: DocType[] }> = [
  {
    label: "Income tax",
    types: ["form_1040", "form_k1", "form_w2"],
  },
  {
    label: "1099 information returns",
    types: [
      "form_1099_b",
      "form_1099_div",
      "form_1099_int",
      "form_1099_misc",
      "form_1099_nec",
      "form_1099_r",
      "form_ssa_1099",
      "form_5498",
    ],
  },
  {
    label: "Estate planning",
    types: ["trust_document", "beneficiary_form"],
  },
  {
    label: "Retirement",
    types: ["retirement_statement"],
  },
  {
    label: "Insurance",
    types: ["insurance_policy"],
  },
  {
    label: "Other",
    types: ["other"],
  },
];
