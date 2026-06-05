// lib/import/bulk-import.ts
//
// Bulk import pipeline for contacts and properties. Handles CSV and
// JSON input, validates rows, deduplicates against existing records,
// and inserts in batches.
//
// Used by the /api/import route and eventually by the "migrate from
// Brokermint/Salesforce" onboarding wizard.
//
// Deduplication strategy:
//   Contacts: email match (case-insensitive) within workspace
//   Properties: address_line1 + city + state match within workspace
//
// Rows that match existing records are skipped (not updated) and
// returned in the `skipped` array so the caller can offer "update
// existing" as a separate action.

import { supabaseAdmin } from "@/lib/supabase/admin";
import { log as rootLog } from "@/lib/logging";

const importLog = rootLog.child({ component: "bulk-import" });

// ── Types ────────────────────────────────────────────────────────

export interface ImportContactRow {
  name: string;
  email?: string;
  phone?: string;
  stage?: string;
  notes?: string;
  tags?: string[];
  // Additional CRE-specific fields
  company?: string;
  title?: string;
  state_code?: string;
}

export interface ImportPropertyRow {
  address_line1: string;
  address_line2?: string;
  city: string;
  state: string;
  zip?: string;
  kind?: string;
  sqft?: number;
  lot_size_sqft?: number;
  year_built?: number;
  list_price_cents?: number;
  monthly_rent_cents?: number;
  lease_term_months?: number;
  lease_start_date?: string;
  lease_end_date?: string;
  notes?: string;
  description?: string;
  status?: string;
  transaction_stage?: string;
}

export interface ImportResult {
  entity: "contacts" | "properties";
  total: number;
  inserted: number;
  skipped: number;
  errors: number;
  skipped_rows: Array<{ row: number; reason: string; data: Record<string, unknown> }>;
  error_rows: Array<{ row: number; error: string; data: Record<string, unknown> }>;
}

// ── CSV parser ───────────────────────────────────────────────────

export function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map((h) =>
    h.trim().toLowerCase().replace(/\s+/g, "_"),
  );

  return lines.slice(1).map((line) => {
    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      if (values[i] !== undefined) row[h] = values[i].trim();
    });
    return row;
  });
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

// ── Field mapping ────────────────────────────────────────────────
// Common CSV column name variations mapped to our schema.

const CONTACT_FIELD_MAP: Record<string, string> = {
  name: "name",
  full_name: "name",
  contact_name: "name",
  first_name: "first_name", // handled specially
  last_name: "last_name",   // handled specially
  email: "email",
  email_address: "email",
  phone: "phone",
  phone_number: "phone",
  mobile: "phone",
  stage: "stage",
  status: "stage",
  notes: "notes",
  company: "company",
  company_name: "company",
  organization: "company",
  title: "title",
  job_title: "title",
  state: "state_code",
  state_code: "state_code",
};

const PROPERTY_FIELD_MAP: Record<string, string> = {
  address: "address_line1",
  address_line1: "address_line1",
  address_line_1: "address_line1",
  street_address: "address_line1",
  address_line2: "address_line2",
  address_line_2: "address_line2",
  unit: "address_line2",
  suite: "address_line2",
  city: "city",
  state: "state",
  zip: "zip",
  zip_code: "zip",
  zipcode: "zip",
  postal_code: "zip",
  type: "kind",
  kind: "kind",
  property_type: "kind",
  sqft: "sqft",
  square_feet: "sqft",
  square_footage: "sqft",
  lot_size: "lot_size_sqft",
  lot_size_sqft: "lot_size_sqft",
  lot_sqft: "lot_size_sqft",
  year_built: "year_built",
  built: "year_built",
  price: "list_price_cents",
  list_price: "list_price_cents",
  asking_price: "list_price_cents",
  rent: "monthly_rent_cents",
  monthly_rent: "monthly_rent_cents",
  notes: "notes",
  description: "description",
  status: "status",
};

function mapFields(
  row: Record<string, string>,
  fieldMap: Record<string, string>,
): Record<string, string> {
  const mapped: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = key.toLowerCase().replace(/\s+/g, "_");
    const mappedKey = fieldMap[normalizedKey];
    if (mappedKey && value) {
      mapped[mappedKey] = value;
    }
  }
  return mapped;
}

// ── Contact import ───────────────────────────────────────────────

export async function importContacts(
  workspaceId: string,
  rows: Record<string, string>[],
): Promise<ImportResult> {
  const result: ImportResult = {
    entity: "contacts",
    total: rows.length,
    inserted: 0,
    skipped: 0,
    errors: 0,
    skipped_rows: [],
    error_rows: [],
  };

  if (rows.length === 0) return result;

  importLog.info("importing contacts", { workspaceId, rowCount: rows.length });

  // Load existing emails for dedup
  const { data: existing } = await supabaseAdmin
    .from("contacts")
    .select("email")
    .eq("workspace_id", workspaceId)
    .not("email", "is", null);

  const existingEmails = new Set(
    (existing || []).map((c: any) => c.email?.toLowerCase()).filter(Boolean),
  );

  const VALID_STAGES = ["lead", "prospect", "active", "inactive", "archived"];
  const toInsert: Record<string, unknown>[] = [];

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const mapped = mapFields(raw, CONTACT_FIELD_MAP);

    // Handle first_name + last_name → name
    if (!mapped.name && (mapped.first_name || mapped.last_name)) {
      mapped.name = [mapped.first_name, mapped.last_name].filter(Boolean).join(" ");
    }

    if (!mapped.name) {
      result.errors++;
      result.error_rows.push({
        row: i + 1,
        error: "Missing required field: name",
        data: raw,
      });
      continue;
    }

    // Dedup by email
    if (mapped.email && existingEmails.has(mapped.email.toLowerCase())) {
      result.skipped++;
      result.skipped_rows.push({
        row: i + 1,
        reason: `Email ${mapped.email} already exists`,
        data: raw,
      });
      continue;
    }

    const stage =
      mapped.stage && VALID_STAGES.includes(mapped.stage.toLowerCase())
        ? mapped.stage.toLowerCase()
        : "lead";

    toInsert.push({
      workspace_id: workspaceId,
      name: mapped.name,
      email: mapped.email?.toLowerCase() || null,
      phone: mapped.phone || null,
      stage,
      notes: mapped.notes || null,
      state_code: mapped.state_code?.toUpperCase().slice(0, 2) || null,
    });

    // Track for dedup within the batch
    if (mapped.email) existingEmails.add(mapped.email.toLowerCase());
  }

  // Batch insert (chunks of 100)
  const BATCH_SIZE = 100;
  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE);
    const { error } = await supabaseAdmin.from("contacts").insert(batch);
    if (error) {
      importLog.warn("batch insert failed", {
        batchStart: i,
        batchSize: batch.length,
        error: error.message,
      });
      // Mark all rows in this batch as errors
      for (let j = 0; j < batch.length; j++) {
        result.errors++;
        result.error_rows.push({
          row: i + j + 1,
          error: error.message,
          data: batch[j] as Record<string, unknown>,
        });
      }
    } else {
      result.inserted += batch.length;
    }
  }

  importLog.info("contacts import complete", {
    workspaceId,
    inserted: result.inserted,
    skipped: result.skipped,
    errors: result.errors,
  });

  return result;
}

// ── Property import ──────────────────────────────────────────────

export async function importProperties(
  workspaceId: string,
  rows: Record<string, string>[],
): Promise<ImportResult> {
  const result: ImportResult = {
    entity: "properties",
    total: rows.length,
    inserted: 0,
    skipped: 0,
    errors: 0,
    skipped_rows: [],
    error_rows: [],
  };

  if (rows.length === 0) return result;

  importLog.info("importing properties", { workspaceId, rowCount: rows.length });

  // Load existing for dedup (address + city + state)
  const { data: existing } = await supabaseAdmin
    .from("properties")
    .select("address_line1, city, state")
    .eq("workspace_id", workspaceId);

  const existingKeys = new Set(
    (existing || []).map((p: any) =>
      `${(p.address_line1 || "").toLowerCase()}|${(p.city || "").toLowerCase()}|${(p.state || "").toLowerCase()}`,
    ),
  );

  const toInsert: Record<string, unknown>[] = [];

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const mapped = mapFields(raw, PROPERTY_FIELD_MAP);

    if (!mapped.address_line1) {
      result.errors++;
      result.error_rows.push({
        row: i + 1,
        error: "Missing required field: address",
        data: raw,
      });
      continue;
    }

    if (!mapped.city || !mapped.state) {
      result.errors++;
      result.error_rows.push({
        row: i + 1,
        error: "Missing required fields: city and state",
        data: raw,
      });
      continue;
    }

    // Dedup
    const key = `${mapped.address_line1.toLowerCase()}|${mapped.city.toLowerCase()}|${mapped.state.toLowerCase()}`;
    if (existingKeys.has(key)) {
      result.skipped++;
      result.skipped_rows.push({
        row: i + 1,
        reason: `Property at ${mapped.address_line1}, ${mapped.city} already exists`,
        data: raw,
      });
      continue;
    }

    // Parse numeric fields
    const sqft = mapped.sqft ? parseInt(mapped.sqft.replace(/,/g, ""), 10) : null;
    const lotSize = mapped.lot_size_sqft ? parseInt(mapped.lot_size_sqft.replace(/,/g, ""), 10) : null;
    const yearBuilt = mapped.year_built ? parseInt(mapped.year_built, 10) : null;

    // Price handling: if the value doesn't look like cents, assume dollars
    let listPrice: number | null = null;
    if (mapped.list_price_cents) {
      const raw = parseFloat(mapped.list_price_cents.replace(/[$,]/g, ""));
      listPrice = !isNaN(raw)
        ? raw > 1000 ? Math.round(raw * 100) : raw  // >1000 = dollars, convert to cents
        : null;
    }

    let monthlyRent: number | null = null;
    if (mapped.monthly_rent_cents) {
      const raw = parseFloat(mapped.monthly_rent_cents.replace(/[$,]/g, ""));
      monthlyRent = !isNaN(raw)
        ? raw > 100 ? Math.round(raw * 100) : raw
        : null;
    }

    toInsert.push({
      workspace_id: workspaceId,
      address_line1: mapped.address_line1,
      address_line2: mapped.address_line2 || null,
      city: mapped.city,
      state: mapped.state.toUpperCase().slice(0, 2),
      zip: mapped.zip || null,
      kind: mapped.kind || null,
      sqft: isNaN(sqft!) ? null : sqft,
      lot_size_sqft: isNaN(lotSize!) ? null : lotSize,
      year_built: isNaN(yearBuilt!) ? null : yearBuilt,
      list_price_cents: listPrice,
      monthly_rent_cents: monthlyRent,
      notes: mapped.notes || null,
      description: mapped.description || null,
      status: mapped.status || "active",
    });

    existingKeys.add(key);
  }

  // Batch insert
  const BATCH_SIZE = 100;
  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE);
    const { error } = await supabaseAdmin.from("properties").insert(batch);
    if (error) {
      importLog.warn("property batch insert failed", {
        batchStart: i,
        batchSize: batch.length,
        error: error.message,
      });
      for (let j = 0; j < batch.length; j++) {
        result.errors++;
        result.error_rows.push({
          row: i + j + 1,
          error: error.message,
          data: batch[j] as Record<string, unknown>,
        });
      }
    } else {
      result.inserted += batch.length;
    }
  }

  importLog.info("properties import complete", {
    workspaceId,
    inserted: result.inserted,
    skipped: result.skipped,
    errors: result.errors,
  });

  return result;
}
