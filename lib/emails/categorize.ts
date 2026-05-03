// lib/emails/categorize.ts
//
// Batched email categorization. Picks uncategorized rows, sends them
// to OpenAI in one structured-output call, writes back category +
// property_id + confidence. Pure function — callable from a manual
// admin trigger, the daily cron, or piggybacked on a sync run.

import { complete as llmComplete } from "@/lib/llm/client";

interface CategorizeResult {
  processed: number;
  updated: number;
  skipped: number;
}

interface SupabaseLike {
  from: (table: string) => any;
}

const FA_VOCAB = ["client", "prospect", "partner", "vendor", "other"];
const RE_VOCAB = [
  "client",
  "tenant",
  "buyer",
  "seller",
  "listing",
  "vendor",
  "showing",
  "other",
];

export async function categorizeWorkspaceEmails(
  supabase: SupabaseLike,
  workspaceId: string,
  industry: string | null | undefined,
  batchSize: number = 25
): Promise<CategorizeResult> {
  const vocab = industry === "real_estate" ? RE_VOCAB : FA_VOCAB;

  // Pull uncategorized email rows for this workspace.
  const { data: emails } = await supabase
    .from("customer_emails")
    .select(
      "id, contact_id, direction, from_addr, to_addrs, subject, snippet, body_text, received_at"
    )
    .eq("workspace_id", workspaceId)
    .is("categorized_at", null)
    .order("received_at", { ascending: false })
    .limit(batchSize);

  if (!emails || emails.length === 0) {
    return { processed: 0, updated: 0, skipped: 0 };
  }

  // Pull workspace contacts + properties for grounding.
  const { data: contacts } = await supabase
    .from("contacts")
    .select("id, name, email")
    .eq("workspace_id", workspaceId)
    .limit(500);

  const { data: properties } = await supabase
    .from("properties")
    .select("id, address_line1, city, state")
    .eq("workspace_id", workspaceId)
    .limit(300);

  const contactList = (contacts || [])
    .map((c: any) => `- ${c.id}: ${c.name || "(no name)"} <${c.email || "no email"}>`)
    .join("\n");
  const propertyList = (properties || [])
    .map(
      (p: any) =>
        `- ${p.id}: ${p.address_line1}${p.city ? `, ${p.city}` : ""}${p.state ? `, ${p.state}` : ""}`
    )
    .join("\n");

  const emailPayload = emails.map((e: any) => ({
    id: e.id,
    direction: e.direction,
    from: e.from_addr,
    to: (e.to_addrs || []).slice(0, 3),
    subject: e.subject || "",
    // Body is the most informative signal but also the most expensive
    // in tokens — clip aggressively. The AI doesn't need the whole
    // thread; the first 800 chars carry the topic 95% of the time.
    body_excerpt: (e.body_text || e.snippet || "").slice(0, 800),
    received_at: e.received_at,
  }));

  const systemPrompt = `You categorize emails for a workspace. For each email, output:

  - category: pick one from this vocabulary: ${vocab.join(", ")}
  - property_id: a uuid from the property list, or null if no specific property is implied
  - confidence: 0.0-1.0; 0.8+ means you're confident, below 0.5 you're guessing

Output ONLY a JSON object: { "results": [{ "email_id": "...", "category": "...", "property_id": "..."|null, "confidence": 0.85 }, ...] }

Rules:
- Use property_id only when the email mentions an address that matches a property in the list.
- "other" is fine — don't force a category if none fits.
- Never invent a uuid. Use null when unsure.`;

  const userPrompt = `## Property list
${propertyList || "(none)"}

## Contact list
${contactList || "(none)"}

## Emails to categorize
${JSON.stringify(emailPayload, null, 2)}`;

  let parsed: { results: Array<{ email_id: string; category: string; property_id: string | null; confidence: number }> } = { results: [] };
  try {
    const resp = await llmComplete({
      model: "gpt-4o-mini",
      responseFormat: { type: "json_object" },
      temperature: 0.1,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      feature: "emails.categorize",
      workspaceId,
    });
    parsed = JSON.parse(resp.message.content || "{}");
    if (!Array.isArray(parsed.results)) parsed.results = [];
  } catch (e) {
    console.error("emails categorize llm error:", e);
    return { processed: emails.length, updated: 0, skipped: emails.length };
  }

  // Validate property_ids against the workspace.
  const validPropertyIds = new Set((properties || []).map((p: any) => p.id));
  const validCategories = new Set(vocab);

  let updated = 0;
  let skipped = 0;
  const nowIso = new Date().toISOString();

  // Walk the results — if the model returned a row, update; otherwise
  // mark as categorized=other so we don't keep retrying. Track which
  // emails got an explicit result so we can mark the rest cleanly.
  const seen = new Set<string>();
  for (const r of parsed.results) {
    seen.add(r.email_id);
    const cat = validCategories.has(r.category) ? r.category : "other";
    const pid = r.property_id && validPropertyIds.has(r.property_id) ? r.property_id : null;
    const conf =
      typeof r.confidence === "number" && r.confidence >= 0 && r.confidence <= 1
        ? r.confidence
        : 0.5;
    const { error } = await supabase
      .from("customer_emails")
      .update({
        category: cat,
        property_id: pid,
        category_confidence: conf,
        categorized_at: nowIso,
      })
      .eq("id", r.email_id)
      .eq("workspace_id", workspaceId);
    if (error) skipped++;
    else updated++;
  }

  // Sweep the unaccounted ones with category=other so we don't loop.
  const unhandled = emails
    .map((e: any) => e.id)
    .filter((id: string) => !seen.has(id));
  if (unhandled.length > 0) {
    await supabase
      .from("customer_emails")
      .update({ category: "other", categorized_at: nowIso, category_confidence: 0.3 })
      .in("id", unhandled);
    skipped += unhandled.length;
  }

  return { processed: emails.length, updated, skipped };
}
