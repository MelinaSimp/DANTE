// lib/dante/eval/lease-abstraction-suite.ts
//
// Seed eval suite for lease abstraction quality. These test cases
// validate that the agent correctly extracts structured data from
// commercial lease documents — the single most valuable CRE
// capability and a primary sales driver.
//
// Each case provides a lease excerpt as input and assertions that
// check extracted fields. Cases range from straightforward NNN
// retail leases to complex multi-tenant office agreements.

export const LEASE_ABSTRACTION_SUITE = {
  name: "Lease abstraction v1",
  description:
    "Core lease abstraction quality. Tests extraction of key terms " +
    "(tenant, landlord, premises, rent, escalations, options, insurance) " +
    "from a variety of CRE lease types.",
  eval_type: "prompt" as const,
  tags: ["lease", "abstraction", "cre", "core"],
  cases: [
    // ── Case 1: Simple NNN retail lease ──────────────────────────
    {
      name: "NNN retail — basic terms",
      input: {
        messages: [
          {
            role: "system",
            content:
              "You are a commercial real estate lease abstraction agent. " +
              "Extract key terms from the lease excerpt. Return a JSON object with: " +
              "tenant_name, landlord_name, premises_address, lease_type, " +
              "commencement_date, expiration_date, base_rent_annual, " +
              "rent_per_sf, square_footage, escalation_type, escalation_rate.",
          },
          {
            role: "user",
            content:
              "LEASE AGREEMENT\n\n" +
              "This Lease Agreement dated January 15, 2024, between MAPLE RIDGE HOLDINGS LLC " +
              '("Landlord") and GREAT CLIPS INC. ("Tenant").\n\n' +
              "PREMISES: Suite 101, 4821 Maple Ridge Drive, Willoughby, OH 44094, " +
              "consisting of approximately 2,400 rentable square feet.\n\n" +
              "TERM: Commencing March 1, 2024 and expiring February 28, 2029 (60 months).\n\n" +
              "BASE RENT: $3,000.00 per month ($36,000.00 annually, $15.00 per square foot). " +
              "Rent shall increase by 3% annually on each anniversary of the Commencement Date.\n\n" +
              "LEASE TYPE: Triple Net (NNN). Tenant shall be responsible for its pro rata share " +
              "of real estate taxes, insurance, and common area maintenance.",
          },
        ],
        maxTokens: 500,
      },
      expected: {
        tenant_name: "Great Clips Inc.",
        landlord_name: "Maple Ridge Holdings LLC",
        lease_type: "NNN",
        square_footage: 2400,
        base_rent_annual: 36000,
        rent_per_sf: 15.0,
      },
      assertions: [
        { field: "text", op: "contains", value: "Great Clips" },
        { field: "text", op: "contains", value: "Maple Ridge" },
        { field: "text", op: "contains", value: "2,400" },
        { field: "text", op: "contains", value: "NNN" },
        { field: "text", op: "contains", value: "2024" },
        { field: "text", op: "contains", value: "2029" },
        { field: "text", op: "contains", value: "3%" },
      ],
      weight: 1.0,
    },

    // ── Case 2: Office lease with TI allowance ──────────────────
    {
      name: "Office lease — TI and rent abatement",
      input: {
        messages: [
          {
            role: "system",
            content:
              "You are a commercial real estate lease abstraction agent. " +
              "Extract key terms from the lease excerpt. Return a JSON object with: " +
              "tenant_name, landlord_name, premises_address, lease_type, " +
              "commencement_date, expiration_date, base_rent_annual, " +
              "rent_per_sf, square_footage, ti_allowance_per_sf, " +
              "rent_abatement_months, renewal_options.",
          },
          {
            role: "user",
            content:
              "OFFICE LEASE\n\n" +
              "Between CEDAR POINT OFFICE PARTNERS LP (Landlord) and " +
              "LAKESHORE INSURANCE GROUP LLC (Tenant).\n\n" +
              "PREMISES: Suites 200-210, 1200 Cedar Point Road, Sandusky, OH 44870. " +
              "Approximately 8,000 rentable square feet on the second floor.\n\n" +
              "TERM: Five (5) years from July 1, 2023 through June 30, 2028.\n\n" +
              "BASE RENT: Year 1: $16.50/SF ($132,000 annually); Year 2: $17.00/SF; " +
              "Year 3: $17.50/SF; Year 4: $18.00/SF; Year 5: $18.50/SF.\n\n" +
              "LEASE TYPE: Modified Gross. Landlord responsible for structure, roof, " +
              "and building systems. Tenant pays proportionate share of operating " +
              "expenses above a base year (2023) stop.\n\n" +
              "TENANT IMPROVEMENT ALLOWANCE: Landlord shall provide $25.00 per rentable " +
              "square foot ($200,000 total) for Tenant's initial buildout.\n\n" +
              "RENT ABATEMENT: Tenant shall receive three (3) months of free base rent " +
              "during initial buildout (July-September 2023).\n\n" +
              "RENEWAL: Tenant has two (2) consecutive options to renew for five (5) years " +
              "each, at then-prevailing market rates with a 5% cap on increases.",
          },
        ],
        maxTokens: 600,
      },
      assertions: [
        { field: "text", op: "contains", value: "Lakeshore Insurance" },
        { field: "text", op: "contains", value: "8,000" },
        { field: "text", op: "contains", value: "Modified Gross" },
        { field: "text", op: "contains", value: "$25" },
        { field: "text", op: "contains", value: "three" },
        { field: "text", op: "contains", value: "two" },
        { field: "text", op: "contains", value: "2028" },
      ],
      weight: 1.5,
    },

    // ── Case 3: Ground lease (complex) ──────────────────────────
    {
      name: "Ground lease — percentage rent + CPI escalation",
      input: {
        messages: [
          {
            role: "system",
            content:
              "You are a commercial real estate lease abstraction agent. " +
              "Extract all key terms including percentage rent provisions, " +
              "escalation mechanisms, and special conditions. " +
              "Return structured JSON.",
          },
          {
            role: "user",
            content:
              "GROUND LEASE AGREEMENT\n\n" +
              "LANDLORD: First National Bank Trust, as Trustee of the Morrison Family Trust\n" +
              "TENANT: QuickTrip Corporation\n\n" +
              "LAND: 1.5 acres at the NEC of Route 20 and SOM Center Road, Mentor, OH 44060. " +
              "Parcel No. 08-A-027-0-00-025-0.\n\n" +
              "TERM: Thirty (30) years commencing January 1, 2020, with two (2) ten-year " +
              "renewal options.\n\n" +
              "GROUND RENT: $75,000 per annum, payable monthly. Adjusted every five (5) years " +
              "based on the Consumer Price Index (CPI-U, All Urban Consumers), with a floor of " +
              "2% and a ceiling of 4% per annum, compounded.\n\n" +
              "PERCENTAGE RENT: In addition to ground rent, Tenant shall pay 1.5% of gross " +
              "sales exceeding a natural breakpoint ($5,000,000 annually).\n\n" +
              "IMPROVEMENTS: Tenant shall construct at its sole cost a convenience store and " +
              "fuel station (approximately 5,200 SF). All improvements revert to Landlord " +
              "upon lease termination unless Tenant exercises its purchase option.\n\n" +
              "PURCHASE OPTION: Tenant has a right of first refusal to purchase the land " +
              "at fair market value, appraised by two MAI appraisers.",
          },
        ],
        maxTokens: 600,
      },
      assertions: [
        { field: "text", op: "contains", value: "QuickTrip" },
        { field: "text", op: "contains", value: "ground" },
        { field: "text", op: "contains", value: "30" },
        { field: "text", op: "contains", value: "$75,000" },
        { field: "text", op: "contains", value: "CPI" },
        { field: "text", op: "contains", value: "1.5%" },
        { field: "text", op: "contains", value: "5,000,000" },
        { field: "text", op: "contains", value: "purchase option" },
      ],
      weight: 2.0,
    },

    // ── Case 4: Multi-tenant retail — CAM reconciliation ────────
    {
      name: "Retail lease — CAM and insurance provisions",
      input: {
        messages: [
          {
            role: "system",
            content:
              "You are a commercial real estate lease abstraction agent. " +
              "Focus on extracting CAM, insurance, and operating expense provisions. " +
              "Return structured JSON with all financial obligations.",
          },
          {
            role: "user",
            content:
              "RETAIL LEASE — AutoZone, Inc.\n\n" +
              "Premises: 7,500 SF at Willoughby Commons, 2900 Euclid Ave, Willoughby OH 44094\n" +
              "Term: 10 years, April 1, 2022 - March 31, 2032\n" +
              "Base Rent: $12.00/SF Year 1, increasing 2.5% annually\n\n" +
              "COMMON AREA MAINTENANCE (CAM):\n" +
              "Tenant's proportionate share: 6.25% (7,500/120,000 total center SF).\n" +
              "CAM includes: parking lot maintenance, snow removal, landscaping, " +
              "lighting, signage maintenance, management fee (15% of CAM).\n" +
              "CAM Cap: Controllable CAM expenses shall not increase more than 5% " +
              "per year over the prior year's actual controllable CAM.\n" +
              "Exclusions: Capital expenditures, landlord's income taxes, " +
              "leasing commissions, tenant-specific costs.\n\n" +
              "INSURANCE: Tenant maintains $2M general liability, $1M per occurrence. " +
              "Tenant pays pro rata share of building insurance premium " +
              "(estimated $0.85/SF for 2022).\n\n" +
              "REAL ESTATE TAXES: Tenant pays pro rata share. " +
              "Current: $3.25/SF (2022 estimate). Tenant has right to contest " +
              "tax assessment through Landlord.",
          },
        ],
        maxTokens: 600,
      },
      assertions: [
        { field: "text", op: "contains", value: "AutoZone" },
        { field: "text", op: "contains", value: "7,500" },
        { field: "text", op: "contains", value: "6.25%" },
        { field: "text", op: "contains", value: "5%" },
        { field: "text", op: "contains", value: "$2M" },
        { field: "text", op: "contains", value: "$3.25" },
        { field: "text", op: "contains", value: "2032" },
      ],
      weight: 1.5,
    },

    // ── Case 5: Sublease with consent requirements ──────────────
    {
      name: "Sublease — consent and assignment provisions",
      input: {
        messages: [
          {
            role: "system",
            content:
              "You are a commercial real estate lease abstraction agent. " +
              "Extract sublease terms, consent requirements, and any " +
              "restrictions on assignment. Return structured JSON.",
          },
          {
            role: "user",
            content:
              "SUBLEASE AGREEMENT\n\n" +
              "SUBLANDLORD: Lakeshore Insurance Group LLC\n" +
              "SUBTENANT: Mentor Physical Therapy Associates\n" +
              "MASTER LANDLORD: Cedar Point Office Partners LP\n\n" +
              "PREMISES: Suite 205, 1200 Cedar Point Road, Sandusky OH 44870. " +
              "2,000 SF of Sublandlord's 8,000 SF premises.\n\n" +
              "TERM: 24 months, January 1, 2025 through December 31, 2026.\n\n" +
              "RENT: $18.00/SF ($3,000/month). Subtenant also pays 25% of " +
              "Sublandlord's CAM/tax/insurance obligations.\n\n" +
              "CONSENT: This Sublease is contingent upon written consent of " +
              "Master Landlord. Sublandlord warrants that Section 12.3 of the " +
              "Master Lease permits subletting with Landlord consent, not to be " +
              "unreasonably withheld.\n\n" +
              "RESTRICTIONS: Subtenant may not further assign or sublease without " +
              "both Sublandlord and Master Landlord consent. Subtenant's use is " +
              "limited to physical therapy and medical office (consistent with " +
              "Master Lease permitted uses).\n\n" +
              "EARLY TERMINATION: Either party may terminate with 90 days written " +
              "notice after the first 12 months.",
          },
        ],
        maxTokens: 500,
      },
      assertions: [
        { field: "text", op: "contains", value: "sublease" },
        { field: "text", op: "contains", value: "Mentor Physical Therapy" },
        { field: "text", op: "contains", value: "Lakeshore Insurance" },
        { field: "text", op: "contains", value: "2,000" },
        { field: "text", op: "contains", value: "$18" },
        { field: "text", op: "contains", value: "consent" },
        { field: "text", op: "contains", value: "90 days" },
      ],
      weight: 1.5,
    },
  ],
};
