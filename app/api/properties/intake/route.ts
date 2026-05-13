// app/api/properties/intake/route.ts
//
// Agentic PDF intake — the user picks PDFs in the desktop app; the
// Electron main process extracts text locally (the PDF bytes never
// leave the machine) and POSTs an array of { name, text } here. We
// run OpenAI to derive a structured property record + per-field
// citations, hand it back to the UI for review, and only persist
// when the user explicitly confirms.

import { NextResponse } from "next/server";
import { complete as llmComplete } from "@/lib/llm/client";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface IncomingPdf {
  name: string;
  text: string;
  size?: number;
  error?: string;
}

export async function POST(request: Request) {
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

  const body = await request.json();
  const pdfs: IncomingPdf[] = Array.isArray(body.pdfs) ? body.pdfs : [];
  const usable = pdfs.filter((p) => (p.text || "").trim().length > 50);
  if (usable.length === 0) {
    return NextResponse.json(
      { error: "No usable PDF text. Did the parser fail on every file?" },
      { status: 400 }
    );
  }

  const corpus = usable
    .map(
      (p, i) =>
        `--- DOC ${i + 1}: ${p.name} ---\n${p.text.slice(0, 12000)}`
    )
    .join("\n\n");

  const systemPrompt = `You read property documents (listing agreements, MLS sheets, tax cards, inspection reports, etc.) and extract a single structured property record.

Output ONLY this JSON:

{
  "address_line1": "<street>",
  "address_line2": null,
  "city": "<city or null>",
  "state": "<2-letter state or null>",
  "zip": "<zip or null>",
  "beds": <integer or null>,
  "baths": <number with .5 step or null>,
  "sqft": <integer or null>,
  "kind": "<residential|commercial|rental|land|other or null>",
  "list_price_cents": <integer or null>,
  "status": "<active|pending|sold|withdrawn|off_market or null>",
  "notes": "<one-paragraph summary of anything notable, or null>",
  "citations": [
    { "field": "list_price_cents", "source": "DOC 1: filename, near 'List Price'" }
  ],
  "warnings": ["<any concerns the user should review>"]
}

Rules:
- Empty fields stay null. Never invent values.
- list_price_cents must be in CENTS (multiply dollars by 100).
- baths can be 1.5, 2.5 etc. for half-baths.
- If the docs disagree (e.g. one says 3 beds, another says 4), emit a warning.
- Cite every non-null field's source so the user can verify.`;

  let parsed: any = {};
  try {
    const resp = await llmComplete({
      model: "claude-haiku-4-5-20251001",
      responseFormat: { type: "json_object" },
      temperature: 0.1,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: corpus },
      ],
      feature: "properties.intake",
      workspaceId: profile.workspace_id,
    });
    parsed = JSON.parse(resp.message.content || "{}");
  } catch (e: any) {
    console.error("property intake llm error:", e);
    return NextResponse.json(
      { error: "Extraction failed — try again." },
      { status: 502 }
    );
  }

  // Don't persist yet — return the proposed record so the user can
  // review + tweak before saving. The PropertiesClient calls POST
  // /api/properties with the final values when the user confirms.
  return NextResponse.json({
    proposed: parsed,
    used_files: usable.map((p) => p.name),
    skipped_files: pdfs
      .filter((p) => !usable.includes(p))
      .map((p) => ({ name: p.name, reason: p.error || "no extractable text" })),
  });
}
