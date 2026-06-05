// POST /api/dante/evals/seed — seed built-in eval suites for the workspace.
//
// Creates the lease abstraction and deal underwriting eval suites.
// Idempotent — skips suites that already exist in the workspace.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isOwner } from "@/lib/rbac";
import { LEASE_ABSTRACTION_SUITE } from "@/lib/dante/eval/lease-abstraction-suite";
import { DEAL_UNDERWRITING_SUITE } from "@/lib/dante/eval/deal-underwriting-suite";

export const dynamic = "force-dynamic";

export async function POST() {
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

  const BUILTIN_SUITES = [LEASE_ABSTRACTION_SUITE, DEAL_UNDERWRITING_SUITE];
  const results: { name: string; status: string; suite_id?: string; case_count?: number }[] = [];

  for (const suiteDef of BUILTIN_SUITES) {
    // Check if already seeded
    const { count } = await supabaseAdmin
      .from("dante_eval_suites")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("name", suiteDef.name);

    if (count && count > 0) {
      results.push({ name: suiteDef.name, status: "already_exists" });
      continue;
    }

    // Create suite
    const { data: suite, error: suiteErr } = await supabaseAdmin
      .from("dante_eval_suites")
      .insert({
        workspace_id: workspaceId,
        name: suiteDef.name,
        description: suiteDef.description,
        eval_type: suiteDef.eval_type,
        tags: suiteDef.tags,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (suiteErr || !suite) {
      results.push({ name: suiteDef.name, status: "error" });
      continue;
    }

    // Insert cases
    const caseRows = suiteDef.cases.map((c) => ({
      suite_id: suite.id,
      name: c.name,
      input: c.input,
      expected: (c as { expected?: unknown }).expected || null,
      assertions: c.assertions,
      weight: c.weight,
      tags: [],
    }));

    const { error: casesErr } = await supabaseAdmin
      .from("dante_eval_cases")
      .insert(caseRows);

    if (casesErr) {
      results.push({ name: suiteDef.name, status: "error" });
      continue;
    }

    results.push({
      name: suiteDef.name,
      status: "seeded",
      suite_id: suite.id,
      case_count: caseRows.length,
    });
  }

  return NextResponse.json({
    status: results.every((r) => r.status === "already_exists") ? "already_seeded" : "seeded",
    suites: results,
  });
}
