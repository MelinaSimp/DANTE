import { ReceptionistAnswer } from "@/lib/receptionist";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ANALYSIS_MODEL =
  process.env.RECEPTIONIST_ANALYSIS_MODEL ||
  process.env.RECEPTIONIST_COMPLETION_MODEL ||
  "gpt-4o-mini";

export async function generateCallAnalysis(params: {
  answers: ReceptionistAnswer[];
  aiResponse: string;
  appointmentSummary?: string | null;
}): Promise<string> {
  const { answers, aiResponse, appointmentSummary } = params;

  if (!OPENAI_API_KEY) {
    return "Unable to generate analysis because OPENAI_API_KEY is not configured.";
  }

  const answerText = answers
    .map(
      (entry, idx) =>
        `Q${idx + 1}: ${entry.prompt}\nCaller: ${entry.answer ?? "(no answer)"}`
    )
    .join("\n\n");

  const prompt = `
You are an assistant producing an internal summary for a receptionist hand-off. Review the call transcript and provide:
- A one-sentence overview of the caller's request.
- Key details captured (in bullet form).
- Recommended next follow-up or owner (if evident).

Keep it brief (≤120 words). Do not greet the caller; this is an internal note.

Transcript:
${answerText}

AI follow-up message to caller:
${aiResponse}

Appointment summary (if any):
${appointmentSummary ?? "None"}
`.trim();

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: ANALYSIS_MODEL,
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content:
              "You create concise internal summaries for receptionist calls. Focus on facts and next steps.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[receptionist] analysis generation failed:", errText);
      return "Analysis unavailable due to an upstream error.";
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content?.trim();
    return content || "Analysis unavailable.";
  } catch (error) {
    console.error("[receptionist] analysis generation exception:", error);
    return "Analysis unavailable due to an unexpected error.";
  }
}












