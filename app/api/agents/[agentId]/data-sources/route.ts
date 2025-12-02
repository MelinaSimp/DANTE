import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

async function getWorkspace(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { workspaceId: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  return { workspaceId: profile?.workspace_id ?? null };
}

export async function GET(
  req: NextRequest,
  { params }: { params: { agentId: string } }
) {
  const { workspaceId } = await getWorkspace(req);
  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify agent belongs to workspace
  const { data: agent } = await supabaseAdmin
    .from("agents")
    .select("workspace_id")
    .eq("id", params.agentId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin
    .from("agent_data_sources")
    .select("*")
    .eq("agent_id", params.agentId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch data sources", error);
    return NextResponse.json({ error: "Failed to fetch data sources" }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { agentId: string } }
) {
  const { workspaceId } = await getWorkspace(req);
  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify agent belongs to workspace
  const { data: agent } = await supabaseAdmin
    .from("agents")
    .select("workspace_id")
    .eq("id", params.agentId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const body = await req.json();
  const { name, type, content, file_url, file_size, file_type } = body;

  if (!name || !type) {
    return NextResponse.json({ error: "Name and type are required" }, { status: 400 });
  }

  // Extract text from PDF if it's a PDF file using OpenAI's file API
  let extractedContent = type === "text" ? content : null;
  
  if (type === "file" && file_url && file_type === "application/pdf") {
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        console.warn("OpenAI API key not configured, skipping PDF extraction");
      } else {
        // Fetch the PDF file
        const pdfResponse = await fetch(file_url);
        if (pdfResponse.ok) {
          const pdfBuffer = await pdfResponse.arrayBuffer();
          const pdfFile = new File([pdfBuffer], name, { type: "application/pdf" });
          
          try {
            // Upload file to OpenAI
            const formData = new FormData();
            formData.append("file", pdfFile);
            formData.append("purpose", "assistants");
            
            const uploadResponse = await fetch("https://api.openai.com/v1/files", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${apiKey}`,
              },
              body: formData,
            });
            
            if (!uploadResponse.ok) {
              throw new Error(`OpenAI upload failed: ${uploadResponse.statusText}`);
            }
            
            const uploadData = await uploadResponse.json();
            const fileId = uploadData.id;
            
            // Wait for file processing (OpenAI needs time to process PDFs)
            let processed = false;
            for (let i = 0; i < 10; i++) {
              await new Promise(resolve => setTimeout(resolve, 1000));
              const statusResponse = await fetch(`https://api.openai.com/v1/files/${fileId}`, {
                headers: { "Authorization": `Bearer ${apiKey}` },
              });
              const statusData = await statusResponse.json();
              if (statusData.status === "processed") {
                processed = true;
                break;
              }
            }
            
            if (!processed) {
              console.warn(`PDF ${name} processing timed out`);
            }
            
            // Use OpenAI's assistants API to extract text from the PDF
            // Create a temporary assistant to read the file
            const assistantResponse = await fetch("https://api.openai.com/v1/assistants", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "OpenAI-Beta": "assistants=v2",
              },
              body: JSON.stringify({
                model: "gpt-4o-mini",
                instructions: "Extract all text content from the provided PDF file. Return only the extracted text, nothing else.",
                tools: [{ type: "file_search" }],
                tool_resources: {
                  file_search: {
                    vector_store_ids: [],
                  },
                },
              }),
            });
            
            if (!assistantResponse.ok) {
              throw new Error(`Failed to create assistant: ${assistantResponse.statusText}`);
            }
            
            const assistantData = await assistantResponse.json();
            const assistantId = assistantData.id;
            
            // Create a thread and run to extract text
            const threadResponse = await fetch("https://api.openai.com/v1/threads", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "OpenAI-Beta": "assistants=v2",
              },
              body: JSON.stringify({
                messages: [{
                  role: "user",
                  content: `Please extract all text content from the attached PDF file. Return only the extracted text.`,
                  attachments: [{ file_id: fileId, tools: [{ type: "file_search" }] }],
                }],
              }),
            });
            
            if (!threadResponse.ok) {
              throw new Error(`Failed to create thread: ${threadResponse.statusText}`);
            }
            
            const threadData = await threadResponse.json();
            const threadId = threadData.id;
            
            // Create a run to process the file
            const runResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "OpenAI-Beta": "assistants=v2",
              },
              body: JSON.stringify({
                assistant_id: assistantId,
              }),
            });
            
            if (!runResponse.ok) {
              throw new Error(`Failed to create run: ${runResponse.statusText}`);
            }
            
            let runData = await runResponse.json();
            let runId = runData.id;
            
            // Poll for completion
            for (let i = 0; i < 30; i++) {
              await new Promise(resolve => setTimeout(resolve, 2000));
              const runStatusResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}`, {
                headers: {
                  "Authorization": `Bearer ${apiKey}`,
                  "OpenAI-Beta": "assistants=v2",
                },
              });
              runData = await runStatusResponse.json();
              
              if (runData.status === "completed") {
                // Get the messages
                const messagesResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
                  headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "OpenAI-Beta": "assistants=v2",
                  },
                });
                const messagesData = await messagesResponse.json();
                const assistantMessage = messagesData.data.find((m: any) => m.role === "assistant");
                if (assistantMessage && assistantMessage.content[0]?.text?.value) {
                  extractedContent = assistantMessage.content[0].text.value.trim();
                  console.log(`Successfully extracted ${extractedContent.length} characters from PDF ${name} using OpenAI`);
                }
                break;
              } else if (runData.status === "failed" || runData.status === "cancelled") {
                throw new Error(`Run ${runData.status}: ${runData.last_error?.message || "Unknown error"}`);
              }
            }
            
            // Cleanup: delete assistant, thread, and file
            try {
              await Promise.all([
                fetch(`https://api.openai.com/v1/assistants/${assistantId}`, {
                  method: "DELETE",
                  headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "OpenAI-Beta": "assistants=v2",
                  },
                }),
                fetch(`https://api.openai.com/v1/threads/${threadId}`, {
                  method: "DELETE",
                  headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "OpenAI-Beta": "assistants=v2",
                  },
                }),
                fetch(`https://api.openai.com/v1/files/${fileId}`, {
                  method: "DELETE",
                  headers: {
                    "Authorization": `Bearer ${apiKey}`,
                  },
                }),
              ]);
            } catch (cleanupError) {
              console.warn("Failed to cleanup OpenAI resources:", cleanupError);
            }
          } catch (parseError: any) {
            console.error(`Error extracting PDF ${name} with OpenAI:`, parseError);
            extractedContent = null;
          }
        }
      }
    } catch (error) {
      console.error("Error fetching PDF for extraction:", error);
      // Continue without extracted content
    }
  }

  const { data, error } = await supabaseAdmin
    .from("agent_data_sources")
    .insert({
      agent_id: params.agentId,
      name,
      type,
      content: extractedContent,
      file_url: type === "file" ? file_url : null,
      file_size: type === "file" ? file_size : null,
      file_type: type === "file" ? file_type : null,
    })
    .select("*")
    .single();

  if (error) {
    console.error("Failed to create data source", error);
    return NextResponse.json({ error: "Failed to create data source" }, { status: 500 });
  }

  return NextResponse.json(data);
}
