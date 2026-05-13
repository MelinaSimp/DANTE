import { ReceptionistAnswer } from "@/lib/receptionist";
import { normalizePhoneNumber } from "@/lib/receptionist";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { complete as llmComplete } from "@/lib/llm/client";

const APPOINTMENT_MODEL =
  process.env.RECEPTIONIST_APPOINTMENT_MODEL ||
  process.env.HOME_PLANNER_MODEL ||
  process.env.HOME_CHAT_MODEL ||
  "claude-haiku-4-5-20251001";

export interface AppointmentFollowup {
  field: string;
  question: string;
}

export interface AppointmentPlan {
  should_create: boolean;
  reason?: string;
  appointment: {
    contact_id?: string | null;
    contact_name?: string | null;
    contact_phone?: string | null;
    contact_email?: string | null;
    service_type?: string | null;
    scheduled_at?: string | null;
    duration_minutes?: number | null;
    notes?: string | null;
    status?: string | null;
  };
  followups: AppointmentFollowup[];
}

export interface AppointmentCreationResult {
  created: boolean;
  reason?: string;
  appointment?: {
    id: string;
    scheduled_at: string;
    service_type: string | null;
    duration_minutes: number | null;
    status: string;
  };
}

function buildAnswerContext(answers: ReceptionistAnswer[]): string {
  return answers
    .map(
      (answer, index) =>
        `Question ${index + 1}: ${answer.prompt}\nCaller answer: ${answer.answer ?? ""}`
    )
    .join("\n\n");
}

function safeJsonParse(text: string): AppointmentPlan | null {
  try {
    const cleaned = text.trim().replace(/```json|```/g, "");
    const parsed = JSON.parse(cleaned);
    if (typeof parsed !== "object" || !parsed) return null;
    if (!parsed.appointment) parsed.appointment = {};
    if (!Array.isArray(parsed.followups)) parsed.followups = [];
    return parsed as AppointmentPlan;
  } catch (error) {
    console.error("[receptionist] Failed to parse appointment suggestion JSON", error, text);
    return null;
  }
}

export async function generateAppointmentSuggestion(
  answers: ReceptionistAnswer[]
): Promise<AppointmentPlan | null> {
  if (!answers || answers.length === 0) return null;

  const context = buildAnswerContext(answers);

  const systemPrompt = `
You analyze caller question/answer pairs from an AI receptionist and decide if an appointment can be scheduled, and what clarifying questions are still needed.
Respond with strict JSON matching:
{
  "should_create": boolean,
  "reason": string (optional),
  "appointment": {
    "contact_id": string | null,
    "contact_name": string | null,
    "contact_phone": string | null,
    "contact_email": string | null,
    "service_type": string | null,
    "scheduled_at": string | null,
    "duration_minutes": number | null,
    "notes": string | null,
    "status": string | null
  },
  "followups": [
    {
      "field": string,
      "question": string
    }
  ]
}

Guidelines:
- Only set "should_create": true if you clearly have a scheduling request with a usable date/time and contact method.
- Produce "scheduled_at" as an ISO 8601 timestamp (do not guess the timezone if impossible).
- Leave any unknown appointment fields as null.
- Provide followup questions for any fields that must be confirmed (max 2). Questions should be short and natural.
- Focus followups on confirming phone numbers, service type, or appointment time. Avoid collecting email addresses.
- Include a concise "reason" explaining your decision.
`.trim();

  const userPrompt = `
Caller answers:
${context}

Return ONLY the JSON object.
`.trim();

  try {
    const result = await llmComplete({
      model: APPOINTMENT_MODEL,
      temperature: 0.2,
      responseFormat: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      feature: "receptionist.appointment",
    });

    const content = (typeof result.message.content === "string" ? result.message.content : "").trim();

    if (!content) {
      return null;
    }

    const suggestion = safeJsonParse(content);
    if (suggestion) {
      suggestion.followups = suggestion.followups.filter(
        (item) => item.field !== "contact_email"
      );
      if (suggestion.appointment) {
        suggestion.appointment.contact_email = null;
      }
    }
    return suggestion;
  } catch (error) {
    console.error("[receptionist] Failed to generate appointment suggestion", error);
    return null;
  }
}

// Resolve an existing contact for an AI-booked appointment.
//
// Unlike before, this no longer creates a contact when there's no
// match — unknown callers are allowed to exist as "orphan" appointments
// with contact_id NULL. The advisor promotes them to real clients on
// demand from the schedule UI. This keeps the Contacts list clean of
// every cold caller the AI ever spoke to.
//
// Returns `contactId: undefined` when nothing matched (not an error).
async function resolveContactId(params: {
  workspaceId: string;
  plan: AppointmentPlan;
  fallbackFromNumber?: string | null;
}): Promise<{ status: "ok" | "error"; contactId?: string; error?: string }> {
  const { workspaceId, plan, fallbackFromNumber } = params;
  const appointment = plan.appointment || {};
  const contactId = appointment.contact_id;
  const contactPhone = normalizePhoneNumber(appointment.contact_phone ?? undefined);
  const contactEmail = appointment.contact_email;

  if (contactId) {
    const { data } = await supabaseAdmin
      .from("contacts")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("id", contactId)
      .maybeSingle();
    if (data?.id) return { status: "ok", contactId: data.id };
    return { status: "error", error: "Referenced contact not found in this workspace." };
  }

  const possiblePhones = [contactPhone, fallbackFromNumber]
    .map((entry) => normalizePhoneNumber(entry || ""))
    .filter(Boolean) as string[];

  for (const phone of possiblePhones) {
    const { data } = await supabaseAdmin
      .from("contacts")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("phone", phone)
      .maybeSingle();
    if (data?.id) {
      return { status: "ok", contactId: data.id };
    }
  }

  if (contactEmail) {
    const { data } = await supabaseAdmin
      .from("contacts")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("email", contactEmail)
      .maybeSingle();
    if (data?.id) {
      return { status: "ok", contactId: data.id };
    }
  }

  // No match — let the caller proceed as an unknown appointment.
  return { status: "ok", contactId: undefined };
}

export async function createAppointmentFromSuggestion(params: {
  workspaceId: string;
  plan: AppointmentPlan;
  fallbackFromNumber?: string | null;
  notesContext?: string;
}): Promise<AppointmentCreationResult> {
  const { workspaceId, plan, fallbackFromNumber, notesContext } = params;

  if (!plan.should_create) {
    return { created: false, reason: plan.reason || "Assistant declined to create." };
  }

  const appointment = plan.appointment || {};

  if (!appointment.scheduled_at) {
    return {
      created: false,
      reason: "No appointment time provided in the suggestion.",
    };
  }

  const contactResult = await resolveContactId({
    workspaceId,
    plan,
    fallbackFromNumber,
  });

  if (contactResult.status === "error") {
    return { created: false, reason: contactResult.error };
  }

  // Stash heard name + phone on the row itself when we couldn't match
  // an existing contact. UI renders these as "Unknown · <heard name>".
  const normalizedCallerPhone = normalizePhoneNumber(
    appointment.contact_phone ?? fallbackFromNumber ?? null
  );
  const heardCallerName = appointment.contact_name?.trim() || null;

  const appointmentPayload: Record<string, any> = {
    workspace_id: workspaceId,
    contact_id: contactResult.contactId ?? null,
    scheduled_at: appointment.scheduled_at,
    duration_minutes: appointment.duration_minutes ?? 60,
    service_type: appointment.service_type ?? null,
    status: appointment.status ?? "scheduled",
    notes: appointment.notes || notesContext || null,
    caller_name: contactResult.contactId ? null : heardCallerName,
    caller_phone: contactResult.contactId ? null : normalizedCallerPhone,
  };
  const normalizedForNotes = normalizePhoneNumber(
    appointment.contact_phone ?? fallbackFromNumber ?? null
  );
  if (normalizedForNotes) {
    appointmentPayload.notes = [appointmentPayload.notes, `Caller phone: ${normalizedForNotes}`]
      .filter(Boolean)
      .join("\n");
  }

  const { data, error } = await supabaseAdmin
    .from("appointments")
    .insert(appointmentPayload)
    .select("id, scheduled_at, duration_minutes, service_type, status")
    .single();

  if (error || !data) {
    console.error("[receptionist] Appointment creation failed", error);
    return {
      created: false,
      reason: error?.message || "Database error while creating appointment.",
    };
  }

  return {
    created: true,
    appointment: data,
  };
}

