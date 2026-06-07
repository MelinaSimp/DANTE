// app/api/lease-abstractor/templates/route.ts
//
// GET  — list workspace templates (returns default fields if none saved)
// POST — save / update a template
// The lease abstractor uses these to let firms customize which fields
// get extracted and in what order.

import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const DEFAULT_FIELDS = [
  { name: "Tenant Name", category: "deal_terms", description: "Legal name of the tenant entity" },
  { name: "Landlord Name", category: "deal_terms", description: "Legal name of the landlord entity" },
  { name: "Guarantor(s)", category: "deal_terms", description: "Personal or entity guarantors" },
  { name: "Premises Description", category: "deal_terms", description: "Address, suite, floor, SF" },
  { name: "Lease Type", category: "deal_terms", description: "NNN, gross, modified gross, etc." },
  { name: "Commencement Date", category: "deal_terms", description: "Lease start date" },
  { name: "Expiration Date", category: "deal_terms", description: "Lease end date" },
  { name: "Term (Months)", category: "deal_terms", description: "Total lease term in months" },
  { name: "Renewal Options", category: "deal_terms", description: "Count, term, notice period, rent basis" },
  { name: "Expansion Options", category: "deal_terms", description: "Right of first refusal or offer" },
  { name: "Termination Options", category: "deal_terms", description: "Early termination conditions and penalties" },
  { name: "Base Rent Schedule", category: "financial_terms", description: "Year-by-year with escalations" },
  { name: "Escalation Type", category: "financial_terms", description: "Fixed %, CPI, fair market, etc." },
  { name: "CAM / OpEx Obligations", category: "financial_terms", description: "Common area maintenance and operating expense terms" },
  { name: "Real Estate Tax Obligations", category: "financial_terms", description: "Tax pass-through or obligation structure" },
  { name: "Insurance Obligations", category: "financial_terms", description: "Required insurance coverage and responsibility" },
  { name: "Percentage Rent", category: "financial_terms", description: "Threshold, rate, breakpoint" },
  { name: "Security Deposit", category: "financial_terms", description: "Amount, form, conditions for return" },
  { name: "TI Allowance", category: "financial_terms", description: "Tenant improvement allowance amount and conditions" },
  { name: "Free Rent / Abatement", category: "financial_terms", description: "Rent-free or abated periods" },
  { name: "Co-Tenancy Provisions", category: "key_clauses", description: "Required co-tenants and remedies" },
  { name: "Exclusive Use", category: "key_clauses", description: "Exclusive use provisions and restrictions" },
  { name: "Go-Dark Provisions", category: "key_clauses", description: "Can tenant cease operations?" },
  { name: "Assignment and Subletting", category: "key_clauses", description: "Transfer rights and restrictions" },
  { name: "SNDA", category: "key_clauses", description: "Subordination, Non-Disturbance, Attornment" },
  { name: "Estoppel Requirements", category: "key_clauses", description: "Estoppel certificate delivery obligations" },
  { name: "Holdover Provisions", category: "key_clauses", description: "Terms if tenant stays past expiration" },
  { name: "Default and Cure", category: "key_clauses", description: "Default events and cure periods" },
  { name: "Force Majeure", category: "key_clauses", description: "Force majeure / excusable delay provisions" },
];

export async function GET(_request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) return NextResponse.json([]);

  const { data: templates } = await supabaseAdmin
    .from("lease_abstractor_templates")
    .select("*")
    .eq("workspace_id", profile.workspace_id)
    .order("created_at", { ascending: true });

  if (!templates || templates.length === 0) {
    // Return a synthetic default template
    return NextResponse.json([{
      id: null,
      name: "Default",
      fields: DEFAULT_FIELDS,
      is_default: true,
    }]);
  }

  return NextResponse.json(templates);
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  const body = await request.json();
  const name = (body.name || "Default").trim();
  const fields = body.fields;

  if (!Array.isArray(fields) || fields.length === 0) {
    return NextResponse.json({ error: "Fields array required" }, { status: 400 });
  }

  // Validate field shape
  for (const f of fields) {
    if (!f.name || !f.category || !f.description) {
      return NextResponse.json({ error: "Each field needs name, category, description" }, { status: 400 });
    }
  }

  // Upsert by workspace + name
  const { data, error } = await supabaseAdmin
    .from("lease_abstractor_templates")
    .upsert(
      {
        workspace_id: profile.workspace_id,
        name,
        fields,
        is_default: body.is_default ?? false,
        created_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,name" },
    )
    .select()
    .single();

  if (error) {
    console.error("Template save:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
