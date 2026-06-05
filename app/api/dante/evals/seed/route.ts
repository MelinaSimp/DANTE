// POST /api/dante/evals/seed — seed built-in eval suites for the workspace.
//
// Creates the lease abstraction eval suite with 5 test cases. Idempotent
// — skips if the suite already exists in the workspace.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isOwner } from "@/lib/rbac";
import { LEASE_ABSTRACTION_SUITE } from "@/lib/dante/eval/lease-abstraction-suite";

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

  // Check if already seeded
  const { count } = await supabaseAdmin
    .from("dante_eval_suites")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("name", LEASE_ABSTRACTION_SUITE.name);

  if (count && count > 0) {
    return NextResponse.json({ status: "already_seeded" });
  }

  // Create suite
  const { data: suite, error: suiteErr } = await supabaseAdmin
    .from("dante_eval_suites")
    .insert({
      workspace_id: workspaceId,
      name: LEASE_ABSTRACTION_SUITE.name,
      description: LEASE_ABSTRACTION_SUITE.description,
      eval_type: LEASE_ABSTRACTION_SUITE.eval_type,
      tags: LEASE_ABSTRACTION_SUITE.tags,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (suiteErr || !suite) {
    return NextResponse.json(
      { error: suiteErr?.message || "Failed to create suite" },
      { status: 500 },
    );
  }

  // Insert cases
  const caseRows = LEASE_ABSTRACTION_SUITE.cases.map((c) => ({
    suite_id: suite.id,
    name: c.name,
    input: c.input,
    expected: c.expected || null,
    assertions: c.assertions,
    weight: c.weight,
    tags: [],
  }));

  const { error: casesErr } = await supabaseAdmin
    .from("dante_eval_cases")
    .insert(caseRows);

  if (casesErr) {
    return NextResponse.json(
      { error: casesErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    status: "seeded",
    suite_id: suite.id,
    case_count: caseRows.length,
  });
}
