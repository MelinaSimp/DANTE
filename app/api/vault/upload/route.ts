// app/api/vault/upload/route.ts
//
// Workspace-scoped file upload for the Vault. Reuses the existing
// `agent-files` Supabase storage bucket (no point spinning up a
// second one for the same workspace-private content) but namespaces
// vault uploads under `vault/<workspace_id>/...` so they're easy to
// audit / cleanup.
//
// Mirrors /api/upload's response shape ({ url, fileName, fileSize,
// fileType }) so VaultClient can treat it as a drop-in.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("workspace_id")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile?.workspace_id) {
      return NextResponse.json({ error: "No workspace" }, { status: 400 });
    }
    const workspaceId = profile.workspace_id;

    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) {
      return NextResponse.json({ error: "File required" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const fileName = `vault/${workspaceId}/${timestamp}_${sanitizedName}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("agent-files")
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("vault upload storage error:", uploadError);
      return NextResponse.json(
        { error: uploadError.message || "Failed to upload file" },
        { status: 500 }
      );
    }

    const {
      data: { publicUrl },
    } = supabaseAdmin.storage.from("agent-files").getPublicUrl(fileName);

    return NextResponse.json({
      url: publicUrl,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
    });
  } catch (error: any) {
    console.error("vault upload error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to upload file" },
      { status: 500 }
    );
  }
}
