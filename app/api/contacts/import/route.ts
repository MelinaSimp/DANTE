// POST /api/contacts/import
//
// Bulk-insert contacts from a CSV import. The client parses the CSV
// and hands us a plain JSON array of {name, phone, email, notes}
// records; the server handles validation, phone normalisation, and
// duplicate detection against existing rows in this workspace.
//
// Design decisions:
//  • Duplicates collapse on normalised phone number (what Twilio
//    would deliver a call from). A contact with no phone is never
//    treated as a duplicate.
//  • Soft failures: invalid rows get skipped with a reason attached
//    to the response, the rest import. Better than all-or-nothing
//    rollback — nobody wants to hear "your import failed" because
//    row 483 of 500 had a typo'd email.
//  • Payload hard-capped at 5,000 rows per request. Larger books
//    should chunk client-side.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { formatPhoneToE164, validatePhoneNumber, validateEmail } from "@/lib/validation";

export const dynamic = "force-dynamic";

interface ImportRow {
  name: string;
  phone?: string;
  email?: string;
  notes?: string;
}

interface SkippedRow {
  row: number;
  name?: string;
  reason: string;
}

const MAX_ROWS = 5000;

function cleanString(value: unknown, max = 500): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawContacts = Array.isArray(body?.contacts) ? body.contacts : null;
  if (!rawContacts) {
    return NextResponse.json(
      { error: "Expected { contacts: [...] } in the body" },
      { status: 400 },
    );
  }
  if (rawContacts.length === 0) {
    return NextResponse.json({
      imported: 0,
      skipped: [],
      message: "Nothing to import.",
    });
  }
  if (rawContacts.length > MAX_ROWS) {
    return NextResponse.json(
      {
        error: `Import capped at ${MAX_ROWS} rows per request. Split your file and try again.`,
      },
      { status: 400 },
    );
  }

  // Normalise + validate every row up front. This runs in-memory so
  // even a 5k import is millisecond-cheap; keeps the DB roundtrip
  // count low and lets us return a comprehensive skipped list.
  const skipped: SkippedRow[] = [];
  const cleaned: ImportRow[] = [];
  const seenPhones = new Set<string>();

  rawContacts.forEach((raw: any, idx: number) => {
    const rowNum = idx + 1;
    const name = cleanString(raw?.name, 255);
    if (!name) {
      skipped.push({ row: rowNum, reason: "Missing name" });
      return;
    }

    const phoneRaw = cleanString(raw?.phone, 60);
    let phone: string | undefined;
    if (phoneRaw) {
      const phoneErr = validatePhoneNumber(phoneRaw);
      if (phoneErr) {
        skipped.push({ row: rowNum, name, reason: phoneErr });
        return;
      }
      phone = formatPhoneToE164(phoneRaw);
      if (seenPhones.has(phone)) {
        skipped.push({
          row: rowNum,
          name,
          reason: "Duplicate phone within this import",
        });
        return;
      }
      seenPhones.add(phone);
    }

    const emailRaw = cleanString(raw?.email, 255);
    let email: string | undefined;
    if (emailRaw) {
      const emailErr = validateEmail(emailRaw);
      if (emailErr) {
        skipped.push({ row: rowNum, name, reason: emailErr });
        return;
      }
      email = emailRaw;
    }

    const notes = cleanString(raw?.notes, 2000) || undefined;

    cleaned.push({ name, phone, email, notes });
  });

  if (cleaned.length === 0) {
    return NextResponse.json({
      imported: 0,
      skipped,
      message: "No valid rows to import.",
    });
  }

  // Drop rows whose phone already exists in this workspace. Do one
  // batched query instead of N per-row checks.
  const phonesInImport = cleaned
    .map((c) => c.phone)
    .filter((p): p is string => !!p);

  let existingPhones = new Set<string>();
  if (phonesInImport.length > 0) {
    const { data: existing } = await supabase
      .from("contacts")
      .select("phone")
      .eq("workspace_id", profile.workspace_id)
      .in("phone", phonesInImport);
    existingPhones = new Set(
      (existing || [])
        .map((r: any) => r.phone)
        .filter((p: string | null): p is string => !!p),
    );
  }

  const toInsert = cleaned.filter((c) => {
    if (c.phone && existingPhones.has(c.phone)) {
      skipped.push({
        name: c.name,
        row: 0,
        reason: "Already in your contacts",
      });
      return false;
    }
    return true;
  });

  if (toInsert.length === 0) {
    return NextResponse.json({
      imported: 0,
      skipped,
      message: "All rows were duplicates or invalid.",
    });
  }

  const rows = toInsert.map((c) => ({
    workspace_id: profile.workspace_id,
    name: c.name,
    phone: c.phone || null,
    email: c.email || null,
  }));

  const { error } = await supabase.from("contacts").insert(rows);
  if (error) {
    console.error("[contacts/import] bulk insert failed:", error);
    return NextResponse.json(
      { error: "Failed to import contacts. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    imported: rows.length,
    skipped,
  });
}
