import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  // service role so we can join freely in dev
  process.env.SUPABASE_SERVICE_ROLE!
);

/**
 * Returns upcoming tasks (with contact info) ordered by due_at.
 * For now this returns tasks across the project (dev convenience).
 * You can scope by workspace later if desired.
 */
export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    const { data, error } = await supabase
      .from("tasks")
      .select("id,title,due_at,status,contacts(id,name,phone,email)")
      .order("due_at", { ascending: true })
      .limit(300);

    if (error) {
      console.error("Fetch tasks error:", error);
      return res.status(500).json({ ok: false, error: error.message });
    }

    // Normalize the contact shape to `contact`
    const tasks = (data ?? []).map((t: any) => ({
      id: t.id,
      title: t.title,
      due_at: t.due_at,
      status: t.status,
      contact: Array.isArray(t.contacts) ? t.contacts[0] : t.contacts, // depending on PostgREST join shape
    }));

    res.status(200).json(tasks);
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ ok: false, error: e?.message || "unknown error" });
  }
}
