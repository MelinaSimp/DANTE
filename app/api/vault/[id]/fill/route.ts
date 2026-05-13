// app/api/vault/[id]/fill/route.ts
//
// Vergil's document-fill endpoint. Given a template (vault item with
// kind='template') and a context (a contact + optional property +
// extra instructions), call OpenAI to:
//   1. Identify the fillable fields in the template's text
//   2. Fill each from the supplied context
//   3. Cite the source row for each filled field
//
// Returns a structured payload the UI uses to render side-by-side
// (original | filled) and to generate a downloadable PDF client-side.

import { NextResponse } from "next/server";
import { complete as llmComplete } from "@/lib/llm/client";
import { createServerSupabase } from "@/lib/supabase/server";

interface Field {
  /** Short field label as it appears in the template (e.g. "Buyer Name", "Closing Date"). */
  name: string;
  /** Filled value or null if not derivable from context. */
  value: string | null;
  /** Where in the supplied context the value came from
   *  ("contact:Smith", "property:123 Main St", "vault:Pre-approval letter"). */
  source: string;
  /** One-line note when value is null — what's needed to fill it. */
  missing_reason?: string;
}

interface FillResult {
  fields: Field[];
  /** The template text with fields substituted inline; used for the
   *  side-by-side diff and the downloadable PDF body. */
  filled_text: string;
  /** Raw template text we passed to the LLM; surfaced so the UI can
   *  highlight unchanged sections vs. fills. */
  template_text: string;
  /** Cost passthrough — clients show this so the user knows what each
   *  fill costs against their workspace's API excess bill. */
  cost_cents_estimate: number;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .single();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }
  const workspaceId = profile.workspace_id;
  const { id: templateId } = await params;

  // Load the template.
  const { data: template } = await supabase
    .from("vault_items")
    .select("id, kind, title, description, content")
    .eq("id", templateId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }
  if (template.kind !== "template") {
    return NextResponse.json(
      { error: "This vault item is not a template — change its type first." },
      { status: 400 }
    );
  }
  if (!template.content || template.content.trim().length < 20) {
    return NextResponse.json(
      {
        error:
          "Template text isn't ready yet (still extracting from PDF, or upload was empty).",
      },
      { status: 400 }
    );
  }

  const body = await request.json();
  const contactId: string | null = body.contact_id ?? null;
  const propertyId: string | null = body.property_id ?? null;
  const extraInstructions: string = (body.instructions ?? "").trim();

  // Gather context.
  const contextParts: string[] = [];

  if (contactId) {
    const { data: contact } = await supabase
      .from("contacts")
      .select("name, email, phone")
      .eq("id", contactId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (contact) {
      contextParts.push(
        `## Contact (source key: contact:${contact.name || contact.email || "unknown"})\n` +
          `Name: ${contact.name || "—"}\nEmail: ${contact.email || "—"}\nPhone: ${contact.phone || "—"}`
      );

      // Vault docs tagged to this contact.
      const { data: tagged } = await supabase
        .from("vault_item_clients")
        .select("vault_item_id")
        .eq("contact_id", contactId);
      const ids = (tagged || []).map((t: any) => t.vault_item_id);
      if (ids.length > 0) {
        const { data: docs } = await supabase
          .from("vault_items")
          .select("id, title, content")
          .in("id", ids)
          .eq("workspace_id", workspaceId);
        for (const d of docs || []) {
          if (d.content && d.content.trim().length > 0) {
            contextParts.push(
              `## Tagged document (source key: vault:${d.title})\n${d.content.slice(0, 4000)}`
            );
          }
        }
      }
    }
  }

  if (propertyId) {
    const { data: property } = await supabase
      .from("properties")
      .select(
        "address_line1, address_line2, city, state, zip, beds, baths, sqft, kind, list_price_cents, status, notes"
      )
      .eq("id", propertyId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (property) {
      const price =
        property.list_price_cents != null
          ? `$${(property.list_price_cents / 100).toLocaleString()}`
          : "—";
      contextParts.push(
        `## Property (source key: property:${property.address_line1})\n` +
          `Address: ${[property.address_line1, property.address_line2, property.city, property.state, property.zip].filter(Boolean).join(", ")}\n` +
          `Beds/Baths: ${property.beds ?? "—"} / ${property.baths ?? "—"}\n` +
          `Sqft: ${property.sqft ?? "—"}\nKind: ${property.kind ?? "—"}\n` +
          `List price: ${price}\nStatus: ${property.status}\n` +
          `Notes: ${property.notes ?? "—"}`
      );
    }
  }

  if (extraInstructions) {
    contextParts.push(`## Extra instructions from the user\n${extraInstructions}`);
  }

  const contextBlob =
    contextParts.length > 0
      ? contextParts.join("\n\n")
      : "(No additional context supplied — fill what you can from the template alone, leave the rest empty.)";

  const systemPrompt = `You fill out templates for a real-estate / financial-advisor workspace.

Given a TEMPLATE (with fillable fields) and a CONTEXT (contact, property, tagged documents, extra instructions), produce a JSON object:

{
  "fields": [
    { "name": "<field label as it appears in template>", "value": "<filled value or null>", "source": "<contact:Name | property:Address | vault:DocTitle | user>", "missing_reason": "<one line, only if value is null>" }
  ],
  "filled_text": "<the template's text with fillable fields substituted inline. Preserve the original prose; only replace the placeholders.>"
}

Rules:
- Cite every value with a "source" key. If a field cannot be derived from the supplied context, set value to null and explain in missing_reason.
- Never invent facts. Empty is better than wrong.
- Keep filled_text faithful to the original; substitute, don't rewrite.
- Output ONLY the JSON object, no prose.`;

  const userPrompt = `## TEMPLATE: ${template.title}\nDescription: ${template.description ?? "(no description)"}\n\n--- TEMPLATE TEXT ---\n${template.content}\n\n--- CONTEXT ---\n${contextBlob}`;

  let parsed: { fields: Field[]; filled_text: string };
  let totalTokens = 0;
  try {
    const resp = await llmComplete({
      model: "claude-haiku-4-5-20251001",
      responseFormat: { type: "json_object" },
      temperature: 0.2,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      feature: "vault.fill",
    });
    totalTokens = resp.usage.totalTokens;
    const raw = resp.message.content ?? "{}";
    parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.fields)) parsed.fields = [];
    if (typeof parsed.filled_text !== "string") parsed.filled_text = "";
  } catch (e: any) {
    console.error("vault fill llm error:", e);
    return NextResponse.json(
      { error: "AI failed to fill — try again or simplify the template." },
      { status: 502 }
    );
  }

  // Rough cost estimate at 4o-mini rates ($0.15/M in, $0.60/M out).
  // Splitting tokens 70/30 in/out as a not-terrible default.
  const costCents = Math.ceil(
    (totalTokens * 0.7 * 0.015) / 1000 + (totalTokens * 0.3 * 0.06) / 1000
  );

  const result: FillResult = {
    fields: parsed.fields,
    filled_text: parsed.filled_text,
    template_text: template.content,
    cost_cents_estimate: costCents,
  };

  // Hook for excess-bill metering — recorded as workspace_usage events
  // when that table lands. For now just return the estimate so the UI
  // can show it; not yet billed.
  // TODO(billing): persist to workspace_usage(workspace_id, kind='vault_fill', cents=costCents).

  return NextResponse.json(result);
}
