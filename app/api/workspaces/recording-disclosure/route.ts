// GET/POST /api/workspaces/recording-disclosure
//
// Lets a workspace admin read and override the call-recording
// disclosure spoken at the start of every voice call. When the column
// is null/empty, the runtime falls back to DEFAULT_RECORDING_DISCLOSURE
// in lib/voice/disclosure.ts.
//
// We keep this endpoint tiny on purpose: a single scalar field, a
// 600-char cap (long enough for a regulator-approved paragraph, short
// enough that we don't accidentally spend $0.02 of TTS on every call),
// and admin-only gating.

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isWorkspaceAdmin } from "@/lib/rbac";
import { DEFAULT_RECORDING_DISCLOSURE } from "@/lib/voice/disclosure";

export const dynamic = "force-dynamic";

const MAX_LEN = 600;

async function requireAdmin() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.workspace_id) {
    return { error: NextResponse.json({ error: "No workspace" }, { status: 400 }) };
  }
  if (!isWorkspaceAdmin(profile.role)) {
    return {
      error: NextResponse.json(
        { error: "Only workspace admins can edit the recording disclosure." },
        { status: 403 },
      ),
    };
  }
  return { workspaceId: profile.workspace_id as string };
}

export async function GET() {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx.error;

  const { data } = await supabaseAdmin
    .from("workspaces")
    .select("recording_disclosure")
    .eq("id", ctx.workspaceId)
    .maybeSingle();

  return NextResponse.json({
    disclosure: data?.recording_disclosure ?? null,
    default: DEFAULT_RECORDING_DISCLOSURE,
  });
}

export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx.error;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // null / empty clears the override and reverts to the default.
  const raw = body?.disclosure;
  let value: string | null;
  if (raw === null || raw === undefined) {
    value = null;
  } else if (typeof raw !== "string") {
    return NextResponse.json({ error: "disclosure must be a string" }, { status: 400 });
  } else {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      value = null;
    } else if (trimmed.length > MAX_LEN) {
      return NextResponse.json(
        { error: `Disclosure must be ${MAX_LEN} characters or fewer.` },
        { status: 400 },
      );
    } else {
      value = trimmed;
    }
  }

  const { error } = await supabaseAdmin
    .from("workspaces")
    .update({ recording_disclosure: value })
    .eq("id", ctx.workspaceId);

  if (error) {
    console.error("[workspaces/recording-disclosure] update failed:", error);
    return NextResponse.json({ error: "Failed to save." }, { status: 500 });
  }

  return NextResponse.json({
    disclosure: value,
    default: DEFAULT_RECORDING_DISCLOSURE,
  });
}
