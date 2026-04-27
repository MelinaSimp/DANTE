// lib/emails/triage.ts
//
// Two-pass urgency triage on customer_emails:
//
//   1. RULES — keyword + structural scan over subject + body. Deterministic,
//      free, runs every time. Outputs a 0..1 score and a list of signals
//      (the matched terms / heuristics). Very-high or very-low scores
//      bypass the AI pass entirely.
//
//   2. AI — only invoked on rows whose rules score is ambiguous
//      (0.20 < score < 0.80). The AI gets the email + the rules signals
//      and picks the final level. This keeps cost low: 80%+ of emails
//      never hit the API.

import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type UrgencyLevel = "urgent" | "needs_attention" | "normal" | "low";

interface TriageResult {
  processed: number;
  rules_only: number;
  ai_pass: number;
  errors: number;
}

interface SupabaseLike {
  from: (table: string) => any;
}

// --- Rules pass --------------------------------------------------

const STRONG = [
  "asap",
  "urgent",
  "emergency",
  "immediately",
  "right now",
  "right away",
  "critical",
  "today",
  "tonight",
  "deadline",
  "due today",
  "by today",
];
const MODERATE = [
  "by tomorrow",
  "by monday",
  "by tuesday",
  "by wednesday",
  "by thursday",
  "by friday",
  "by saturday",
  "by sunday",
  "before friday",
  "before monday",
  "this week",
  "end of day",
  "eod",
  "closing",
  "compliance",
  "legal",
  "subpoena",
  "lawsuit",
  "audit",
  "termite",
  "inspection failed",
  "default",
  "foreclosure",
  "expir",
];
const POLITE = [
  "fyi",
  "for your information",
  "no rush",
  "when you get a chance",
  "whenever",
  "thanks!",
  "thank you so much",
  "ty!",
];

interface RulesScore {
  score: number;
  signals: string[];
}

function scoreByRules(input: {
  subject: string;
  body: string;
  direction?: "inbound" | "outbound" | null;
}): RulesScore {
  const subject = (input.subject || "").trim();
  const body = (input.body || "").trim();
  const haystack = `${subject}\n${body}`.toLowerCase();
  const signals: string[] = [];
  let score = 0;

  for (const term of STRONG) {
    if (haystack.includes(term)) {
      score += 0.35;
      signals.push(`strong:${term}`);
    }
  }
  for (const term of MODERATE) {
    if (haystack.includes(term)) {
      score += 0.18;
      signals.push(`moderate:${term}`);
    }
  }
  for (const term of POLITE) {
    if (haystack.includes(term)) {
      score -= 0.12;
      signals.push(`polite:${term}`);
    }
  }

  // Subject in ALL CAPS (and longer than 4 chars) — common urgency tell.
  const letters = subject.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 5 && letters === letters.toUpperCase()) {
    score += 0.15;
    signals.push("subject:allcaps");
  }

  // Question density — three or more "?" suggests a series of asks.
  const questionMarks = (haystack.match(/\?/g) || []).length;
  if (questionMarks >= 3) {
    score += 0.1;
    signals.push("questions:3+");
  } else if (questionMarks > 0) {
    score += 0.04;
    signals.push("questions:1-2");
  }

  // Inbound emails are weighted slightly higher — outbound from the
  // advisor is rarely something the advisor needs to triage.
  if (input.direction === "inbound") {
    score += 0.08;
    signals.push("direction:inbound");
  }

  // Cap into [0, 1].
  if (score < 0) score = 0;
  if (score > 1) score = 1;

  return { score: Math.round(score * 100) / 100, signals };
}

function levelFromScore(score: number): UrgencyLevel | null {
  // Only the unambiguous extremes get a rules-only verdict.
  if (score >= 0.8) return "urgent";
  if (score <= 0.2) return "low";
  return null; // hand off to the AI pass
}

// --- AI pass -----------------------------------------------------

interface AiVerdict {
  email_id: string;
  level: UrgencyLevel;
  reasoning?: string;
}

async function aiTriage(
  emails: Array<{
    id: string;
    subject: string;
    body: string;
    rules_score: number;
    rules_signals: string[];
  }>
): Promise<AiVerdict[]> {
  if (emails.length === 0) return [];

  const systemPrompt = `You triage emails into urgency buckets:
- "urgent": needs a same-day response. Closings, legal/compliance, distressed clients, missed deadlines.
- "needs_attention": should be handled within a day or two. Real client questions, time-sensitive but not breaking.
- "normal": standard correspondence. No specific deadline.
- "low": informational, social, or junk-y.

Output ONLY this JSON: { "results": [{ "email_id": "...", "level": "urgent|needs_attention|normal|low", "reasoning": "<one short sentence>" }, ...] }

Rules:
- Be skeptical of marketing copy that uses urgency words for promotion. "Last chance to save 30%" is not urgent.
- A polite client question is "needs_attention", not "urgent".
- The supplied rules_score and rules_signals are hints — you can override them when the content actually warrants.`;

  const payload = emails.map((e) => ({
    id: e.id,
    subject: e.subject || "",
    body_excerpt: e.body.slice(0, 1200),
    rules_score: e.rules_score,
    rules_signals: e.rules_signals,
  }));

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0.1,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(payload, null, 2) },
      ],
    });
    const parsed = JSON.parse(resp.choices[0]?.message?.content || "{}");
    const results: any[] = Array.isArray(parsed.results) ? parsed.results : [];
    return results
      .filter(
        (r) =>
          typeof r.email_id === "string" &&
          ["urgent", "needs_attention", "normal", "low"].includes(r.level)
      )
      .map((r) => ({
        email_id: r.email_id,
        level: r.level as UrgencyLevel,
        reasoning: typeof r.reasoning === "string" ? r.reasoning : undefined,
      }));
  } catch (e) {
    console.error("triage ai pass error:", e);
    return [];
  }
}

// --- Driver ------------------------------------------------------

export async function triageWorkspaceEmails(
  supabase: SupabaseLike,
  workspaceId: string,
  batchSize: number = 40
): Promise<TriageResult> {
  const { data: emails } = await supabase
    .from("customer_emails")
    .select("id, subject, body_text, snippet, direction")
    .eq("workspace_id", workspaceId)
    .is("triaged_at", null)
    .order("received_at", { ascending: false })
    .limit(batchSize);

  if (!emails || emails.length === 0) {
    return { processed: 0, rules_only: 0, ai_pass: 0, errors: 0 };
  }

  const nowIso = new Date().toISOString();
  let rulesOnly = 0;
  const ambiguous: Array<{
    id: string;
    subject: string;
    body: string;
    rules_score: number;
    rules_signals: string[];
  }> = [];

  // Pass 1: rules.
  for (const e of emails) {
    const { score, signals } = scoreByRules({
      subject: e.subject || "",
      body: e.body_text || e.snippet || "",
      direction: e.direction,
    });
    const level = levelFromScore(score);
    if (level) {
      await supabase
        .from("customer_emails")
        .update({
          urgency_level: level,
          urgency_score: score,
          urgency_signals: signals,
          triaged_at: nowIso,
        })
        .eq("id", e.id)
        .eq("workspace_id", workspaceId);
      rulesOnly++;
    } else {
      ambiguous.push({
        id: e.id,
        subject: e.subject || "",
        body: e.body_text || e.snippet || "",
        rules_score: score,
        rules_signals: signals,
      });
    }
  }

  // Pass 2: AI on the ambiguous middle.
  let aiPass = 0;
  let errors = 0;
  if (ambiguous.length > 0) {
    const verdicts = await aiTriage(ambiguous);
    const byId = new Map(verdicts.map((v) => [v.email_id, v]));
    for (const a of ambiguous) {
      const v = byId.get(a.id);
      if (v) {
        await supabase
          .from("customer_emails")
          .update({
            urgency_level: v.level,
            urgency_score: a.rules_score,
            urgency_signals: [
              ...a.rules_signals,
              v.reasoning ? `ai:${v.reasoning.slice(0, 120)}` : "ai:no-reason",
            ],
            triaged_at: nowIso,
          })
          .eq("id", a.id)
          .eq("workspace_id", workspaceId);
        aiPass++;
      } else {
        // Couldn't get a verdict — fall back to a level derived from the
        // rules score so the row isn't permanently stuck untriaged.
        const fallback: UrgencyLevel =
          a.rules_score >= 0.55 ? "needs_attention" : "normal";
        await supabase
          .from("customer_emails")
          .update({
            urgency_level: fallback,
            urgency_score: a.rules_score,
            urgency_signals: [...a.rules_signals, "ai:fallback"],
            triaged_at: nowIso,
          })
          .eq("id", a.id)
          .eq("workspace_id", workspaceId);
        errors++;
      }
    }
  }

  return {
    processed: emails.length,
    rules_only: rulesOnly,
    ai_pass: aiPass,
    errors,
  };
}
