import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { hasSuperadminAccess } from "@/lib/superadmin";
import { createDraftInvoice, listInvoices, type InvoiceLineInput } from "@/lib/billing/invoices";

export const dynamic = "force-dynamic";

async function verifySuperadmin() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_superadmin")
    .eq("id", user.id)
    .maybeSingle();
  if (!hasSuperadminAccess(user.email, profile?.is_superadmin)) return null;
  return user;
}

// GET — list recent invoices (live status from Stripe)
export async function GET() {
  if (!(await verifySuperadmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const invoices = await listInvoices(50);
    return NextResponse.json({ invoices });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load invoices" },
      { status: 500 },
    );
  }
}

// POST — create a DRAFT invoice (does not send)
export async function POST(req: NextRequest) {
  if (!(await verifySuperadmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: {
    company_name?: string;
    email?: string;
    line_items?: InvoiceLineInput[];
    due_days?: number;
    currency?: string;
    memo?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const companyName = (body.company_name || "").trim();
  const email = (body.email || "").trim();
  const lines = (body.line_items || []).filter(
    (l) => l && l.description?.trim() && Number(l.unit_amount) > 0,
  );

  if (!companyName) return NextResponse.json({ error: "Company name is required" }, { status: 400 });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return NextResponse.json({ error: "A valid company email is required" }, { status: 400 });
  if (lines.length === 0)
    return NextResponse.json({ error: "Add at least one line item with a description and amount" }, { status: 400 });

  try {
    const invoice = await createDraftInvoice({
      company_name: companyName,
      email,
      line_items: lines,
      due_days: body.due_days,
      currency: body.currency,
      memo: body.memo,
    });
    return NextResponse.json({ invoice });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create invoice" },
      { status: 500 },
    );
  }
}
