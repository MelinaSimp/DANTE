import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { hasSuperadminAccess } from "@/lib/superadmin";
import { voidInvoice } from "@/lib/billing/invoices";

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

// POST — delete a draft, or void a finalized invoice.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await verifySuperadmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  try {
    const result = await voidInvoice(id);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to void invoice" },
      { status: 500 },
    );
  }
}
