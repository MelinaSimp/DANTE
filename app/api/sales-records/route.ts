import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasSuperadminAccess } from "@/lib/superadmin";
import { emitEvent } from "@/lib/automations";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_superadmin")
    .eq("id", user.id)
    .maybeSingle();

  // sales_records is a global, owner-level revenue ledger (no workspace
  // scoping) surfaced only in Admin -> Analytics. Restrict to superadmins so a
  // regular workspace user can't read the whole platform's sales.
  if (!hasSuperadminAccess(user.email, profile?.is_superadmin)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { data: records, error } = await supabaseAdmin
      .from("sales_records")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: "Failed to fetch records" }, { status: 500 });
    }

    const normalized = (records || []).map((r: any) => ({
      id: r.id,
      description: r.description || r.product || "",
      amount: r.amount ?? r.price ?? 0,
      category: r.category || "other",
      date: r.date || r.created_at || new Date().toISOString(),
      product: r.product,
      company_name: r.company_name,
      created_at: r.created_at,
    }));

    return NextResponse.json(normalized);
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles").select("is_superadmin").eq("id", user.id).maybeSingle();
  if (!hasSuperadminAccess(user.email, profile?.is_superadmin)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();

    const insertData: Record<string, any> = {};

    if (body.description !== undefined) {
      insertData.product = body.description;
      insertData.price = parseFloat(body.amount) || 0;
      insertData.company_name = body.category || "other";
      const now = new Date();
      insertData.month = now.getMonth() + 1;
      insertData.day = now.getDate();
      insertData.year = now.getFullYear();
    } else {
      const { product, price, month, day, year, company_name } = body;
      if (!product || !price || !month || !day || !year || !company_name) {
        return NextResponse.json({ error: "All fields are required" }, { status: 400 });
      }
      insertData.product = product;
      insertData.price = parseFloat(price);
      insertData.month = parseInt(month);
      insertData.day = parseInt(day);
      insertData.year = parseInt(year);
      insertData.company_name = company_name;
    }

    const { data: record, error } = await supabaseAdmin
      .from("sales_records")
      .insert([insertData])
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: "Failed to create record" }, { status: 500 });
    }

    emitEvent("sale.recorded", {
      id: record.id,
      product: record.product,
      price: record.price,
      company_name: record.company_name,
    });

    return NextResponse.json({
      id: record.id,
      description: record.product,
      amount: record.price,
      category: record.company_name || "other",
      date: record.created_at,
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles").select("is_superadmin").eq("id", user.id).maybeSingle();
  if (!hasSuperadminAccess(user.email, profile?.is_superadmin)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Record ID is required" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("sales_records")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: "Failed to delete record" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
