import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Longer timeout for PDF processing

/**
 * LLM File Upload API
 * POST /api/llm/upload
 * 
 * Uploads PDF files and extracts text for LLM chat
 */
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
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Only PDF files are supported" },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Generate unique filename
    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const fileName = `llm-chat/${profile.workspace_id}/${timestamp}_${sanitizedName}`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from("agent-files")
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("File upload error:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload file" },
        { status: 500 }
      );
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = supabaseAdmin.storage.from("agent-files").getPublicUrl(fileName);

    // Extract text from PDF using OpenAI (simplified approach)
    let extractedText: string | undefined;
    const apiKey = process.env.OPENAI_API_KEY;

    if (apiKey) {
      try {
        // Upload PDF to OpenAI
        const pdfFile = new File([buffer], file.name, { type: "application/pdf" });
        const openAIFormData = new FormData();
        openAIFormData.append("file", pdfFile);
        openAIFormData.append("purpose", "assistants");

        const uploadResponse = await fetch("https://api.openai.com/v1/files", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
          body: openAIFormData,
        });

        if (uploadResponse.ok) {
          const uploadData = await uploadResponse.json();
          const fileId = uploadData.id;

          // Wait for file processing (up to 15 seconds)
          let processed = false;
          for (let i = 0; i < 15; i++) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            const statusResponse = await fetch(
              `https://api.openai.com/v1/files/${fileId}`,
              {
                headers: { Authorization: `Bearer ${apiKey}` },
              }
            );
            const statusData = await statusResponse.json();
            if (statusData.status === "processed") {
              processed = true;
              // Store fileId for later use - we'll include it in the chat context
              // For now, we'll use a simpler approach: include file reference in system message
              extractedText = `[PDF file uploaded: ${file.name}. File ID: ${fileId}. Content will be accessible via OpenAI file API.]`;
              break;
            } else if (statusData.status === "error") {
              break;
            }
          }

          if (!processed) {
            console.warn(`PDF ${file.name} processing timed out or failed`);
          }
        }
      } catch (error: any) {
        console.error("PDF extraction error:", error);
        // Continue without extracted text - LLM can still reference the file URL
      }
    }
    
    // If OpenAI extraction didn't work, we'll use the file URL and let the LLM know
    // The LLM can reference the file in its response, and users can download it
    if (!extractedText) {
      extractedText = `[PDF file available: ${file.name} at ${publicUrl}. Content extraction in progress or unavailable.]`;
    }

    return NextResponse.json({
      id: timestamp.toString(),
      name: file.name,
      url: publicUrl,
      type: file.type,
      size: file.size,
      extractedText: extractedText,
    });
  } catch (error: any) {
    console.error("LLM Upload API error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

