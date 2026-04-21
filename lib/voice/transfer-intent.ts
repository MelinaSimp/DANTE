// Heuristics for detecting "I want a human" in a Twilio speech result.
//
// We use tight regex patterns instead of an LLM call because:
//  • We want zero added latency before the transfer TwiML goes out.
//  • This intent is a narrow bullseye — a deterministic match is
//    easier to debug ("why did Drift transfer me when I said X?")
//    than an LLM hallucination that sometimes triggers and sometimes
//    doesn't.
//  • False positives here are expensive: we'd hang up on an AI
//    conversation and dial a receptionist. So the patterns are
//    anchored to full request-shaped phrases ("talk to a human",
//    "connect me to an agent"), not bare noun mentions.
//
// When Twilio's speech recognition gets worse or the product grows,
// we can upgrade to an LLM classifier — but at that point the cost
// of a round-trip is already sunk elsewhere in the conversation loop.

const TARGET =
  "(person|human|agent|receptionist|operator|rep|representative|someone|somebody|owner|manager)";

const PATTERNS: RegExp[] = [
  // "talk to a human", "speak with an agent", "chat with a rep"
  new RegExp(
    String.raw`\b(talk|speak|chat)\s+(?:to|with)\s+(?:(?:a|an|the|your)\s+)?(?:real\s+|live\s+|actual\s+)?${TARGET}\b`,
    "i",
  ),
  // "connect/transfer/switch/put me through to an agent"
  new RegExp(
    String.raw`\b(connect|transfer|switch|put)\s+(?:me\s+)?(?:to|through\s+to|with)\s+(?:(?:a|an|the|your)\s+)?(?:real\s+|live\s+|actual\s+)?${TARGET}\b`,
    "i",
  ),
  // "i want / i need / i'd like a human"
  new RegExp(
    String.raw`\bi\s+(?:want|need|would\s+like|wanna|'d\s+like)\s+(?:to\s+(?:talk|speak)\s+(?:to|with)\s+)?(?:(?:a|an|the)\s+)?(?:real\s+|live\s+|actual\s+)?${TARGET}\b`,
    "i",
  ),
  // "get me a human"
  new RegExp(
    String.raw`\bget\s+(?:me\s+)?(?:(?:a|an|the)\s+)?(?:real\s+|live\s+|actual\s+)?${TARGET}\b`,
    "i",
  ),
  // "is there a real person there / anyone i can talk to"
  new RegExp(
    String.raw`\bis\s+(?:there|anybody|anyone)\s+(?:(?:a|an|the)\s+)?(?:real\s+|live\s+|actual\s+)?${TARGET}\b`,
    "i",
  ),
  // Single-word blurts, common on phone IVRs: "Representative." "Human."
  /^\s*(representative|receptionist|operator|human|agent)\s*$/i,
];

/**
 * Returns true when the caller clearly asked to be routed to a
 * person. False for everything else, including neutral mentions
 * ("I'm a real person, just checking hours").
 */
export function isHumanTransferRequest(speech: string | null | undefined): boolean {
  if (!speech) return false;
  const s = speech.toLowerCase().replace(/[.,!?;:]/g, "").trim();
  if (s.length === 0) return false;
  return PATTERNS.some((p) => p.test(s));
}
