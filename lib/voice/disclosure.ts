// Call-recording disclosure helpers.
//
// Eleven US states require two-party consent for recording a phone call
// (CA, FL, IL, MD, MA, MT, NV, NH, PA, WA, CT) and every voice AI call
// we handle stores a transcript — so the caller needs to know up front
// that something is being captured on the line. Saying this in the
// first second of the call is the cheapest, most defensible way to get
// consent: continuing the conversation past the disclosure is the
// caller's consent under every state's framework.
//
// We intentionally do NOT word this as "this call is being recorded"
// because we don't store call audio by default — we store the
// transcript and metadata. "Recorded and transcribed" is accurate for
// either mode without the user having to know our architecture.
//
// Each workspace can override the exact wording (branding, language,
// specific regulatory language required by a state bar or broker-dealer
// compliance team) via `workspaces.recording_disclosure`. If the
// column is null or empty, we use DEFAULT_RECORDING_DISCLOSURE.

export const DEFAULT_RECORDING_DISCLOSURE =
  "This call may be recorded and transcribed for quality and training purposes.";

/**
 * Prepend a recording disclosure to a greeting. Returns the combined
 * text the agent should speak first. Workspaces that have already
 * embedded a disclosure in their greeting (e.g. because their scenario
 * starts with "This call is recorded — how can I help?") can disable
 * the prepend at the settings level; we trust what we're given here
 * and just concatenate.
 */
export function decorateGreetingWithDisclosure(
  greeting: string,
  customDisclosure?: string | null,
): string {
  const disclosure = (customDisclosure?.trim() || DEFAULT_RECORDING_DISCLOSURE).trim();
  const body = (greeting || "").trim();
  if (!body) return disclosure;
  // One sentence + pause + greeting. The consumer wraps this in TTS,
  // so punctuation spacing is all the pause control we need.
  return `${disclosure} ${body}`;
}
