import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function getWorkspace(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { workspaceId: null, userId: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  return { workspaceId: profile?.workspace_id ?? null, userId: user.id };
}

export async function POST(req: NextRequest) {
  try {
    const { workspaceId, userId } = await getWorkspace(req);
    if (!workspaceId || !userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const agentId = formData.get("agentId") as string;
    const category = formData.get("category") as string; // 'policies', 'data-sources', 'supporting-docs'

    if (!file || !agentId || !category) {
      return NextResponse.json(
        { error: "File, agentId, and category are required" },
        { status: 400 }
      );
    }

    // Verify agent belongs to workspace
    const { data: agent } = await supabaseAdmin
      .from("agents")
      .select("workspace_id")
      .eq("id", agentId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Generate unique filename
    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const fileName = `${agentId}/${category}/${timestamp}_${sanitizedName}`;

    // Upload to Supabase Storage
    console.log("[Upload] Uploading file to bucket 'agent-files':", fileName);
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from("agent-files")
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("[Upload] File upload error:", uploadError);
      console.error("[Upload] Error details:", JSON.stringify(uploadError, null, 2));
      return NextResponse.json(
        { error: "Failed to upload file", details: uploadError.message, code: uploadError.statusCode },
        { status: 500 }
      );
    }

    console.log("[Upload] File uploaded successfully:", uploadData);

    // Get public URL (bucket should be public now)
    const {
      data: { publicUrl },
    } = supabaseAdmin.storage.from("agent-files").getPublicUrl(fileName);

    console.log("[Upload] Generated public URL:", publicUrl);

    // Verify the file exists by checking if we can list it
    const { data: listData, error: listError } = await supabaseAdmin.storage
      .from("agent-files")
      .list(`${agentId}/${category}`, {
        limit: 100,
        search: sanitizedName,
      });

    if (listError) {
      console.error("[Upload] Error listing files:", listError);
    } else {
      console.log("[Upload] Files in directory:", listData);
    }

    return NextResponse.json({
      url: publicUrl,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
    });
  } catch (error: any) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to upload file" },
      { status: 500 }
    );
  }
}








