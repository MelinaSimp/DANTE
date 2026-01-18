import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

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

    const { message, history = [], agentId, chatId, files = [] } = await req.json();

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
          .select("template, name, is_agent_template, pdf_url, pdf_extracted_text")
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
          // Combine all active guidelines, prioritizing agent-level templates
          const combinedTemplate = guidelines
            .map((g) => {
              // Use PDF extracted text if available, otherwise use template text
              const content = g.pdf_extracted_text || g.template || "";
              return `[${g.name}]\n${content}`;
            })
            .join("\n\n---\n\n");
          guidelinesContent = `\n\nCUSTOM GUIDELINES & TEMPLATES:\nThe user has provided specific guidelines and templates that you MUST follow. These override default behavior when applicable:\n\n${combinedTemplate}\n\nWhen following these guidelines, pay attention to inline comments (marked with // or #) as they provide important context about what to do.`;
        }
      } catch (error) {
        console.error("Error loading guidelines:", error);
        // Continue without guidelines if there's an error
      }
    }

    // Build conversation history
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
   - When users provide data (spreadsheets, tables, CSV, or text with numbers), AUTOMATICALLY generate appropriate visualizations WITHOUT being asked.
   - This is especially important for one-page distillations or data summaries.
   - For time series data: Use line charts or area charts
   - For comparisons: Use bar charts or column charts
   - For distributions: Use pie charts or histograms
   - For relationships: Use scatter plots
   - Always include a brief explanation of what the chart shows
   - Format chart data as JSON in <!--CHART_DATA--> blocks with this structure:
     {
       "chart": {
         "type": "line|bar|pie|area",
         "data": [{"x": "value1", "y": 100}, {"x": "value2", "y": 200}],
         "xKey": "x",
         "yKey": "y",
         "title": "Chart Title"
       }
     }
   - If the user provides a spreadsheet or structured data, you MUST create a visualization even if they don't explicitly ask for it.

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
    
    const messages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [
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
    
    if (files && files.length > 0) {
      const fileNames = files.map((f: any) => f.name).join(", ");
      userMessage += `\n\n[User has attached ${files.length} PDF file(s): ${fileNames}. Please reference the content from these files when answering.]`;
    }
    
    messages.push({
      role: "user",
      content: userMessage,
    });

    // Call OpenAI API
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        temperature: 0.3, // Reduced from 0.7 for faster, more deterministic responses
        max_tokens: 500, // Reduced from 1000 for faster generation
        stream: false, // Set to true for streaming if needed
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

