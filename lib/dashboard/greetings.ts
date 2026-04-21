// Dashboard greeting + subtitle copy pools.
//
// The advisor dashboard opens with "Good afternoon, Adharsh." followed
// by a one-line status line ("No meetings today, nothing awaiting
// review. A quiet one."). Reading the same two sentences every time
// you log in is flat; this module turns both into rotating pools so
// the page feels lived-in instead of templated.
//
// Stability rules:
//  • Picks are seeded by (firstName + yyyy-mm-dd). Same copy all day,
//    fresh tomorrow. A dashboard that re-rolls on every refresh feels
//    chaotic — we want calm variety.
//  • When the workload state changes mid-day (e.g. the first meeting
//    of the day gets added), the bucket shifts from `empty` to
//    `meetingsOnly`, so a new template is picked naturally. No
//    special-casing required.
//  • SSR/hydration: both server and client seed off the same
//    `firstName + date`, so the hash lines up. No hydration mismatch
//    as long as the date doesn't flip between render and hydrate,
//    which is a once-a-day edge case that self-heals on next load.
//
// Tone guidelines (for when you add more lines):
//  • Sound like a thoughtful colleague, not a chatbot.
//  • Factual openings are fine; the occasional warm or dry aside is
//    good; avoid anything that reads like a motivational poster.
//  • No emoji. The Drift surface is editorial black-and-white.
//  • Numbers live in placeholders so pluralization stays correct
//    ("1 meeting" / "3 meetings"). Templates are functions for that
//    reason — the function signs off on the plural form.

export type TimeBucket = "morning" | "afternoon" | "evening" | "latenight";

export type WorkloadState =
  | "empty"
  | "meetingsOnly"
  | "reviewOnly"
  | "both"
  | "heavy";

// ───────────────────────────────────────────────
// Greeting openers — "Good afternoon" replacements.
// ───────────────────────────────────────────────

const GREETINGS: Record<TimeBucket, string[]> = {
  morning: [
    "Good morning",
    "Morning",
    "Rise and shine",
    "Top of the morning",
    "Coffee's on",
    "Hey there",
    "Hello",
    "Well, hello",
    "Welcome back",
    "Good to see you",
    "Howdy",
    "Another one begins",
    "Up and at 'em",
    "Hi again",
    "Ready when you are",
  ],
  afternoon: [
    "Good afternoon",
    "Afternoon",
    "Howdy",
    "Hey",
    "Hello again",
    "Welcome back",
    "Hi there",
    "Hope lunch was decent",
    "Back at it",
    "Still rolling",
    "Second half",
    "Hey you",
    "Good to see you again",
    "Here we go",
    "Mid-day check-in",
  ],
  evening: [
    "Good evening",
    "Evening",
    "Hope the day treated you well",
    "Easing into evening",
    "Long day?",
    "Almost there",
    "Home stretch",
    "Winding down",
    "Hey",
    "Hi again",
    "Welcome back",
    "Evening check-in",
    "Not done yet?",
    "Still here",
    "Before you sign off",
  ],
  latenight: [
    "Burning the midnight oil",
    "Still at it",
    "Working late",
    "Late one tonight",
    "After hours",
    "Night owl mode",
    "Hey, it's late",
    "Still here",
    "One more thing?",
    "Past dinner already",
  ],
};

// ───────────────────────────────────────────────
// Subtitle templates. Each variant is a function so it can handle its
// own pluralization — templates that ignore the numbers just return
// a constant string. Keep the first item in each pool safe/generic;
// it's the one we'd pick if the rotation ever breaks.
// ───────────────────────────────────────────────

type SubtitleFn = (meetings: number, review: number) => string;

const pl = (n: number, s: string, p: string) => (n === 1 ? s : p);

// Empty state: no meetings, no reviews. Room for dry/warm asides.
const EMPTY: SubtitleFn[] = [
  () => "No meetings today, nothing awaiting review. A quiet one.",
  () => "Clean slate. No meetings, no queue.",
  () => "Nothing on the books today. Breathe.",
  () => "Calendar's clear. Review stack is empty. Rare.",
  () => "No meetings, nothing flagged. Enjoy the pause.",
  () => "Nothing pressing today — good day to catch up.",
  () => "Empty calendar, empty queue. A quiet one.",
  () => "No meetings today. Nothing waiting. A good day to think.",
  () => "Zero fires. Savour it.",
  () => "Clear runway. No meetings, no reviews pending.",
  () => "Today looks open. No calendar items, no review queue.",
  () => "Nothing scheduled. Nothing flagged. Rare and nice.",
  () => "A day with some air in it. Nothing on deck.",
  () => "Nothing on fire, nothing on the calendar. A quiet one.",
  () => "No meetings, no flags. Good day to read.",
  () => "You're caught up. Enjoy it — this doesn't happen often.",
  () => "Calendar's empty. Nothing awaiting your eyes. Deep work day.",
  () => "A rare double zero — no meetings, no queue.",
  () => "Nothing waiting. Nothing pressing. Go for a walk.",
  () => "Today is what you make of it. Nothing on the books.",
  () => "No one's on your calendar. No one's waiting on you.",
  () => "A day to get ahead of tomorrow.",
  () => "No meetings, nothing flagged. A thinking day.",
  () => "Empty docket. Rare bird.",
  () => "Nothing scheduled, nothing needs review. Good day to prospect.",
];

// Meetings today, nothing in review.
const MEETINGS_ONLY: SubtitleFn[] = [
  (m) =>
    `You have ${m} ${pl(m, "meeting", "meetings")} today. Nothing awaiting your review.`,
  (m) => `${m} ${pl(m, "meeting", "meetings")} ahead. Review queue is clean.`,
  (m) =>
    `${m} ${pl(m, "meeting", "meetings")} on the books today — nothing else pending.`,
  (m) =>
    `${m} ${pl(m, "meeting", "meetings")} today. Nothing in the review stack.`,
  (m) => `${m} ${pl(m, "meeting", "meetings")} ahead, and a clear queue.`,
  (m) =>
    `Today: ${m} ${pl(m, "meeting", "meetings")}. Everything else is clean.`,
  (m) =>
    `${m} ${pl(m, "meeting", "meetings")} lined up. No reviews waiting.`,
  (m) =>
    `You've got ${m} ${pl(m, "meeting", "meetings")} today. Nothing else on fire.`,
  (m) =>
    `${m} ${pl(m, "meeting", "meetings")} to run today. Everything else: quiet.`,
  (m) =>
    `${m} ${pl(m, "meeting", "meetings")} today — focus there, nothing else is pulling.`,
  (m) =>
    `Calendar has ${m} ${pl(m, "item", "items")} today. Queue is empty.`,
  (m) =>
    `${m} ${pl(m, "meeting", "meetings")} ahead. No review debt.`,
  (m) => `${m} ${pl(m, "client", "clients")} on your calendar today. Clean queue.`,
  (m) =>
    `Today's shape: ${m} ${pl(m, "meeting", "meetings")}, nothing else waiting.`,
  (m) =>
    `${m} ${pl(m, "meeting", "meetings")} to get through. That's it.`,
  (m) =>
    `${m} ${pl(m, "meeting", "meetings")} today. Review queue: zero. Enjoy that.`,
  (m) =>
    `${m} ${pl(m, "meeting", "meetings")} on deck. Nothing else demanding a look.`,
  (m) =>
    `${m} ${pl(m, "meeting", "meetings")} today — clear-headed going in, clear queue behind you.`,
  (m) =>
    `${m} ${pl(m, "meeting", "meetings")} scheduled, and your review pile is empty.`,
  (m) =>
    `You'll be in ${m} ${pl(m, "meeting", "meetings")} today. Everything else is handled.`,
];

// No meetings, but review queue isn't empty.
const REVIEW_ONLY: SubtitleFn[] = [
  (_m, r) =>
    `No meetings today. ${r} ${pl(r, "item", "items")} ${pl(r, "needs", "need")} your review.`,
  (_m, r) =>
    `Calendar's clear, but ${r} ${pl(r, "item", "items")} ${pl(r, "wants", "want")} your eyes.`,
  (_m, r) =>
    `Nothing on the calendar. ${r} ${pl(r, "thing", "things")} ${pl(r, "is", "are")} waiting on you.`,
  (_m, r) =>
    `No meetings. ${r} ${pl(r, "item", "items")} in the review queue.`,
  (_m, r) =>
    `Free calendar, ${r} ${pl(r, "item", "items")} to review. Good day to clear the stack.`,
  (_m, r) =>
    `${r} ${pl(r, "review", "reviews")} pending, nothing else on your plate.`,
  (_m, r) =>
    `Nothing scheduled, ${r} ${pl(r, "item", "items")} waiting on your signoff.`,
  (_m, r) =>
    `No meetings today — a chance to work through the ${r} ${pl(r, "item", "items")} in review.`,
  (_m, r) =>
    `Empty calendar. ${r} ${pl(r, "item", "items")} for you to look at.`,
  (_m, r) =>
    `No calls today. ${r} ${pl(r, "item", "items")} wanting your attention.`,
  (_m, r) =>
    `Nothing scheduled. ${r} ${pl(r, "draft", "drafts")} ${pl(r, "needs", "need")} review before ${pl(r, "it goes", "they go")} out.`,
  (_m, r) =>
    `Calendar's clear. Review queue has ${r} ${pl(r, "item", "items")} for you.`,
  (_m, r) =>
    `No meetings. ${r} ${pl(r, "item", "items")} ${pl(r, "sits", "sit")} in review.`,
  (_m, r) =>
    `Today's shape: no calls, ${r} ${pl(r, "review", "reviews")} pending.`,
  (_m, r) =>
    `Zero meetings. ${r} ${pl(r, "item", "items")} pending your eyes.`,
  (_m, r) =>
    `Clear calendar and ${r} ${pl(r, "item", "items")} in the review stack.`,
  (_m, r) =>
    `Nothing on the books today. ${r} ${pl(r, "item", "items")} waiting for you.`,
  (_m, r) =>
    `No meetings. Work down those ${r} ${pl(r, "review item", "review items")} — nothing else is pulling.`,
  (_m, r) =>
    `No calls today, but ${r} ${pl(r, "item", "items")} ${pl(r, "wants", "want")} a look.`,
  (_m, r) =>
    `Calendar: empty. Review queue: ${r} ${pl(r, "item", "items")}.`,
];

// Meetings + review queue. Keep the openers short so the numbers land.
const BOTH: SubtitleFn[] = [
  (m, r) =>
    `You have ${m} ${pl(m, "meeting", "meetings")} today. ${r} ${pl(r, "item", "items")} ${pl(r, "needs", "need")} your review.`,
  (m, r) =>
    `${m} ${pl(m, "meeting", "meetings")} and ${r} ${pl(r, "review", "reviews")} — plenty to chew on.`,
  (m, r) =>
    `Today: ${m} ${pl(m, "meeting", "meetings")}, ${r} ${pl(r, "item", "items")} in review.`,
  (m, r) =>
    `${m} ${pl(m, "meeting", "meetings")} lined up, ${r} ${pl(r, "item", "items")} awaiting your eyes.`,
  (m, r) =>
    `A real day: ${m} ${pl(m, "meeting", "meetings")} and ${r} ${pl(r, "review", "reviews")} pending.`,
  (m, r) =>
    `${m} ${pl(m, "meeting", "meetings")} ahead. ${r} ${pl(r, "item", "items")} waiting for you after.`,
  (m, r) =>
    `Calendar: ${m} ${pl(m, "meeting", "meetings")}. Queue: ${r} ${pl(r, "item", "items")}.`,
  (m, r) =>
    `${m} ${pl(m, "call", "calls")} today, ${r} ${pl(r, "item", "items")} in the review pile.`,
  (m, r) =>
    `${m} ${pl(m, "meeting", "meetings")} on deck, ${r} ${pl(r, "review", "reviews")} in the queue.`,
  (m, r) =>
    `Shape of the day: ${m} ${pl(m, "meeting", "meetings")}, ${r} ${pl(r, "review", "reviews")} pending.`,
  (m, r) =>
    `${m} ${pl(m, "meeting", "meetings")} today. ${r} ${pl(r, "thing", "things")} waiting on your signoff.`,
  (m, r) =>
    `${m} ${pl(m, "meeting", "meetings")} plus ${r} ${pl(r, "item", "items")} to review — a full-ish day.`,
  (m, r) =>
    `${m} ${pl(m, "meeting", "meetings")} + ${r} ${pl(r, "review", "reviews")}. Pace yourself.`,
  (m, r) =>
    `${m} ${pl(m, "meeting", "meetings")}, ${r} ${pl(r, "review", "reviews")}. Nothing you can't handle.`,
  (m, r) =>
    `You're in ${m} ${pl(m, "meeting", "meetings")} today, and ${r} ${pl(r, "item", "items")} ${pl(r, "is", "are")} in review.`,
  (m, r) =>
    `${m} ${pl(m, "meeting", "meetings")} and ${r} ${pl(r, "draft", "drafts")} on your plate.`,
  (m, r) =>
    `${m} ${pl(m, "meeting", "meetings")} today. Afterwards, ${r} ${pl(r, "item", "items")} ${pl(r, "is", "are")} waiting.`,
  (m, r) =>
    `Active day: ${m} ${pl(m, "meeting", "meetings")}, ${r} ${pl(r, "review", "reviews")} pending.`,
  (m, r) =>
    `${m} ${pl(m, "call", "calls")} and ${r} ${pl(r, "item", "items")} for review. Regular day.`,
  (m, r) =>
    `${m} ${pl(m, "meeting", "meetings")}, ${r} ${pl(r, "item", "items")} in review. You've done bigger.`,
];

// Heavy day: a lot of meetings or a big review backlog. Tone shifts
// from informational to "eyes forward."
const HEAVY: SubtitleFn[] = [
  (m, r) =>
    `Big day: ${m} ${pl(m, "meeting", "meetings")}, ${r} ${pl(r, "review", "reviews")}. Pace yourself.`,
  (m, r) =>
    `Brace. ${m} ${pl(m, "meeting", "meetings")}, ${r} ${pl(r, "item", "items")} in review.`,
  (m, r) =>
    `${m} ${pl(m, "meeting", "meetings")} and ${r} ${pl(r, "review", "reviews")} — clear your afternoon now.`,
  (m, r) =>
    `Heavy lift today: ${m} ${pl(m, "meeting", "meetings")}, ${r} ${pl(r, "item", "items")} awaiting you.`,
  (m, r) =>
    `${m} ${pl(m, "meeting", "meetings")} on the calendar, ${r} ${pl(r, "item", "items")} in the queue. Triage mode.`,
  (m, r) =>
    `${m} ${pl(m, "meeting", "meetings")}, ${r} ${pl(r, "review", "reviews")}. One thing at a time.`,
  (m, r) =>
    `Full plate: ${m} ${pl(m, "meeting", "meetings")}, ${r} ${pl(r, "item", "items")} to review.`,
  (m, r) =>
    `${m} ${pl(m, "meeting", "meetings")} ahead and ${r} ${pl(r, "item", "items")} stacked up. Prioritise hard.`,
  (m, r) =>
    `A lot today — ${m} ${pl(m, "meeting", "meetings")}, ${r} ${pl(r, "review", "reviews")}. Drift can take some of it.`,
  (m, r) =>
    `${m} ${pl(m, "call", "calls")}, ${r} ${pl(r, "review", "reviews")}. Don't skip lunch.`,
];

const SUBTITLES: Record<WorkloadState, SubtitleFn[]> = {
  empty: EMPTY,
  meetingsOnly: MEETINGS_ONLY,
  reviewOnly: REVIEW_ONLY,
  both: BOTH,
  heavy: HEAVY,
};

// ───────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────

/** Classic djb2-ish string hash. Cheap, good enough for copy rotation. */
function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function todayKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function timeBucket(hour: number): TimeBucket {
  if (hour < 5) return "latenight";
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  if (hour < 22) return "evening";
  return "latenight";
}

export function classifyWorkload(
  meetings: number,
  review: number,
): WorkloadState {
  // Heavy threshold — tuned to what feels "a lot" for a solo advisor.
  // 5 meetings is a packed day; 8 pending reviews means you're behind.
  if (meetings >= 5 || review >= 8 || meetings + review >= 10) return "heavy";
  if (meetings > 0 && review > 0) return "both";
  if (meetings > 0) return "meetingsOnly";
  if (review > 0) return "reviewOnly";
  return "empty";
}

/**
 * Stable greeting opener. Same output for the same
 * (firstName, date, timeBucket) triple all day, so the dashboard
 * doesn't flicker on refresh.
 */
export function pickGreeting(
  firstName: string,
  now: Date = new Date(),
): string {
  const bucket = timeBucket(now.getHours());
  const pool = GREETINGS[bucket];
  const seed = `${firstName}|${todayKey(now)}|g|${bucket}`;
  return pool[hashStr(seed) % pool.length];
}

/**
 * Stable subtitle line, picked from the pool that matches the
 * workload state. Seed includes the state so when the state flips
 * (0 meetings → 1 meeting) the user naturally sees a different line
 * from the new bucket.
 */
export function pickSubtitle(
  firstName: string,
  meetings: number,
  review: number,
  now: Date = new Date(),
): string {
  const state = classifyWorkload(meetings, review);
  const pool = SUBTITLES[state];
  const seed = `${firstName}|${todayKey(now)}|s|${state}`;
  const fn = pool[hashStr(seed) % pool.length];
  return fn(meetings, review);
}
