import { supabaseAdmin } from "@/lib/supabase/admin";

function sanitizePhone(value: string | null | undefined) {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (raw.startsWith("+")) {
    return `+${digits}`;
  }
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  return `+${digits}`;
}

export function normalizePhoneNumber(value: string | null | undefined) {
  return sanitizePhone(value);
}

export type ReceptionistQuestion = {
  id: string;
  prompt: string;
  expected_response: string | null;
  sort_order: number;
};

export type ReceptionistSettings = {
  workspace_id: string;
  twilio_phone_number: string | null;
  greeting: string;
  farewell: string;
};

export type ReceptionistFollowupItem = {
  field: string;
  question: string;
  type?: "appointment" | "knowledge";
};

export type ReceptionistSession = {
  call_sid: string;
  workspace_id: string;
  from_number: string | null;
  to_number: string | null;
  current_index: number;
  answers: Array<{
    question_id: string;
    prompt: string;
    answer: string;
    captured_at: string;
    followup_field?: string | null;
    type?: "script" | "followup" | "knowledge";
  }>;
  followup_queue: ReceptionistFollowupItem[];
  followup_index: number;
  completed: boolean;
};

export async function getSettingsByNumber(toNumber: string) {
  const normalized = sanitizePhone(toNumber);
  if (!normalized) return null;

  const { data, error } = await supabaseAdmin
    .from("receptionist_settings")
    .select("workspace_id, greeting, farewell, twilio_phone_number")
    .eq("twilio_phone_number", normalized)
    .maybeSingle();

  if (error) {
    console.error("Failed to load receptionist settings", error);
    return null;
  }
  return data as ReceptionistSettings | null;
}

export async function upsertSettings(
  workspaceId: string,
  updates: Partial<ReceptionistSettings>
): Promise<ReceptionistSettings> {
  const sanitized: Partial<ReceptionistSettings> = { ...updates };
  
  // Normalize phone number if provided
  if (sanitized.twilio_phone_number !== undefined) {
    sanitized.twilio_phone_number = sanitizePhone(sanitized.twilio_phone_number) || null;
  }

  const { data, error } = await supabaseAdmin
    .from("receptionist_settings")
    .upsert(
      {
        workspace_id: workspaceId,
        ...sanitized,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id" }
    )
    .select("workspace_id, greeting, farewell, twilio_phone_number")
    .single();

  if (error) {
    console.error("Failed to upsert receptionist settings", error);
    throw error;
  }

  return data as ReceptionistSettings;
}

export async function getQuestions(workspaceId: string) {
  const { data, error } = await supabaseAdmin
    .from("receptionist_questions")
    .select("id, prompt, expected_response, sort_order")
    .eq("workspace_id", workspaceId)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Failed to load receptionist questions", error);
    return [];
  }

  return (data ?? []) as ReceptionistQuestion[];
}

export async function upsertSession(params: {
  callSid: string;
  workspaceId: string;
  from: string | null;
  to: string | null;
}) {
  const { callSid, workspaceId } = params;
  const from = sanitizePhone(params.from || undefined);
  const to = sanitizePhone(params.to || undefined);
  const { data, error } = await supabaseAdmin
    .from("receptionist_sessions")
    .upsert(
      {
        call_sid: callSid,
        workspace_id: workspaceId,
        from_number: from,
        to_number: to,
        followup_queue: [],
        followup_index: 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "call_sid" }
    )
    .select()
    .maybeSingle();

  if (error) {
    console.error("Failed to upsert session", error);
    throw error;
  }

  return data as ReceptionistSession;
}

export async function getSession(callSid: string) {
  const { data, error } = await supabaseAdmin
    .from("receptionist_sessions")
    .select("*")
    .eq("call_sid", callSid)
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch session", error);
    return null;
  }
  if (!data) return null;

  return {
    ...data,
    answers: Array.isArray(data.answers) ? data.answers : [],
    followup_queue: Array.isArray(data.followup_queue) ? data.followup_queue : [],
    followup_index: typeof data.followup_index === "number" ? data.followup_index : 0,
  } as ReceptionistSession;
}

export async function updateSessionAnswers(callSid: string, payload: Partial<ReceptionistSession>) {
  await updateSessionState(callSid, payload);
}

export async function updateSessionState(
  callSid: string,
  payload: Partial<ReceptionistSession>
) {
  const sanitized: Record<string, any> = { ...payload };
  if ("answers" in sanitized && sanitized.answers && !Array.isArray(sanitized.answers)) {
    delete sanitized.answers;
  }
  if ("followup_queue" in sanitized && sanitized.followup_queue && !Array.isArray(sanitized.followup_queue)) {
    delete sanitized.followup_queue;
  }

  const { error } = await supabaseAdmin
    .from("receptionist_sessions")
    .update({
      ...sanitized,
      updated_at: new Date().toISOString(),
    })
    .eq("call_sid", callSid);

  if (error) {
    console.error("Failed to update session state", error);
  }
}

export async function logCompletedCall(params: {
  workspaceId: string;
  callSid: string;
  from: string | null;
  to: string | null;
  answers: ReceptionistSession["answers"];
  aiResponse: string;
  analysis?: string | null;
}) {
  const { workspaceId, callSid, answers, aiResponse, analysis } = params;
  const from = sanitizePhone(params.from || undefined);
  const to = sanitizePhone(params.to || undefined);
  const { error } = await supabaseAdmin.from("receptionist_call_logs").insert({
    workspace_id: workspaceId,
    call_sid: callSid,
    from_number: from,
    to_number: to,
    answers: answers ?? [],
    ai_response: aiResponse,
    analysis: analysis ?? null,
  });

  if (error) {
    console.error("Failed to log call", error);
  }
}

export async function logStatusEvent(params: {
  callSid: string;
  status?: string | null;
  callDuration?: string | null;
  payload: Record<string, unknown>;
}) {
  const { callSid, status, callDuration, payload } = params;
  const { error } = await supabaseAdmin.from("receptionist_call_status_events").insert({
    call_sid: callSid,
    status: status ?? null,
    call_duration: callDuration ?? null,
    raw: payload ?? {},
  });

  if (error) {
    console.error("Failed to log status event", error);
  }
}

