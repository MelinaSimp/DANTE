import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Q/A Answer Endpoint
 * POST /api/qa/answer
 * 
 * Searches data sources using RAG and generates an answer
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

    const body = await req.json();
    const { query, agentId, dataSourceIds } = body;

    if (!query || !agentId) {
      return NextResponse.json(
        { error: "Query and agentId are required" },
        { status: 400 }
      );
    }

    // Get data sources
    let dataSourcesQuery = supabaseAdmin
      .from("agent_data_sources")
      .select("*, data_sources(*)")
      .eq("agent_id", agentId);

    // Filter by specific data source IDs if provided
    if (dataSourceIds && Array.isArray(dataSourceIds) && dataSourceIds.length > 0) {
      dataSourcesQuery = dataSourcesQuery.in("data_source_id", dataSourceIds);
    }

    const { data: agentDataSources, error: dsError } = await dataSourcesQuery;

    if (dsError) {
      console.error("Error fetching data sources:", dsError);
      return NextResponse.json(
        { error: "Failed to fetch data sources" },
        { status: 500 }
      );
    }

    if (!agentDataSources || agentDataSources.length === 0) {
      return NextResponse.json({
        answer: null,
        found: false,
        message: "No data sources available to answer this question.",
      });
    }

    // Extract content from data sources
    const dataSourceContents = agentDataSources
      .map((ads: any) => {
        const ds = ads.data_sources;
        if (!ds) return null;
        
        if (ds.type === "text" && ds.content) {
          return { name: ds.name, content: ds.content };
        }
        if (ds.type === "file" && ds.file_url) {
          // For files, we'd need to extract text content
          // For now, return the file URL and name
          return { name: ds.name, content: `File: ${ds.name}`, file_url: ds.file_url };
        }
        return null;
      })
      .filter(Boolean);

    if (dataSourceContents.length === 0) {
      return NextResponse.json({
        answer: null,
        found: false,
        message: "No content found in data sources.",
      });
    }

    // Build context from data sources
    const context = dataSourceContents
      .map((ds: any) => `[${ds.name}]\n${ds.content}`)
      .join("\n\n---\n\n");

    // Use OpenAI to generate answer from context (RAG)
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 }
      );
    }

    const prompt = `You are a helpful AI assistant answering questions based on the following knowledge base.

KNOWLEDGE BASE:
${context}

CUSTOMER QUESTION: ${query}

Instructions:
1. Answer the question using ONLY information from the knowledge base above.
2. If the answer is not in the knowledge base, respond with "NOT_FOUND".
3. Be concise and helpful.
4. If you reference specific information, mention which document it came from.

Answer:`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a helpful AI assistant that answers questions based on provided knowledge base content. If the answer is not in the knowledge base, respond with 'NOT_FOUND'.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", errorText);
      return NextResponse.json(
        { error: "Failed to generate answer" },
        { status: 500 }
      );
    }

    const data = await response.json();
    const answer = data.choices[0]?.message?.content?.trim() || "";

    const found = !answer.includes("NOT_FOUND") && answer.length > 0;

    return NextResponse.json({
      answer: found ? answer : null,
      found,
      sources: dataSourceContents.map((ds: any) => ds.name),
    });
  } catch (error: any) {
    console.error("Q/A error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process Q/A request" },
      { status: 500 }
    );
  }
}





