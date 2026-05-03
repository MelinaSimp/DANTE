import { supabaseAdmin } from "@/lib/supabase/admin";
import { complete as llmComplete } from "@/lib/llm/client";

const KNOWLEDGE_MODEL =
  process.env.RECEPTIONIST_KNOWLEDGE_MODEL ||
  process.env.HOME_CHAT_MODEL ||
  process.env.RECEPTIONIST_COMPLETION_MODEL ||
  "gpt-4o-mini";

export async function answerKnowledgeQuestion(
  workspaceId: string,
  question: string
): Promise<string> {
  const cleanedQuestion = question.trim();
  if (!cleanedQuestion) {
    return "I didn’t catch a question. Please feel free to reach out if you think of anything later.";
  }

  const { data: entries, error } = await supabaseAdmin
    .from("knowledge_base")
    .select("title, content")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("[receptionist] Failed to load knowledge entries", error);
  }

  if (!entries || entries.length === 0) {
    return "At the moment I don’t have that information handy, but a teammate will gladly help you shortly.";
  }

  if (!process.env.OPENAI_API_KEY) {
    return "Our assistant can’t access the knowledge base right now, but we’ll follow up with the answer.";
  }

  const context = entries
    .map(
      (entry) =>
        `Title: ${entry.title}\nDetails: ${entry.content}`
    )
    .join("\n\n---\n\n");

  const systemPrompt = `
You are Drift, an AI receptionist. Use ONLY the provided knowledge entries to answer the caller's question.
If the answer isn't available, politely say you'll have a teammate follow up.
`.trim();

  const userPrompt = `
Knowledge entries:
${context}

Caller question: ${cleanedQuestion}

Answer using a friendly, concise tone.
`.trim();

  try {
    const response = await llmComplete({
      model: KNOWLEDGE_MODEL,
      temperature: 0.4,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      feature: "receptionist.knowledge",
      workspaceId,
    });
    const answer = response.message.content?.trim();
    if (!answer) {
      return "I’ll make sure a teammate follows up with those details shortly.";
    }
    return answer;
  } catch (err) {
    console.error("[receptionist] Knowledge answer failure", err);
    return "I’ll have one of our teammates reach out with that information.";
  }
}












