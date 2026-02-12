import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * LLM Chat API
 * POST /api/llm/chat
 * 
 * ChatGPT-style interface for direct LLM interaction (branded as "Drift")
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

    const {
      message,
      history = [],
      agentId,
      chatId,
      files = [],
      images = [],
      contactId,
      extractedTextFromPages,
      templateId,
      templateName,
      templateDocumentId,
    } = await req.json();

    console.log("[LLM Chat] Request:", { templateName, templateDocumentId, imagesCount: images?.length, hasExtractedText: !!extractedTextFromPages, messagePreview: (message || "").substring(0, 100) });

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 }
      );
    }

    // Load guidelines/templates if available
    let guidelinesContent = "";
    if (agentId || chatId) {
      try {
        let guidelinesQuery = supabaseAdmin
          .from("llm_guidelines")
          .select("template, name, is_agent_template, pdf_url, pdf_extracted_text, image_instructions, pdf_annotations")
          .eq("is_active", true)
          .order("is_agent_template", { ascending: false });

        if (agentId && chatId) {
          guidelinesQuery = guidelinesQuery.or(`agent_id.eq.${agentId},chat_id.eq.${chatId}`);
        } else if (agentId) {
          guidelinesQuery = guidelinesQuery.eq("agent_id", agentId);
        } else if (chatId) {
          guidelinesQuery = guidelinesQuery.eq("chat_id", chatId);
        }

        const { data: guidelines } = await guidelinesQuery;

        if (guidelines && guidelines.length > 0) {
          // Filter out guidelines with no content and combine all active guidelines
          const validGuidelines = guidelines.filter((g) => {
            const hasContent = (g.pdf_extracted_text && g.pdf_extracted_text.trim() !== "") || 
                              (g.template && g.template.trim() !== "");
            return hasContent;
          });

          if (validGuidelines.length > 0) {
            // Combine all active guidelines, prioritizing agent-level templates
            const combinedTemplate = validGuidelines
              .map((g) => {
                let content = "";
                
                // Use PDF extracted text if available, otherwise use template text
                const mainContent = g.pdf_extracted_text || g.template || "";
                if (mainContent) {
                  content += mainContent;
                }
                
                // Add PDF annotations if present
                if (g.pdf_annotations && Array.isArray(g.pdf_annotations) && g.pdf_annotations.length > 0) {
                  content += "\n\n--- PDF ANNOTATIONS ---\n";
                  content += "The following annotations provide additional context about the PDF template:\n";
                  g.pdf_annotations.forEach((ann: any) => {
                    if (ann.annotation) {
                      content += `\n[Page ${ann.page || 'N/A'}${ann.section ? ` - ${ann.section}` : ''}]: ${ann.annotation}`;
                      if (ann.highlight) {
                        content += `\n  Key Points: ${ann.highlight}`;
                      }
                    }
                  });
                }
                
                return `[${g.name}]\n${content}`;
              })
              .join("\n\n---\n\n");
            
            // Collect image instructions from all guidelines
            const imageInstructionsList = validGuidelines
              .filter((g) => g.image_instructions && g.image_instructions.trim() !== "")
              .map((g) => g.image_instructions)
              .join("\n\n");
            
            guidelinesContent = `\n\nCUSTOM GUIDELINES & TEMPLATES:\nThe user has provided specific guidelines and templates that you MUST follow. These override default behavior when applicable:\n\n${combinedTemplate}`;
            
            if (imageInstructionsList) {
              guidelinesContent += `\n\n--- IMAGE HANDLING INSTRUCTIONS ---\nThe following instructions apply when working with images:\n${imageInstructionsList}`;
            }
            
            guidelinesContent += `\n\nWhen following these guidelines, pay attention to inline comments (marked with // or #) as they provide important context about what to do.`;
          }
        }
      } catch (error) {
        console.error("Error loading guidelines:", error);
        // Continue without guidelines if there's an error
      }
    }

    // Track chart requirements for the user message reminder
    let requiredChartCount = 0;
    let chartRequirementsList: string[] = [];

    // Build system message after guidelines are finalized
    let systemContent = `You are Drift, a helpful AI assistant. Be friendly, concise, and helpful. Answer questions clearly and provide useful information.

CRITICAL RULES:
1. SPELLING & GRAMMAR: 
   - ALWAYS use correct spelling and grammar. This is non-negotiable.
   - Double-check and proofread EVERY response before sending.
   - Pay special attention to: technical terms, proper nouns, names, numbers, dates, and units of measurement.
   - If you are unsure about spelling, use a dictionary or verify the correct spelling.
   - Common misspellings are NOT acceptable. Examples: "recieve" → "receive", "seperate" → "separate", "definately" → "definitely".
   - For technical terms, use the standard spelling (e.g., "JavaScript" not "Javascript", "API" not "Api").
   - NEVER send a response with misspellings or typos. If you catch an error, correct it immediately.

2. DATA VISUALIZATION: 
   - When data contains numbers (tables, allocations, performance figures), you MUST generate chart visualizations.
   - NEVER use markdown images like ![Chart](#) or describe charts in text. ALWAYS output actual data in <!--CHART_DATA--> blocks.
   - For distributions/allocations: Use "pie"
   - For comparisons/performance: Use "bar"
   - For time series: Use "line" or "area"
   - The format MUST be exactly (single line JSON, no line breaks inside):
     <!--CHART_DATA-->{"chart":{"type":"pie","data":[{"x":"Label","y":100}],"xKey":"x","yKey":"y","title":"Title"}}<!--/CHART_DATA-->
   - Generate charts automatically even if the user doesn't explicitly ask.

3. GUIDELINES & TEMPLATES: When analyzing data or documents, ALWAYS follow these key points in order:
   a) PURPOSE: Identify the main purpose/goal of the data or document
   b) METRICS: Extract and list all key metrics, numbers, and quantitative data
   c) TRENDS: Note important trends, patterns, or changes over time
   d) ANOMALIES: Highlight any anomalies, outliers, or unexpected values
   e) INSIGHTS: Provide actionable insights and recommendations
   f) CONTEXT: Consider broader context and implications
   g) NEXT STEPS: Suggest logical next steps or follow-up questions
   
   Always structure your analysis using these sections when dealing with data or documents.

You CAN generate PDFs - when users ask for a PDF, provide the content in a well-formatted way that can be converted to PDF. Use clear headings, bullet points, and organized sections.${guidelinesContent}`;

    // When using a saved template, load template annotations and tell the model how to handle tables vs paragraphs
    if (templateName && (templateId || templateName)) {
      systemContent += `\n\nTEMPLATE MODE: The user is generating content using the saved template "${templateName}".`;
      systemContent += `\n\nThe document to analyze is supplied in this request: look for "EXTRACTED TEXT FROM THE DOCUMENT TO ANALYZE" below, and/or images. If that content is present, the document has already been provided—do NOT ask the user to "provide the document" or "send the document"; proceed to analyze and summarize the supplied text/images. If no extracted text or images appear below, then tell the user: "The document could not be loaded. Please try re-uploading the PDF."`;
      systemContent += `\nUse the supplied document as the source data. Structure your output to match the template's purpose (e.g. one-page summary, sections, charts). If a section from the template cannot be clearly found in the document, say so instead of inventing content.`;

      // Load template document's annotations so we can instruct: box/table = find table + extract (and chart if asked); highlight = paragraph
      if (templateDocumentId && typeof templateDocumentId === "string") {
        try {
          const { data: templateAnnotations, error: annError } = await supabaseAdmin
            .from("document_annotations")
            .select("page_number, type, content")
            .eq("document_id", templateDocumentId)
            .order("page_number");

          console.log("[LLM Chat] Template annotations for doc", templateDocumentId, ":", templateAnnotations?.length ?? 0, "error:", annError?.message ?? "none");

          if (templateAnnotations && templateAnnotations.length > 0) {
            const tableRegions: string[] = [];
            const paragraphRegions: string[] = [];
            // Log all annotations for debugging
            console.log("[LLM Chat] All template annotations:", JSON.stringify(templateAnnotations.map(a => ({ page: a.page_number, type: a.type, content: (a.content || "").substring(0, 80) }))));
            for (const ann of templateAnnotations) {
              const page = ann.page_number;
              const rawContent = (ann.content || "").trim();
              const hasTablePrefix = rawContent.startsWith("[TABLE]");
              const comment = rawContent.replace(/^\[TABLE\]\s*/, "").trim() || "(no comment)";
              // Treat as table/chart if: type is "table", has [TABLE] prefix, OR the comment mentions chart/graph/pie/bar keywords
              const isChartRequest = ann.type === "table" || hasTablePrefix || /\b(chart|graph|pie|bar|line|plot|visuali[sz]e|data table)\b/i.test(comment);
              if (isChartRequest) {
                tableRegions.push(`Page ${page}: ${comment}`);
              } else if (ann.type === "highlight" || ann.type === "comment" || ann.type === "tag") {
                paragraphRegions.push(`Page ${page}: ${comment}`);
              }
            }
            if (tableRegions.length > 0 || paragraphRegions.length > 0) {
              systemContent += `\n\nTEMPLATE ANNOTATIONS – use these to find matching content in the document to analyze:`;
              if (tableRegions.length > 0) {
                requiredChartCount = tableRegions.length;
                chartRequirementsList = tableRegions;
                systemContent += `\n\nDATA TABLES (template marked these as tables; find the same/similar table in the document):\n${tableRegions.map((r, i) => `${i + 1}. ${r}`).join("\n")}`;
                systemContent += `\n
CHART REQUIREMENTS: There are ${tableRegions.length} table annotations above. You MUST output EXACTLY ${tableRegions.length} separate <!--CHART_DATA--> blocks — one for EACH table annotation. Do NOT skip any.

For EACH table annotation above:
RULE 1: Find the matching data table/numbers on that page in the document text.
RULE 2: Extract the actual numbers from it.
RULE 3: Convert them into a <!--CHART_DATA--> JSON block. This is NOT optional — EVERY annotation MUST produce its own chart.
RULE 4: Check the annotation comment for chart type: "bar graph"/"bar chart" → type "bar", "pie chart" → type "pie", "line chart" → type "line". Otherwise default: pie for allocations/distributions, bar for comparisons, line for time series.
RULE 5: Do NOT output markdown images like ![Chart](#). Do NOT describe charts in text. Output the actual JSON data block.
RULE 6: Include a brief text summary of the key numbers BEFORE each chart block.

The EXACT format for chart data (must be on a single line, no line breaks inside the JSON):
<!--CHART_DATA-->{"chart":{"type":"bar","data":[{"x":"Label1","y":123},{"x":"Label2","y":456}],"xKey":"x","yKey":"y","title":"My Chart Title"}}<!--/CHART_DATA-->

EXAMPLE OUTPUT with 2 table annotations (one pie chart, one bar graph):

Asset Allocation:
• Cash: $140,700.68 (3.4%)
• Equity: $359,119.77 (8.7%)
• Other: $3,640,574.70 (87.9%)

<!--CHART_DATA-->{"chart":{"type":"pie","data":[{"x":"Cash","y":140700.68},{"x":"Equity","y":359119.77},{"x":"Other","y":3640574.70}],"xKey":"x","yKey":"y","title":"Asset Allocation"}}<!--/CHART_DATA-->

Performance Summary:
• MTD: -1.47%
• QTD: 1.05%
• YTD: 15.92%

<!--CHART_DATA-->{"chart":{"type":"bar","data":[{"x":"MTD","y":-1.47},{"x":"QTD","y":1.05},{"x":"YTD","y":15.92}],"xKey":"x","yKey":"y","title":"Performance Summary (%)"}}<!--/CHART_DATA-->

CRITICAL CHECKLIST before finishing your response:
✓ Count your <!--CHART_DATA--> blocks. You need EXACTLY ${tableRegions.length}.
✓ Each block must have valid JSON on a single line.
✓ Each block must end with <!--/CHART_DATA-->.
✓ No markdown images anywhere in the response.`;
              }
              if (paragraphRegions.length > 0) {
                systemContent += `\n\nPARAGRAPHS (template marked these as highlights; find the same/similar paragraph or text in the document):\n${paragraphRegions.map((r) => `- ${r}`).join("\n")}`;
              }
            }
          }
        } catch (e) {
          console.warn("Could not load template annotations:", e);
        }
      }

      // Always add chart generation instructions in template mode
      systemContent += `\n\nCHART GENERATION RULES (ALWAYS FOLLOW):
When you encounter data tables, allocation data, or performance numbers in the document, you MUST convert them into interactive charts.
NEVER output markdown images like ![Chart](#) or ![Image](#). These do NOT render.
NEVER just describe what a chart would look like. You MUST output the actual data.
Instead, output chart data in this EXACT format (single line, no line breaks in the JSON):
<!--CHART_DATA-->{"chart":{"type":"pie","data":[{"x":"Label","y":100}],"xKey":"x","yKey":"y","title":"Title"}}<!--/CHART_DATA-->

Chart types: "pie" for allocations/distributions, "bar" for comparisons/performance, "line" for time series.
You MUST generate at least one chart when the document contains numerical data.`;
    }
    if (extractedTextFromPages && typeof extractedTextFromPages === "string" && extractedTextFromPages.trim()) {
      systemContent += `\n\nEXTRACTED TEXT FROM THE DOCUMENT TO ANALYZE:\n${extractedTextFromPages.substring(0, 15000)}`;
      console.log("[LLM Chat] Extracted text length:", extractedTextFromPages.length, "first 300 chars:", extractedTextFromPages.substring(0, 300));
    }

    // Meeting Planner mode: when user uploads PDFs (meeting notes/transcripts) or mentions meetings
    const isMeetingContext = (files && files.length > 0) ||
      /\b(meeting|discussion|transcript|action items|next steps|follow[- ]?up|agenda|minutes)\b/i.test(message);

    if (isMeetingContext) {
      systemContent += `\n\nMEETING PLANNER MODE:
You are acting as an intelligent Meeting Planner for a financial consultant. Your job is to:
1. Analyze meeting notes, transcripts, or discussion PDFs
2. Extract ALL actionable next steps, follow-ups, and decisions
3. Reference the client's existing documents and guidelines (if loaded above) to support your recommendations
4. For each next step, suggest a specific date/time and duration

CRITICAL: When you identify next steps, you MUST output them in BOTH:
a) Natural language summary (for the chat)
b) A structured <!--NEXT_STEPS--> JSON block so the UI can render interactive cards

The <!--NEXT_STEPS--> format (must be valid JSON on multiple lines, wrapped in comment tags):
<!--NEXT_STEPS-->
{"steps":[{"title":"Short action title","description":"Detailed description of what needs to be done","suggested_date":"YYYY-MM-DD","suggested_time":"HH:MM","duration_minutes":30,"priority":"high"}]}
<!--/NEXT_STEPS-->

Priority levels: "high", "medium", "low"
Dates should be realistic future dates from today (${new Date().toISOString().split("T")[0]}).
Times should be during business hours (9:00-17:00).

After presenting next steps, ask the consultant:
"Would you like me to add any of these to your calendar? I can also set up email reminders — when would you like to be reminded?"

Be specific about WHO needs to do WHAT and by WHEN. Reference client data and guidelines when relevant to support your suggestions.`;
    }

    // Add PDF content to system context if files are provided
    if (files && files.length > 0) {
      const pdfInfo: string[] = [];
      files.forEach((file: any) => {
        pdfInfo.push(`- ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
        if (file.extractedText && !file.extractedText.includes("File ID:")) {
          // Only include actual extracted text, not file IDs
          pdfInfo.push(`  Content preview: ${file.extractedText.substring(0, 2000)}...`);
        }
      });
      
      systemContent += `\n\nThe user has uploaded ${files.length} PDF file(s). You can reference these files when answering questions. File details:\n${pdfInfo.join("\n")}\n\nWhen answering questions about the PDFs, be specific and reference the content. If asked to "spit out" or show the PDF content, provide a summary of the key information from the documents.`;
    }
    
    const messages: Array<{ 
      role: "user" | "assistant" | "system"; 
      content: string | Array<{ type: "text" | "image_url"; text?: string; image_url?: { url: string } }> 
    }> = [
      {
        role: "system",
        content: systemContent,
      },
    ];

    // Add conversation history (last 5 messages for lower latency)
    history.slice(-5).forEach((msg: any) => {
      if (msg.role && msg.content) {
        messages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    });

    // Add current message with file references
    let userMessage = message.trim();
    
    // Detect if user provided data (spreadsheet, table, or structured data)
    const hasDataPattern = /(?:spreadsheet|table|data|chart|graph|visualize|plot|numbers|statistics|metrics|values|rows|columns)/i.test(userMessage);
    const hasTablePattern = /(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|q1|q2|q3|q4|202[0-9]|202[0-9])/i.test(userMessage);
    const hasNumberPattern = /(?:\d+[,\s]+\d+|\d+\.\d+)/.test(userMessage);
    
    if (hasDataPattern || hasTablePattern || hasNumberPattern) {
      systemContent += `\n\nIMPORTANT: The user has provided data that should be visualized. When you detect data (numbers, tables, spreadsheets, or time-series data), you MUST:
1. Parse the data structure
2. Identify the appropriate chart type (line for time series, bar for comparisons, pie for distributions)
3. Generate a JSON structure for the chart in this format:
{
  "chart": {
    "type": "line|bar|pie|area",
    "data": [{"x": "value1", "y": 100}, {"x": "value2", "y": 200}],
    "xKey": "x",
    "yKey": "y",
    "title": "Chart Title"
  }
}
4. Include the JSON in a code block marked with <!--CHART_DATA-->
5. Provide a brief explanation of what the chart shows`;
    }
    
    // Build user message with images and files
    const userMessageContent: Array<{ type: "text" | "image_url"; text?: string; image_url?: { url: string } }> = [];
    
    // Add text content
    if (userMessage.trim().length > 0) {
      userMessageContent.push({ type: "text", text: userMessage });
    }
    
    // Add images (base64 encoded)
    if (images && images.length > 0) {
      images.forEach((img: any) => {
        if (img.imageBase64) {
          // Determine MIME type from file extension or type
          let mimeType = "image/png";
          if (img.type) {
            mimeType = img.type;
          } else if (img.name) {
            const ext = img.name.toLowerCase().split('.').pop();
            const mimeTypes: Record<string, string> = {
              'jpg': 'image/jpeg',
              'jpeg': 'image/jpeg',
              'png': 'image/png',
              'gif': 'image/gif',
              'webp': 'image/webp',
            };
            mimeType = mimeTypes[ext || ''] || 'image/png';
          }
          
          userMessageContent.push({
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${img.imageBase64}`
            }
          });
        }
      });
    }
    
    // Add file references to text
    if (files && files.length > 0) {
      const fileNames = files.map((f: any) => f.name).join(", ");
      const fileText = `\n\n[User has attached ${files.length} PDF file(s): ${fileNames}. Please reference the content from these files when answering.]`;
      
      if (userMessageContent.length > 0 && userMessageContent[0].type === "text") {
        userMessageContent[0].text += fileText;
      } else {
        userMessageContent.unshift({ type: "text", text: fileText });
      }
    }
    
    // If no text content, add a default message
    if (userMessageContent.length === 0) {
      userMessageContent.push({ type: "text", text: "Please analyze this image." });
    }

    // Add chart count reminder at the end of the user message (recency bias helps LLMs follow instructions)
    if (requiredChartCount > 0) {
      const chartReminder = `\n\n[IMPORTANT REMINDER: Your response MUST contain exactly ${requiredChartCount} <!--CHART_DATA--> blocks. The template requires charts for: ${chartRequirementsList.join("; ")}. Each one needs its own <!--CHART_DATA-->...<!--/CHART_DATA--> JSON block. Do not skip any.]`;
      if (userMessageContent.length > 0 && userMessageContent[0].type === "text") {
        userMessageContent[0].text += chartReminder;
      } else {
        userMessageContent.unshift({ type: "text", text: chartReminder });
      }
    }
    
    messages.push({
      role: "user",
      content: userMessageContent,
    });

    // Call OpenAI API
    // Use gpt-4o for template mode (better at following complex chart instructions), gpt-4o-mini otherwise
    const model = (templateName && requiredChartCount > 0) ? "gpt-4o" : "gpt-4o-mini";
    console.log("[LLM Chat] Model:", model, "requiredChartCount:", requiredChartCount, "chartRequirements:", chartRequirementsList);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model,
        messages,
        temperature: 0.3, // Reduced from 0.7 for faster, more deterministic responses
        max_tokens: 4000, // Increased from 500 to allow chart data blocks + text content
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", errorText);
      return NextResponse.json(
        { error: "Failed to get response from AI" },
        { status: response.status }
      );
    }

    const data = await response.json();
    const assistantMessage = data.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response.";
    const finishReason = data.choices[0]?.finish_reason;
    const chartBlockCount = (assistantMessage.match(/<!--\s*CHART_DATA\s*-->/gi) || []).length;
    console.log("[LLM Chat] Response length:", assistantMessage.length, "finish_reason:", finishReason, "chart blocks found:", chartBlockCount, "required:", requiredChartCount);
    if (requiredChartCount > 0 && chartBlockCount < requiredChartCount) {
      console.warn(`[LLM Chat] WARNING: LLM generated ${chartBlockCount} charts but ${requiredChartCount} were required!`);
    }

    return NextResponse.json({
      message: assistantMessage,
      content: assistantMessage, // Alias for compatibility
    });
  } catch (error: any) {
    console.error("LLM Chat API error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

