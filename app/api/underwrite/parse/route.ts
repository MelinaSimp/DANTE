// app/api/underwrite/parse/route.ts
//
// POST a rent-roll spreadsheet (multipart "file"). Returns the parsed
// tenant schedule, aggregates, and a suggested DCFInput the analyst
// can edit before generating the model. Stateless — nothing is
// persisted (zero-retention friendly): the file is parsed in memory
// and discarded.

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase/server";
import { parseRentRoll, rentRollSourceStrings } from "@/lib/underwriting/rent-roll-parser";
import { type DCFInput, DEFAULT_ASSUMPTIONS, computeDcfSummary, round } from "@/lib/underwriting/dcf-math";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB
const ACCEPTED = /\.(xlsx|xls|csv)$/i;

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data with a 'file' field." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (!ACCEPTED.test(file.name)) {
    return NextResponse.json({ error: "Unsupported file. Upload an .xlsx, .xls, or .csv rent roll." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 15 MB)." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = parseRentRoll(buffer);

  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error, parsed }, { status: 422 });
  }

  const fileBase = file.name.replace(/\.[^.]+$/, "");
  const totalSf = parsed.totals.totalSf;
  const gpr = parsed.totals.totalAnnualRent;
  const estimatedOpex = round(gpr * 0.35, 2); // seeded estimate; flagged as analyst estimate

  const suggested: DCFInput = {
    property: {
      name: fileBase || "Untitled Asset",
      address: "",
      sf: totalSf > 0 ? totalSf : 0,
    },
    assumptions: { ...DEFAULT_ASSUMPTIONS },
    income: {
      gross_potential_rent: gpr,
      other_income: 0,
      reimbursements: 0,
    },
    expenses: {
      operating_expenses: estimatedOpex,
      management_fee: 0,
      reserves: 0,
      insurance: 0,
      taxes: 0,
    },
    acquisition: {
      purchase_price: undefined,
      closing_costs: 0,
      capex_budget: 0,
    },
  };

  const sources = rentRollSourceStrings(parsed, file.name);
  if (estimatedOpex > 0) {
    sources["expenses.operating_expenses"] =
      "Analyst estimate (35% of Gross Potential Rent) — replace with actual T-12 operating expenses.";
  }

  // A first-pass preview so the screen shows numbers immediately.
  const preview = totalSf > 0 && gpr > 0 ? computeDcfSummary(suggested) : null;

  return NextResponse.json({
    ok: true,
    fileName: file.name,
    parsed,
    suggested,
    sources,
    preview,
  });
}
