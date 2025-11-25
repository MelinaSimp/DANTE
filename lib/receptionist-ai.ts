import type { ReceptionistSettings, ReceptionistSession } from "./receptionist";

const OPENAI_MODEL = process.env.RECEPTIONIST_COMPLETION_MODEL || "gpt-4o-mini";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.warn("OPENAI_API_KEY is not set. AI receptionist responses will fallback to a canned reply.");
}

export async function createReceptionistReply(params: {
  settings: ReceptionistSettings;
  answers: ReceptionistSession["answers"];
}) {
  const { settings, answers } = params;

  if (!OPENAI_API_KEY) {
    return "Thanks for calling. A team member will follow up with you shortly.";
  }

  const prompt = answers
    .map(
      (answer, index) =>
        `Question ${index + 1}: ${answer.prompt}\nCaller answer: ${answer.answer}`
    )
    .join("\n\n");

  const messages = [
    {
      role: "system",
      content:
        "You are a friendly, concise receptionist for a service business. Craft a short response acknowledging the caller's answers, thank them, and outline the next step. Keep it under 80 words.",
    },
    {
      role: "user",
      content: `Call transcript:\n${prompt}\n\nProduce the spoken response now.`,
    },
  ];

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages,
        temperature: 0.6,
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.error("OpenAI error:", err);
      return "Thanks for the information. A team member will be in touch very soon.";
    }

    const data = await resp.json();
    const text =
      data.choices?.[0]?.message?.content?.trim() ||
      "Thanks for the information. We will be in touch soon.";

    return text;
  } catch (error) {
    console.error("Failed to generate AI reply", error);
    return "Thank you for calling. A member of the team will follow up shortly.";
  }
}












