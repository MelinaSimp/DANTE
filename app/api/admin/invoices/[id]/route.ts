import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { hasSuperadminAccess } from "@/lib/superadmin";
import { getInvoiceDetail } from "@/lib/billing/invoices";

export const dynamic = "force-dynamic";

async function verifySuperadmin() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles").select("is_superadmin").eq("id", user.id).maybeSingle();
  if (!hasSuperadminAccess(user.email, profile?.is_superadmin)) return null;
  return user;
}

// GET — full invoice detail (line items, memo, payment methods) for the preview.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await verifySuperadmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  try {
    const invoice = await getInvoiceDetail(id);
    return NextResponse.json({ invoice });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load invoice" },
      { status: 500 },
    );
  }
}
