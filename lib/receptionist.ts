// Shared types + phone-normalization helper for the voice-call pipeline.
//
// Historical note: this module used to host the legacy TwiML IVR state
// machine (greeting → questions → farewell, backed by the
// `receptionist_*` tables). That system has been removed in favour of
// VAPI, but several post-call analysis helpers still use these types to
// describe what callers said. Keep it small and pure — no DB helpers.

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

export type ReceptionistAnswer = {
  question_id: string;
  prompt: string;
  answer: string;
  captured_at: string;
  followup_field?: string | null;
  type?: "script" | "followup" | "knowledge";
};
