import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  assistantActions,
  actionCatalogText,
  getWorkspaceIdForUser,
  AssistantAction,
} from "@/lib/assistant/actions";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const PLANNER_MODEL =
  process.env.HOME_PLANNER_MODEL ||
  process.env.HOME_CHAT_MODEL ||
  process.env.RECEPTIONIST_COMPLETION_MODEL ||
  "gpt-4o-mini";
const WRITER_MODEL =
  process.env.HOME_CHAT_MODEL ||
  process.env.RECEPTIONIST_COMPLETION_MODEL ||
  "gpt-4o-mini";

export const dynamic = "force-dynamic";

interface ConversationTurn {
  question: string;
  answer: string;
}

interface PlannedOperation {
  action: string;
  args?: Record<string, any>;
}

interface PlannedResponse {
  operations: PlannedOperation[];
}

async function callOpenAI(messages: Array<{ role: string; content: string }>, model: string) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.4,
      max_tokens: 600,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `OpenAI returned ${response.status}`);
  }

  const data = await response.json();
  const answer = data?.choices?.[0]?.message?.content;
  if (!answer) {
    throw new Error("Empty response from OpenAI.");
  }
  return answer;
}

function buildPlannerPrompt(): string {
  return `
You are Drift's operations planner. Your job is to decide which backend actions to run based on the user's latest request.

Allowed actions (only use these, never invent new ones):
${actionCatalogText}

Rules:
- Always respect the user's workspace; the backend already scopes data, but do not request operations outside the user's intent.
- Prefer minimal operations. If a question can be answered with existing knowledge (no data access needed), return an empty list.
- For updates/deletes, ensure the required identifiers are provided.
- Respond with STRICT JSON only, in the shape {"operations":[{"action":"name","args":{...}}, ...]}. Use [] when no actions are needed.
- Do NOT include trailing commentary, Markdown, or code fences.
`.trim();
}

function parsePlannerOutput(raw: string): PlannedResponse | null {
  try {
    const cleaned = raw.trim().replace(/```json|```/g, "");
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed?.operations)) {
      return null;
    }

    const operations = parsed.operations
      .map((op: any) => ({
        action: typeof op?.action === "string" ? op.action : "",
        args: typeof op?.args === "object" && op?.args !== null ? op.args : {},
      }))
      .filter((op: { action: string; args: Record<string, unknown> }) => !!op.action);

    return { operations };
  } catch (error) {
    console.error("[assistant] Failed to parse planner output:", raw, error);
    return null;
  }
}

function findAction(name: string): AssistantAction | undefined {
  return assistantActions.find((action) => action.name === name);
}

export async function POST(req: NextRequest) {
  if (!OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured. Add it to your environment." },
      { status: 500 }
    );
  }

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const workspaceId = await getWorkspaceIdForUser(supabase, user.id);
  if (!workspaceId) {
    return NextResponse.json({ error: "Workspace not found for this user." }, { status: 400 });
  }

  let body: { prompt?: unknown; history?: unknown };
  try {
    body = await req.json();
  } catch (error) {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return NextResponse.json({ error: "Prompt is required." }, { status: 400 });
  }

  const history: ConversationTurn[] = Array.isArray(body.history) ? (body.history as ConversationTurn[]) : [];

  // Step 1: Ask OpenAI which operations (if any) should run.
  let planned: PlannedResponse | null = null;
  try {
    const plannerMessages = [
      { role: "system", content: buildPlannerPrompt() },
      ...history.flatMap((turn) => [
        { role: "user", content: turn.question },
        { role: "assistant", content: turn.answer },
      ]),
      { role: "user", content: prompt },
    ];

    const plannerOutput = await callOpenAI(plannerMessages, PLANNER_MODEL);
    planned = parsePlannerOutput(plannerOutput);
  } catch (error) {
    console.error("[assistant] Planning failure:", error);
    planned = null;
  }

  const operations = planned?.operations ?? [];
  const executionResults: Array<{
    action: string;
    status: "ok" | "error";
    data?: any;
    error?: string;
  }> = [];

  // Step 2: Execute operations sequentially.
  if (operations.length > 0) {
    for (const operation of operations) {
      const action = findAction(operation.action);
      if (!action) {
        executionResults.push({
          action: operation.action,
          status: "error",
          error: "Unsupported action.",
        });
        continue;
      }

      try {
        const result = await action.execute({
          supabase,
          workspaceId,
          userId: user.id,
          args: operation.args ?? {},
        });
        executionResults.push({
          action: operation.action,
          status: result.status,
          data: result.status === "ok" ? result.data : undefined,
          error: result.status === "error" ? result.error : undefined,
        });
      } catch (error: any) {
        console.error("[assistant] Action failed:", operation.action, error);
        executionResults.push({
          action: operation.action,
          status: "error",
          error: error?.message || "Unexpected error while executing action.",
        });
      }
    }
  }

  // Step 3: Compose final answer using the results.
  let answer: string | null = null;
  try {
    const summaryPayload = JSON.stringify(
      {
        prompt,
        operations,
        results: executionResults,
      },
      null,
      2
    );

    const writerMessages = [
      {
        role: "system",
        content:
          "You are Drift, an AI assistant for service businesses. Use the provided tool results to answer the user clearly. " +
          "If an operation failed, explain what went wrong and suggest a next step. Be concise, actionable, and friendly.",
      },
      ...history.flatMap((turn) => [
        { role: "user", content: turn.question },
        { role: "assistant", content: turn.answer },
      ]),
      { role: "user", content: prompt },
      {
        role: "system",
        content: `Tool execution results:\n${summaryPayload}`,
      },
    ];

    const writerOutput = await callOpenAI(writerMessages, WRITER_MODEL);
    answer = writerOutput.trim();
  } catch (error) {
    console.error("[assistant] Writer failure:", error);
  }

  if (!answer) {
    answer =
      executionResults.length === 0
        ? "I couldn't reach the AI assistant right now. Please try again in a moment."
        : executionResults
            .map((result) =>
              result.status === "ok"
                ? `${result.action} succeeded.`
                : `${result.action} failed: ${result.error}`
            )
            .join("\n");
  }

  return NextResponse.json({
    answer,
    operations,
    results: executionResults,
  });
}

