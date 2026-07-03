# Dante Foundation (Rebrand + De-verticalization) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the cloned `drift-crm` codebase from "Drift AI — CRE deal intelligence" into "Dante — AI Agent & Workflow Builder Platform": generic branding, platform-neutral industry config, a generalized Dante v1 system prompt, generic seeded skills, and a de-niched n8n workflow-generator prompt — with the full test suite green.

**Architecture:** The codebase already isolates vertical identity in `lib/industry/config.ts` (copy), `lib/industry/skills.ts` (seeded skills), and `lib/dante/prompts/vergil-v3.ts` (persona prompt). We swap the *values* behind these seams while keeping every interface and function signature identical, so the 13 call sites need zero changes. The internal `Industry = "real_estate"` type key is referenced in ~20 files outside `lib/industry` (regulatory, compliance export, SMS, email categorization) — it stays untouched as a documented legacy key and gets renamed in the later workspace-templates plan.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Vitest, Supabase, Electron, n8n.

---

## Scope decisions (locked)

- **Internal `"real_estate"` key stays.** Only user-facing copy, prompts, and branding change. Rationale: the literal appears in `lib/dante/regulatory/*`, `lib/compliance/export.ts`, `lib/emails/categorize.ts`, `lib/dante/noticed/*`, `lib/sms/system-prompt.ts` — renaming it is the job of the future per-workspace-template plan.
- **CRE skills stay in the registry** (`abstract_lease`, `loi_draft`, etc.) but are no longer seeded into new workspaces. They become the "Drift CRE template" in the marketplace plan.
- **`prompts/vergil-v3.md` and `lib/dante/prompts/vergil-v3.ts` are kept on disk** (future Drift template), but production stops importing them.
- **Deferred to later plans (NOT in this plan):** brand asset files (`public/brand/Drift.icns`, `Drift.png`, `logo-circle.png` — need the new Dante logo exported by a designer/user), `n8n-nodes-drift-cre` package rename (deployed to Railway; rename has deploy implications), domain change (`driftai.studio` stays until DNS for the Dante domain exists), electron-builder `publish` repo (auto-updater still points at `MelinaSimp/drift-crm`), `scripts/check-vertical-language.sh` (still guards against stale RIA copy; flipping it to guard CRE copy waits until CRE surfaces are template-gated), CRE feature removal (`app/properties`, lease abstractor UI — they stay functional until template-gating).
- **Follow-up plans in sequence:** 2) Agent Builder UX (conversational creation, config surface), 3) Multi-tenant workspaces + RBAC, 4) Channels productization, 5) Marketplace/templates.

---

### Task 0: Baseline — install, branch, and record pre-existing failures

**Files:** none modified.

- [ ] **Step 1: Create a working branch**

```bash
cd /Users/lucaoravecz/Desktop/DANTE/drift-crm
git checkout -b dante-foundation
```

- [ ] **Step 2: Install dependencies**

```bash
npm install
```

Expected: completes without errors (postinstall runs `scripts/setup-pdf-worker.js`; `|| true` means it can't fail the install).

- [ ] **Step 3: Record the baseline test result**

```bash
npm test 2>&1 | tail -20
```

Expected: the suite runs (~274 tests / 11+ files). Note any pre-existing failures in a scratch note — this plan's definition of "green" is *no new failures relative to this baseline*.

- [ ] **Step 4: Baseline typecheck**

```bash
npx tsc --noEmit 2>&1 | tail -5
```

Expected: zero errors (or record pre-existing ones).

---

### Task 1: Rebrand `package.json` and `public/manifest.json`

**Files:**
- Modify: `package.json` (lines 2–5 identity fields; `build` section ~line 103)
- Modify: `public/manifest.json` (lines 2–3)

- [ ] **Step 1: Update identity fields in `package.json`**

Change:

```json
  "name": "drift-ai",
  "version": "1.4.2",
  "description": "Drift AI — Customer Relationship Management",
  "author": "Drift AI",
```

to:

```json
  "name": "dante",
  "version": "2.0.0",
  "description": "Dante — AI Agent & Workflow Builder Platform",
  "author": "Dante",
```

- [ ] **Step 2: Update the electron-builder `build` block in `package.json`**

Change:

```json
    "appId": "com.drift.ai",
    "productName": "Drift AI",
```

to:

```json
    "appId": "com.dante.app",
    "productName": "Dante",
```

- [ ] **Step 3: Update every artifactName in `package.json`**

```bash
grep -n "artifactName" package.json
```

For each match (mac shows `"Drift-AI-mac-${arch}.${ext}"`; win/linux variants follow the same pattern), replace the `Drift-AI-` prefix with `Dante-`, e.g. `"Dante-mac-${arch}.${ext}"`. Leave `"icon": "public/brand/Drift.icns"` and the `publish` block untouched (deferred — see scope decisions).

- [ ] **Step 4: Update `public/manifest.json`**

Change:

```json
  "name": "Drift AI",
  "short_name": "Drift AI",
```

to:

```json
  "name": "Dante",
  "short_name": "Dante",
```

- [ ] **Step 5: Verify JSON is still valid**

```bash
node -e "require('./package.json'); JSON.parse(require('fs').readFileSync('./public/manifest.json','utf8')); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add package.json public/manifest.json
git commit -m "rebrand: Drift AI -> Dante in package identity and PWA manifest"
```

---

### Task 2: Rebrand web metadata — `app/layout.tsx` and `app/opengraph-image.tsx`

**Files:**
- Modify: `app/layout.tsx:42-77` (the `metadata` export)
- Modify: `app/opengraph-image.tsx` (lines 4, 9, 91, 104, 115)

- [ ] **Step 1: Replace the `metadata` export in `app/layout.tsx`**

Replace lines 42–77 with:

```tsx
export const metadata: Metadata = {
  title: "Dante — AI agents & workflows",
  description:
    "Build AI agents that read your documents, cite their sources, answer your phones, and run your workflows — deployed in minutes, no code required.",
  manifest: "/manifest.json",
  icons: {
    icon: "/brand/logo-circle.png",
    apple: "/brand/logo-circle.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Dante",
  },
  metadataBase: new URL("https://driftai.studio"),
  openGraph: {
    type: "website",
    siteName: "Dante",
    title: "Dante — AI agents & workflows",
    description:
      "Citation-grounded document intelligence, voice AI, and n8n workflow automation in one platform. Build an agent for your business in minutes.",
    url: "https://driftai.studio",
    // OG image auto-generated by app/opengraph-image.tsx (1200x630)
  },
  twitter: {
    card: "summary_large_image",
    title: "Dante — AI agents & workflows",
    description:
      "Citation-grounded document intelligence, voice AI, and n8n workflow automation in one platform.",
    // Twitter card image served by app/opengraph-image.tsx
  },
  robots: {
    index: true,
    follow: true,
  },
};
```

(`metadataBase`/`url` keep `driftai.studio` — the deployed domain — per scope decisions.)

- [ ] **Step 2: Update `app/opengraph-image.tsx` strings**

- Line 4 comment: `// with the Drift logo and tagline.` → `// with the Dante logo and tagline.`
- Line 9: `export const alt = "Drift AI -- CRE deal intelligence";` → `export const alt = "Dante -- AI agents & workflows";`
- Line 91 title text: `Drift AI` → `Dante`
- Line 104 tagline: `CRE Deal Intelligence` → `AI Agents & Workflows`
- Line 115 pills: `{["Lease Abstraction", "Parcel Analytics", "AI Workflows"].map(` → `{["Document Intelligence", "Voice AI", "Workflows"].map(`
- Line 144 domain string stays `driftai.studio` (deferred).

- [ ] **Step 3: Verify no lint/type breakage in the two files**

```bash
npx tsc --noEmit 2>&1 | grep -E "layout.tsx|opengraph" ; echo "exit=$?"
```

Expected: no matches (`exit=1` from grep means clean).

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx app/opengraph-image.tsx
git commit -m "rebrand: Dante metadata, OG card, and taglines"
```

---

### Task 3: Rebrand electron user-facing strings

**Files:**
- Modify: `electron/main.js` (user-visible strings and log prefixes)

- [ ] **Step 1: Replace user-visible strings in `electron/main.js`**

Exact replacements (use replace-all where noted):

| Old | New | Mode |
|---|---|---|
| `"[Drift] ` | `"[Dante] ` | replace-all |
| `` `[Drift] `` | `` `[Dante] `` | replace-all (template-literal variants) |
| `"[Drift updater]` | `"[Dante updater]` | replace-all |
| `Could not connect to Drift AI.` | `Could not connect to Dante.` | once (~line 178) |
| `tray.setToolTip("Drift AI")` | `tray.setToolTip("Dante")` | once (~line 266) |
| `label: "Open Drift"` | `label: "Open Dante"` | once (~line 270) |
| `title: "Pick a folder for Drift to watch"` | `title: "Pick a folder for Dante to watch"` | once (~line 543) |

Leave icon paths (`../public/brand/Drift.png`, `logo-circle.png`) untouched — asset swap is deferred.

- [ ] **Step 2: Verify nothing user-visible still says Drift (excluding asset paths)**

```bash
grep -n "Drift" electron/main.js | grep -v "brand/"
```

Expected: no output.

- [ ] **Step 3: Syntax check**

```bash
node --check electron/main.js && echo OK
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add electron/main.js
git commit -m "rebrand: Dante strings in electron shell (tray, dialogs, logs)"
```

---

### Task 4: Generalize `lib/industry/config.ts` (TDD)

**Files:**
- Test: `lib/industry/config.test.ts` (create)
- Modify: `lib/industry/config.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/industry/config.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getIndustryConfig } from "./config";

// Foundation plan: copy must be platform-neutral. The internal
// `industry` key remains "real_estate" (legacy; renamed in the
// workspace-templates plan), so it is deliberately NOT asserted here.
describe("industry config (generalized)", () => {
  const cfg = getIndustryConfig();
  const CRE_PATTERN = /parcel|lease|zoning|broker|real estate|\bCRE\b/i;

  it("marketing and chat copy is platform-neutral", () => {
    const copyFields = [
      cfg.eyebrow,
      cfg.shortLabel,
      cfg.marketingHeadline,
      cfg.marketingDescription,
      cfg.displayName,
      cfg.danteHero,
      cfg.danteSubtitle,
      cfg.chatPlaceholder,
      ...cfg.marketingChips,
      ...cfg.starterQuestions,
    ];
    for (const field of copyFields) {
      expect(field, `CRE language leaked into: "${field}"`).not.toMatch(CRE_PATTERN);
    }
  });

  it("assistant is Dante", () => {
    expect(cfg.assistantName).toBe("Dante");
  });

  it("seeds the generic default skills", () => {
    expect(cfg.seededSkills).toEqual([
      "draft_follow_up_email",
      "summarize_recent_emails",
      "prep_meeting_briefing",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run lib/industry/config.test.ts
```

Expected: FAIL — CRE_PATTERN matches "FOR COMMERCIAL REAL ESTATE" / "Every parcel, researched in seconds." etc.

- [ ] **Step 3: Rewrite the config object in `lib/industry/config.ts`**

Replace the file-header comment (lines 1–8) with:

```ts
// lib/industry/config.ts
//
// Platform-neutral configuration. Dante is a horizontal AI agent &
// workflow builder — this config carries the default copy for every
// workspace. Industry-specific packs (e.g. the Drift CRE template)
// will land as marketplace templates, not hardcoded verticals.
//
// NOTE: the Industry type key remains "real_estate" for now — it is
// referenced by regulatory/compliance/sms modules as an internal
// legacy key and is renamed in the workspace-templates plan. The
// copy below is what users see; the key is not user-facing.
```

Keep `export type Industry = "real_estate";` and the `IndustryConfig` interface exactly as they are. Replace the `REAL_ESTATE` constant with:

```ts
const GENERAL: IndustryConfig = {
  industry: "real_estate", // legacy internal key — see file header
  eyebrow: "BUILD AI AGENTS FOR YOUR BUSINESS",
  shortLabel: "builder",
  marketingHeadline: "Agents that know your business.",
  marketingDescription:
    "Dante lets you build AI agents that read your documents and cite their sources, answer your phones, and run multi-step workflows — deployed in minutes, no code required.",
  marketingChips: ["Citation-grounded", "Voice + workflows"],
  displayName: "Business",
  assistantName: "Dante",
  assistantIconPath: "/brand/dante-sword.png",
  clientLabel: "contact",
  clientLabelPlural: "contacts",
  danteHero: "What should we build today?",
  danteSubtitle: "Ask a question, search your documents, or automate a process.",
  chatPlaceholder: "Ask about your documents, draft an email, build a workflow…",
  starterQuestions: [
    "What can you do?",
    "Summarize the documents I uploaded this week",
    "Which contacts haven't heard from me in 30+ days?",
    "Build a workflow that emails me a daily digest",
  ],
  seededSkills: [
    "draft_follow_up_email",
    "summarize_recent_emails",
    "prep_meeting_briefing",
  ],
};
```

Update the two remaining references:

```ts
export const ALL_INDUSTRIES: Industry[] = ["real_estate"];

export const SIGNUP_INDUSTRIES: Industry[] = ["real_estate"];

export function getIndustryConfig(_industry?: string | null | undefined): IndustryConfig {
  return GENERAL;
}
```

(If other code in this file references `REAL_ESTATE` by name, rename those references to `GENERAL` — it is a `const` rename, not a behavior change.)

- [ ] **Step 4: Run the test to verify it passes — except the skills assertion**

```bash
npx vitest run lib/industry/config.test.ts
```

Expected: the two copy tests PASS; the `seededSkills` test PASSES too (it asserts config content only — the skills *registry* entries land in Task 5).

- [ ] **Step 5: Typecheck the 13 call sites**

```bash
npx tsc --noEmit 2>&1 | tail -5
```

Expected: no new errors (interface unchanged).

- [ ] **Step 6: Commit**

```bash
git add lib/industry/config.ts lib/industry/config.test.ts
git commit -m "feat: platform-neutral industry config copy (Dante generalization)"
```

---

### Task 5: Generic default skills (TDD)

**Files:**
- Modify: `lib/industry/skills.test.ts` (update expectations first)
- Modify: `lib/industry/skills.ts` (add 3 generic skills; change `DEFAULTS`)

- [ ] **Step 1: Update the test to expect the new registry and defaults**

In `lib/industry/skills.test.ts`, change the `EXPECTED_SKILLS` array to include the three new generic slugs alongside the seven CRE slugs (CRE skills stay registered — they become the Drift template later):

```ts
  const EXPECTED_SKILLS = [
    // generic defaults (seeded into new workspaces)
    "draft_follow_up_email",
    "summarize_recent_emails",
    "prep_meeting_briefing",
    // CRE pack (kept in registry for the future Drift template)
    "draft_listing_prep_recap",
    "summarize_recent_buyer_emails",
    "prep_briefing_for_showing",
    "abstract_lease",
    "psa_redline_analysis",
    "broker_email_draft",
    "loi_draft",
  ];
```

And add this test inside the same `describe` block:

```ts
  it("defaultSkillSlugsFor returns only the generic defaults", () => {
    expect(defaultSkillSlugsFor()).toEqual([
      "draft_follow_up_email",
      "summarize_recent_emails",
      "prep_meeting_briefing",
    ]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run lib/industry/skills.test.ts
```

Expected: FAIL — `missing skill: draft_follow_up_email` and the defaults assertion fails.

- [ ] **Step 3: Add the three generic skills to `lib/industry/skills.ts`**

Insert above the `REGISTRY` constant:

```ts
// ── Generic defaults (seeded into every new workspace) ──────────

const DRAFT_FOLLOW_UP_EMAIL: SkillSeed = {
  name: "draft_follow_up_email",
  description:
    "Draft a follow-up email to a contact, grounded in memory and any relevant vault documents.",
  config: {
    objective:
      "Draft a follow-up email to {{input.contact_name}}. Pull recent context about them from memory, cite any vault documents that support concrete claims, and end with a clear next step. Context from the user: {{input.notes}}",
    system:
      "You are drafting on behalf of a business professional. Warm, specific, and free of jargon. Ground concrete claims in vault citations using the [v1] [v2] markers from vault.cite. Never invent facts about the contact.",
    tools: ["memory.search", "vault.cite"],
    max_steps: 6,
  },
  input_schema: {
    type: "object",
    required: ["contact_id", "contact_name", "notes"],
    properties: {
      contact_id: { type: "string" },
      contact_name: { type: "string" },
      notes: { type: "string" },
    },
  },
  auto_approve: false,
};

const SUMMARIZE_RECENT_EMAILS: SkillSeed = {
  name: "summarize_recent_emails",
  description:
    "Roll up the last 14 days of correspondence with a contact into a 4-bullet brief.",
  config: {
    objective:
      'Search memory for episode-kind entries with source_kind="email" about contact {{input.contact_id}} from the last 14 days. Summarize them as 4 bullets focusing on: (1) what they want or need, (2) any commitments either side made, (3) the emotional tone (positive, hesitant, frustrated), (4) anything still open. Be concise.',
    system:
      "You are summarizing for someone about to call this contact or walk into a meeting with them. They have 90 seconds to read this. No fluff.",
    tools: ["memory.search"],
    max_steps: 4,
  },
  input_schema: {
    type: "object",
    required: ["contact_id"],
    properties: {
      contact_id: { type: "string" },
    },
  },
  auto_approve: true,
};

const PREP_MEETING_BRIEFING: SkillSeed = {
  name: "prep_meeting_briefing",
  description:
    "Prepare a briefing before a meeting: who the contact is, history, open items, and suggested talking points.",
  config: {
    objective:
      "Prepare a briefing for a meeting with {{input.contact_name}}. From memory and the vault, assemble: (1) who they are and their relationship to us, (2) what has happened recently, (3) open commitments or questions, (4) three suggested talking points. Cite vault documents where relevant. Meeting context: {{input.meeting_context}}",
    system:
      "You are prepping a business professional for a meeting. Specific and scannable — headers and short bullets. Ground document-based claims in [v1] [v2] citations from vault.cite.",
    tools: ["memory.search", "vault.cite"],
    max_steps: 6,
  },
  input_schema: {
    type: "object",
    required: ["contact_id", "contact_name", "meeting_context"],
    properties: {
      contact_id: { type: "string" },
      contact_name: { type: "string" },
      meeting_context: { type: "string" },
    },
  },
  auto_approve: true,
};
```

Add them to `REGISTRY` (keep all existing entries):

```ts
const REGISTRY: Record<string, SkillSeed> = {
  draft_follow_up_email: DRAFT_FOLLOW_UP_EMAIL,
  summarize_recent_emails: SUMMARIZE_RECENT_EMAILS,
  prep_meeting_briefing: PREP_MEETING_BRIEFING,
  draft_listing_prep_recap: DRAFT_LISTING_PREP_RECAP,
  summarize_recent_buyer_emails: SUMMARIZE_RECENT_BUYER_EMAILS,
  prep_briefing_for_showing: PREP_BRIEFING_FOR_SHOWING,
  abstract_lease: ABSTRACT_LEASE,
  psa_redline_analysis: PSA_REDLINE_ANALYSIS,
  broker_email_draft: BROKER_EMAIL_DRAFT,
  loi_draft: LOI_DRAFT,
};
```

Replace `DEFAULTS`:

```ts
const DEFAULTS: string[] = [
  "draft_follow_up_email",
  "summarize_recent_emails",
  "prep_meeting_briefing",
];
```

Also update the file-header comment (lines 1–6) to:

```ts
// lib/industry/skills.ts
//
// Skill seeds. The generic defaults are seeded into a workspace on
// first onboarding completion. The CRE pack remains registered (not
// seeded) and will ship as the Drift CRE marketplace template.
// Skill bodies live in TypeScript so they're versioned in the repo.
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run lib/industry/skills.test.ts lib/industry/config.test.ts
```

Expected: PASS (both files).

- [ ] **Step 5: Commit**

```bash
git add lib/industry/skills.ts lib/industry/skills.test.ts
git commit -m "feat: generic default skills; CRE pack stays registered, no longer seeded"
```

---

### Task 6: Generalized Dante v1 system prompt (TDD)

**Files:**
- Test: `lib/dante/prompts/dante-v1.test.ts` (create)
- Create: `prompts/dante-v1.md` (canonical source)
- Create: `lib/dante/prompts/dante-v1.ts` (production module)
- Modify: `lib/dante/system-prompt.ts:1-19`

Note: the test targets the prompt constant module directly (not `system-prompt.ts`) so it doesn't import the Supabase admin client.

- [ ] **Step 1: Write the failing test**

Create `lib/dante/prompts/dante-v1.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { DANTE_V1_PROMPT, DANTE_V1_VERSION } from "./dante-v1";

describe("dante-v1 prompt", () => {
  it("has a version", () => {
    expect(DANTE_V1_VERSION).toBe("1.0");
  });

  it("is platform-neutral (no CRE persona)", () => {
    expect(DANTE_V1_PROMPT).not.toMatch(
      /commercial real estate|CRE broker|lease abstract|cre\.calculate|parcel|brokerage/i,
    );
  });

  it("keeps the anti-disclaimer identity rule", () => {
    expect(DANTE_V1_PROMPT).toContain("You are the platform. Act like it.");
  });

  it("keeps citation grounding instructions", () => {
    expect(DANTE_V1_PROMPT).toContain("vault.cite");
    expect(DANTE_V1_PROMPT).toMatch(/\[v1\]/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run lib/dante/prompts/dante-v1.test.ts
```

Expected: FAIL — `Cannot find module './dante-v1'`.

- [ ] **Step 3: Create `prompts/dante-v1.md`** (canonical source)

```markdown
# Dante — AI Agent Platform

**Version:** 1.0
**Vertical:** none (horizontal platform)
**Audience:** any business — the workspace's documents, contacts, and workflows define the domain
**Last revised:** 2026-07-03 (v1.0 — generalized from vergil-v3)

---

## Identity

You are Dante, the AI engine inside the Dante platform. You are
not a detached assistant -- you ARE the product. Every tool listed
below is yours to call. The user's workflows, contacts, documents,
vault, memory, and settings are all accessible through your tools.

When a user asks you to do something, your job is to do it using
your tools -- not to explain what they should do in the UI instead.
If a user asks you to run an analysis, run it. If they ask you to
change a workflow's email recipient, propose a modified workflow.
If they ask something you genuinely cannot do because no tool
covers it, say so briefly -- but NEVER disclaim access to
capabilities you actually have.

**Critical anti-disclaimer rule:** Never say "I don't have access
to your account," "I can't view your workflows," "I'm just a
research assistant," or any variant that denies your platform
capabilities. You are the platform. Act like it.

You serve professionals whose businesses vary widely — law firms,
clinics, agencies, trades, e-commerce, and more. Do not assume an
industry. Learn the workspace's domain from its documents, memory,
and terminology, and mirror the user's vocabulary.

## Tools available

- **memory.search** — persistent memory of facts about the
  workspace's contacts: preferences, commitments, history, and
  call/email episodes. Always your first stop for anything
  contact-specific.
- **archive.search** + **vault.cite** — the workspace's document
  vault: contracts, policies, manuals, SOPs, reports, and anything
  else the user has ingested.
- **clients.query** — the workspace contact database for structured
  filters (last_contact_at < X, stage = "lead", etc.).
- **skill.run** — preconfigured agent recipes for the workspace.
  Default skills: draft_follow_up_email, summarize_recent_emails,
  prep_meeting_briefing. Workspaces add their own.
- **Workflow tools** — list, inspect, propose, and modify the
  workspace's n8n workflows. When a user asks for an automation,
  propose a workflow rather than describing manual steps.

## Grounding and citations

Every factual claim that comes from a vault document must carry a
citation marker ([v1], [v2], ...) produced by vault.cite. Never
fabricate a citation. If the vault has nothing relevant, say the
answer comes from general knowledge. Prefer retrieval over recall:
search memory and the vault before answering anything about this
workspace's contacts, documents, or history.

## Boundaries

- Drafted messages are queued for user review unless the workspace
  has explicitly enabled auto-send.
- You are not a licensed attorney, physician, accountant, or
  financial advisor. You may summarize and organize the workspace's
  own documents on these topics, but flag that professional review
  is recommended for consequential decisions.
- Never reveal vault content to anyone outside the workspace
  (external callers, third-party recipients). Summarize on the
  user's behalf; never quote confidential documents outward.
- If a request conflicts with a workspace guardrail or compliance
  rule, decline briefly and say which rule applies.
```

- [ ] **Step 4: Create `lib/dante/prompts/dante-v1.ts`**

```ts
// AUTO-GENERATED from prompts/dante-v1.md.
//
// Production reads from this TS module because Vercel's serverless
// bundler doesn't reliably trace runtime fs.readFileSync calls.
// Edit prompts/dante-v1.md as the canonical source, then sync the
// body string below.

export const DANTE_V1_VERSION = "1.0";

export const DANTE_V1_PROMPT = `<the full body of prompts/dante-v1.md, pasted verbatim>`;
```

(Paste the markdown body into the template literal exactly — escape any backticks; the v1 body above contains none.)

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run lib/dante/prompts/dante-v1.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 6: Wire it into `lib/dante/system-prompt.ts`**

Change lines 1–19 from the vergil import to:

```ts
// Desktop chat system prompt — platform-neutral.
//
// Authoritative source: `prompts/dante-v1.md`.
// Production reads from the .ts module (lib/dante/prompts/dante-v1.ts)
// because Vercel's serverless bundler doesn't reliably trace runtime
// fs.readFileSync calls.
//
// The CRE persona (prompts/vergil-v3.md) is retained on disk for the
// future Drift CRE marketplace template but is no longer imported.

import { supabaseAdmin } from "@/lib/supabase/admin";
import { DANTE_V1_PROMPT } from "./prompts/dante-v1";

interface BuildDantePromptInput {
  industry?: string | null;
  workspaceId?: string;
}

export function buildDanteSystemPrompt(_input?: BuildDantePromptInput): string {
  return DANTE_V1_PROMPT;
}
```

(The `getIndustryConfig` import at old line 8 becomes unused — remove it. Everything below line 19 — the firm-instructions sanitizer and `buildDanteSystemPromptWithFirm` — stays untouched.)

- [ ] **Step 7: Neutralize the SMS persona line**

In `lib/sms/system-prompt.ts:30`, replace the ternary:

```ts
    industry === "real_estate" ? "real-estate operator" : "financial advisor";
```

with:

```ts
    "business operator";
```

(If the assignment then has an unused `industry` reference, prefix the variable with `_` or remove the parameter usage — keep the module compiling.)

- [ ] **Step 8: Typecheck + full dante test files**

```bash
npx tsc --noEmit 2>&1 | tail -5
npx vitest run lib/dante lib/sms 2>&1 | tail -10
```

Expected: no new failures vs. Task 0 baseline.

- [ ] **Step 9: Commit**

```bash
git add prompts/dante-v1.md lib/dante/prompts/dante-v1.ts lib/dante/prompts/dante-v1.test.ts lib/dante/system-prompt.ts lib/sms/system-prompt.ts
git commit -m "feat: platform-neutral dante-v1 system prompt replaces vergil-v3 in production"
```

---

### Task 7: De-niche the n8n workflow-generator prompt

**Files:**
- Modify: `lib/dante/n8n-workflow-ai.ts` (persona paragraph ~line 35; webhook example ~line 82)

- [ ] **Step 1: Replace the persona opening of `N8N_SYSTEM_PROMPT`**

Change:

```
You are Dante, a workflow architect for a CRM called Drift used by
commercial real estate brokers and developers. You translate a user's
natural-language request into an n8n workflow definition.
```

to:

```
You are Dante, a workflow architect inside the Dante platform — an
AI agent and workflow builder used by businesses in every industry.
You translate a user's natural-language request into an n8n workflow
definition.
```

- [ ] **Step 2: Replace the CRE example in the webhook node docs**

Change:

```
    "input_fields": [
      { "name": "address", "label": "Property Address", "type": "text", "required": true, "placeholder": "1600 Euclid Ave, Cleveland, OH 44115" }
    ]
```

to:

```
    "input_fields": [
      { "name": "topic", "label": "Topic", "type": "text", "required": true, "placeholder": "e.g. Q3 customer onboarding" }
    ]
```

And the sentence referencing it:

```
  Access these in downstream nodes with {{ $json.address }} (the field name).
```

to:

```
  Access these in downstream nodes with {{ $json.topic }} (the field name).
```

- [ ] **Step 3: Scan the rest of the prompt for CRE references**

```bash
grep -n -iE "real estate|broker|lease|parcel|property|drift" lib/dante/n8n-workflow-ai.ts
```

For each hit inside `N8N_SYSTEM_PROMPT` (examples, node docs, sample workflows), rewrite the example to a generic business scenario with the same JSON structure — e.g. a "lease expiry reminder" example becomes a "contract renewal reminder"; `ops@driftai.studio` in the `emailSend` example stays (real sending domain, deferred). Hits *outside* the prompt string (imports, type names like `DRIFT_TO_N8N_NODE_TYPE`) stay — internal identifiers are renamed in a later plan.

- [ ] **Step 4: Run the workflow-AI tests**

```bash
npx vitest run lib/dante/workflow-ai.test.ts lib/dante/n8n-converter.subnodes.test.ts lib/dante/workflow-surgery.test.ts
```

Expected: PASS (same result as Task 0 baseline).

- [ ] **Step 5: Commit**

```bash
git add lib/dante/n8n-workflow-ai.ts
git commit -m "feat: industry-neutral n8n workflow generator prompt"
```

---

### Task 8: Full verification sweep

**Files:** none modified (fixes only if regressions surface).

- [ ] **Step 1: Full test suite**

```bash
npm test 2>&1 | tail -15
```

Expected: no new failures vs. the Task 0 baseline. If a test fails because it asserts old Drift/CRE copy, update that test's expected string to the new copy introduced in Tasks 2/4/5/6 (the new strings are authoritative).

- [ ] **Step 2: Typecheck + lint**

```bash
npx tsc --noEmit && npm run lint 2>&1 | tail -5
```

Expected: clean (or baseline-identical).

- [ ] **Step 3: Vertical-language guard still passes**

```bash
bash scripts/check-vertical-language.sh && echo CLEAN
```

Expected: `CLEAN` (script guards RIA language; unchanged by this plan).

- [ ] **Step 4: Grep for stray user-facing "Drift AI"**

```bash
grep -rn "Drift AI" app components lib --include="*.ts" --include="*.tsx" | grep -v "\.test\." | grep -v "brand/"
```

Review each hit: user-facing strings (page titles, email footers, marketing copy) get changed to "Dante" in a follow-up commit on this branch; internal comments and the retained vergil-v3 files stay.

- [ ] **Step 5: Commit any stragglers and finish**

```bash
git add -A
git commit -m "chore: sweep remaining user-facing Drift AI strings to Dante"
```

Then use superpowers:finishing-a-development-branch to decide merge/PR handling.
