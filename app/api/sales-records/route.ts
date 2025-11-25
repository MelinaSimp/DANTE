// app/api/sales-records/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const { data: records, error } = await supabaseAdmin
      .from("sales_records")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching sales records:", error);
      return NextResponse.json({ error: "Failed to fetch records" }, { status: 500 });
    }

    return NextResponse.json(records || []);
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { product, price, month, day, year, company_name } = body;

    if (!product || !price || !month || !day || !year || !company_name) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 });
    }

    const { data: record, error } = await supabaseAdmin
      .from("sales_records")
      .insert([{
        product,
        price: parseFloat(price),
        month: parseInt(month),
        day: parseInt(day),
        year: parseInt(year),
        company_name,
      }])
      .select("*")
      .single();

    if (error) {
      console.error("Error creating sales record:", error);
      return NextResponse.json({ error: "Failed to create record" }, { status: 500 });
    }

    return NextResponse.json(record);
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
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
      console.error("Error deleting sales record:", error);
      return NextResponse.json({ error: "Failed to delete record" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
