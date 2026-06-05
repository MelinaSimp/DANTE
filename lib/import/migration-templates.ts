// lib/import/migration-templates.ts
//
// CRM migration templates — pre-built field mapping configs for
// common CRE CRM systems. Each template tells the import wizard
// which columns to expect and how they map to Drift's schema.
//
// Used by the import wizard UI to show platform-specific
// instructions and auto-detect which CRM exported the file.

export interface MigrationTemplate {
  id: string;
  name: string;
  description: string;
  entity: "contacts" | "properties" | "both";
  exportInstructions: string[];
  /** Column names this CRM exports, mapped to our field names. */
  contactFieldMap?: Record<string, string>;
  propertyFieldMap?: Record<string, string>;
  /** Column names that indicate this file came from this CRM. */
  signatureColumns: string[];
}

export const MIGRATION_TEMPLATES: MigrationTemplate[] = [
  {
    id: "salesforce",
    name: "Salesforce",
    description: "Export contacts and accounts from Salesforce CRM.",
    entity: "both",
    exportInstructions: [
      "In Salesforce, go to Reports > New Report.",
      "Select 'Contacts & Accounts' as the report type.",
      'Click "Add columns" to include: Name, Email, Phone, Account Name, Title, Mailing State, Description.',
      'Run the report and click "Export" > "Details Only" > CSV.',
      "Upload the exported CSV file here.",
    ],
    contactFieldMap: {
      "Full Name": "name",
      "First Name": "first_name",
      "Last Name": "last_name",
      Email: "email",
      Phone: "phone",
      "Mobile Phone": "phone",
      "Account Name": "company",
      Title: "title",
      "Mailing State/Province": "state_code",
      "Lead Status": "stage",
      Description: "notes",
    },
    propertyFieldMap: {
      "Property Address": "address_line1",
      "Property City": "city",
      "Property State": "state",
      "Property Zip": "zip",
      "Property Type": "kind",
      "Square Feet": "sqft",
      "Year Built": "year_built",
      "List Price": "list_price_cents",
    },
    signatureColumns: [
      "Account Name",
      "Mailing State/Province",
      "Lead Status",
      "Contact ID",
      "Account ID",
    ],
  },
  {
    id: "hubspot",
    name: "HubSpot",
    description: "Export contacts from HubSpot CRM.",
    entity: "contacts",
    exportInstructions: [
      "In HubSpot, go to Contacts > Contacts.",
      'Click "Actions" (top right) > "Export".',
      "Select the properties you want to export (Name, Email, Phone, Company, etc).",
      "Choose CSV format and click Export.",
      "Download the file from your email and upload it here.",
    ],
    contactFieldMap: {
      "First Name": "first_name",
      "Last Name": "last_name",
      "First name": "first_name",
      "Last name": "last_name",
      Email: "email",
      "Email Address": "email",
      "Phone Number": "phone",
      "Phone number": "phone",
      "Company Name": "company",
      "Company name": "company",
      "Job Title": "title",
      "Job title": "title",
      "Lifecycle Stage": "stage",
      "Lifecycle stage": "stage",
      State: "state_code",
      "State/Region": "state_code",
      Notes: "notes",
    },
    signatureColumns: [
      "Contact ID",
      "Lifecycle Stage",
      "HubSpot Owner",
      "Create Date",
      "Associated Company",
    ],
  },
  {
    id: "brokermint",
    name: "Brokermint",
    description: "Export contacts and transactions from Brokermint.",
    entity: "both",
    exportInstructions: [
      "In Brokermint, go to Contacts > All Contacts.",
      'Click the "Export" button at the top of the list.',
      "Select all fields and choose CSV format.",
      "For properties/transactions, go to Transactions > All Transactions and export similarly.",
      "Upload the exported CSV file here.",
    ],
    contactFieldMap: {
      "Contact Name": "name",
      "First Name": "first_name",
      "Last Name": "last_name",
      Email: "email",
      "Email Address": "email",
      Phone: "phone",
      "Cell Phone": "phone",
      Company: "company",
      "Company Name": "company",
      Type: "stage",
      "Contact Type": "stage",
      State: "state_code",
      Notes: "notes",
    },
    propertyFieldMap: {
      "Property Address": "address_line1",
      Address: "address_line1",
      "Street Address": "address_line1",
      City: "city",
      State: "state",
      Zip: "zip",
      "Zip Code": "zip",
      "Property Type": "kind",
      "Square Footage": "sqft",
      "List Price": "list_price_cents",
      "Sale Price": "list_price_cents",
      "Transaction Type": "status",
    },
    signatureColumns: [
      "Contact Type",
      "Brokermint ID",
      "Transaction ID",
      "Closing Date",
      "Commission",
    ],
  },
  {
    id: "apto",
    name: "Apto (Buildout)",
    description: "Export contacts and properties from Apto / Buildout CRM.",
    entity: "both",
    exportInstructions: [
      "In Apto, go to Contacts and use the list view.",
      "Select all contacts and click Export to CSV.",
      "For properties, go to Properties > List View > Export.",
      "Upload the exported CSV file here.",
    ],
    contactFieldMap: {
      Name: "name",
      "First Name": "first_name",
      "Last Name": "last_name",
      Email: "email",
      Phone: "phone",
      "Office Phone": "phone",
      Company: "company",
      Title: "title",
      "Contact Type": "stage",
      State: "state_code",
      Notes: "notes",
    },
    propertyFieldMap: {
      "Property Name": "description",
      "Street Address": "address_line1",
      City: "city",
      State: "state",
      "Zip Code": "zip",
      "Property Type": "kind",
      "Building Size": "sqft",
      "Lot Size": "lot_size_sqft",
      "Year Built": "year_built",
      "Asking Price": "list_price_cents",
      "Lease Rate": "monthly_rent_cents",
      Status: "status",
    },
    signatureColumns: [
      "Apto ID",
      "Property Name",
      "Contact Type",
      "Building Size",
      "Lease Rate",
    ],
  },
  {
    id: "reonomy",
    name: "Reonomy",
    description: "Export property data from Reonomy.",
    entity: "properties",
    exportInstructions: [
      "In Reonomy, search for properties and apply your filters.",
      'Click "Export" at the top of the results.',
      "Select CSV format and download the file.",
      "Upload the exported CSV file here.",
    ],
    propertyFieldMap: {
      Address: "address_line1",
      City: "city",
      State: "state",
      "Zip Code": "zip",
      "Property Type": "kind",
      "Building Area": "sqft",
      "Lot Size": "lot_size_sqft",
      "Year Built": "year_built",
      "Assessed Value": "list_price_cents",
      "Owner Name": "description",
      Status: "status",
    },
    signatureColumns: [
      "Reonomy ID",
      "Building Area",
      "Lot Size",
      "Owner Name",
      "Tax Amount",
    ],
  },
  {
    id: "generic",
    name: "Generic CSV",
    description: "Standard CSV file with common column names.",
    entity: "both",
    exportInstructions: [
      "Prepare a CSV file with headers in the first row.",
      "For contacts: include Name (required), Email, Phone, Company, Title, Stage, State.",
      "For properties: include Address (required), City (required), State (required), Zip, Type, Sqft, Year Built, List Price.",
      "Upload the file here -- column names are matched flexibly.",
    ],
    signatureColumns: [],
  },
];

/**
 * Auto-detect which CRM a CSV file came from by checking for
 * signature column names in the headers.
 */
export function detectCRMSource(
  headers: string[],
): MigrationTemplate | null {
  const normalizedHeaders = new Set(
    headers.map((h) => h.trim().toLowerCase()),
  );

  let bestMatch: MigrationTemplate | null = null;
  let bestScore = 0;

  for (const template of MIGRATION_TEMPLATES) {
    if (template.signatureColumns.length === 0) continue;

    const matches = template.signatureColumns.filter((col) =>
      normalizedHeaders.has(col.toLowerCase()),
    ).length;

    const score = matches / template.signatureColumns.length;
    if (score > bestScore && score >= 0.4) {
      bestScore = score;
      bestMatch = template;
    }
  }

  return bestMatch;
}
