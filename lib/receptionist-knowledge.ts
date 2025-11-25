import { supabaseAdmin } from "@/lib/supabase/admin";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
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

  if (!OPENAI_API_KEY) {
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
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: KNOWLEDGE_MODEL,
        temperature: 0.4,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[receptionist] Knowledge answer error:", errorText);
      return "I’ll make sure a teammate follows up with those details shortly.";
    }

    const data = await response.json();
    const answer = data?.choices?.[0]?.message?.content?.trim();
    if (!answer) {
      return "I’ll make sure a teammate follows up with those details shortly.";
    }
    return answer;
  } catch (err) {
    console.error("[receptionist] Knowledge answer failure", err);
    return "I’ll have one of our teammates reach out with that information.";
  }
}












