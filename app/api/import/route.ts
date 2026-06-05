// POST /api/import — bulk import contacts or properties from CSV/JSON.
//
// Accepts multipart/form-data with:
//   - file: CSV or JSON file
//   - entity: "contacts" | "properties"
//
// Or application/json with:
//   - entity: "contacts" | "properties"
//   - rows: array of objects
//
// Returns detailed result with inserted/skipped/error counts and
// per-row diagnostics.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isOwner } from "@/lib/rbac";
import {
  parseCSV,
  importContacts,
  importProperties,
} from "@/lib/import/bulk-import";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }
  if (!isOwner(profile.role)) {
    return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  }

  const workspaceId = profile.workspace_id;
  const contentType = req.headers.get("content-type") || "";

  let entity: string;
  let rows: Record<string, string>[];

  if (contentType.includes("multipart/form-data")) {
    // File upload path
    const formData = await req.formData();
    entity = formData.get("entity") as string;
    const file = formData.get("file") as File;

    if (!entity || !file) {
      return NextResponse.json(
        { error: "entity and file are required" },
        { status: 400 },
      );
    }

    const text = await file.text();
    const filename = file.name.toLowerCase();

    if (filename.endsWith(".json")) {
      try {
        const parsed = JSON.parse(text);
        rows = Array.isArray(parsed) ? parsed : parsed.rows || parsed.data || [];
      } catch {
        return NextResponse.json({ error: "Invalid JSON file" }, { status: 400 });
      }
    } else {
      // Assume CSV
      rows = parseCSV(text);
    }
  } else {
    // JSON body path
    const body = await req.json();
    entity = body.entity;
    rows = body.rows;

    if (!entity || !Array.isArray(rows)) {
      return NextResponse.json(
        { error: "entity and rows[] are required" },
        { status: 400 },
      );
    }
  }

  if (!["contacts", "properties"].includes(entity)) {
    return NextResponse.json(
      { error: 'entity must be "contacts" or "properties"' },
      { status: 400 },
    );
  }

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "No rows to import" },
      { status: 400 },
    );
  }

  if (rows.length > 5000) {
    return NextResponse.json(
      { error: "Maximum 5,000 rows per import. Split into multiple files." },
      { status: 400 },
    );
  }

  const result =
    entity === "contacts"
      ? await importContacts(workspaceId, rows)
      : await importProperties(workspaceId, rows);

  return NextResponse.json(result);
}
