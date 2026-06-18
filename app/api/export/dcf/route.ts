// app/api/export/dcf/route.ts
//
// POST a full DCFInput, get back a multi-tab Excel model. The model
// math + workbook layout now live in lib/underwriting so the
// One-Click Underwriter and any agent/workflow caller share one
// engine. This route stays as the low-level "I already have inputs"
// endpoint; /api/underwrite/* is the rent-roll-driven flow on top.

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase/server";
import { type DCFInput } from "@/lib/underwriting/dcf-math";
import { buildDcfWorkbook, modelFilename, type ModelSource } from "@/lib/underwriting/dcf-workbook";

export const dynamic = "force-dynamic";

function validateInput(body: unknown): { valid: true; data: DCFInput } | { valid: false; error: string } {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Request body must be a JSON object" };
  }

  const b = body as Record<string, unknown>;

  if (!b.property || typeof b.property !== "object") {
    return { valid: false, error: "Missing required field: property" };
  }
  const prop = b.property as Record<string, unknown>;
  if (!prop.name || typeof prop.name !== "string") {
    return { valid: false, error: "Missing required field: property.name" };
  }
  if (!prop.address || typeof prop.address !== "string") {
    return { valid: false, error: "Missing required field: property.address" };
  }
  if (typeof prop.sf !== "number" || prop.sf <= 0) {
    return { valid: false, error: "property.sf must be a positive number" };
  }

  if (!b.assumptions || typeof b.assumptions !== "object") {
    return { valid: false, error: "Missing required field: assumptions" };
  }
  const a = b.assumptions as Record<string, unknown>;
  const requiredAssumptions = [
    "analysis_period_years",
    "discount_rate",
    "terminal_cap_rate",
    "rent_growth_rate",
    "expense_growth_rate",
    "vacancy_rate",
    "selling_costs",
  ];
  for (const key of requiredAssumptions) {
    if (typeof a[key] !== "number") {
      return { valid: false, error: `Missing or invalid required field: assumptions.${key}` };
    }
  }
  if ((a.analysis_period_years as number) < 1 || (a.analysis_period_years as number) > 30) {
    return { valid: false, error: "assumptions.analysis_period_years must be between 1 and 30" };
  }

  if (!b.income || typeof b.income !== "object") {
    return { valid: false, error: "Missing required field: income" };
  }
  const inc = b.income as Record<string, unknown>;
  if (typeof inc.gross_potential_rent !== "number") {
    return { valid: false, error: "Missing required field: income.gross_potential_rent" };
  }

  if (!b.expenses || typeof b.expenses !== "object") {
    return { valid: false, error: "Missing required field: expenses" };
  }
  const exp = b.expenses as Record<string, unknown>;
  if (typeof exp.operating_expenses !== "number") {
    return { valid: false, error: "Missing required field: expenses.operating_expenses" };
  }

  return { valid: true, data: b as unknown as DCFInput };
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const validation = validateInput(body);
  if (validation.valid === false) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const sources = Array.isArray((body as Record<string, unknown>).sources)
    ? ((body as Record<string, unknown>).sources as ModelSource[])
    : undefined;

  const buf = buildDcfWorkbook(validation.data, sources);

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="dcf-${modelFilename(validation.data.property.name).replace(/^underwriting-/, "")}"`,
    },
  });
}
