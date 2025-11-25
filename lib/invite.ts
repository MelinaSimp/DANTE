// lib/invite.ts
export function normalizeToken(raw: string | null | undefined) {
  return String(raw || "").trim();
}

export function isValidEmail(raw: string | null | undefined) {
  const s = String(raw || "").trim();
  return !!s && /\S+@\S+\.\S+/.test(s);
}
