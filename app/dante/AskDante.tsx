"use client";

// app/dante/AskDante.tsx
//
// Harvey-style chat surface for /dante. Two modes:
//
//   Landing (no messages yet):
//     - Big "D" wordmark
//     - Optional contact-context chip
//     - Centered input with toolbar
//     - Knowledge source pills
//     - Recent chats collapsible
//
//   Expanded (after first ask):
//     - Wordmark + pills fade out
//     - User+assistant messages stack vertically with no chat bubbles,
//       just clean prose like Harvey
//     - Each assistant message has an action bar (Copy / Export /
//       Rewrite / Open in editor / thumbs-up / thumbs-down), a Sources block, and
//       suggested follow-ups
//     - Input pins to the bottom for follow-up turns
//
// State is local — refreshing the page returns to the landing.
// Persistent threads live at /dante/chat/[id]; the History collapsible
// links there.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Send,
  Loader2,
  ChevronDown,
  ChevronRight,
  Library,
  Sliders,
  Telescope,
  Database,
  BookOpen,
  Users,
  CalendarDays,
  History,
  X,
  Search,
  Globe,
  Plus,
  ArrowUpRight,
  Square,
  FileText,
  Copy,
  Check,
} from "lucide-react";
import { deriveFilenameStem } from "./DocumentPanel";
import DraftEditor from "@/components/dante/DraftEditor";
import { useAssistantBrand } from "@/components/dante/AssistantNameProvider";
import {
  consumeAgentStream,
  type StreamState,
  type NeedsInputState,
  initialStreamState,
} from "./streamClient";
import {
  UserMessage,
  AssistantMessage,
  LiveThinking,
} from "./MessageView";

// ── Types ────────────────────────────────────────────────────────

interface RecentChat {
  id: string;
  title: string;
  updated_at: string;
}

interface Contact {
  id: string;
  name: string | null;
  email: string | null;
}

interface AssistantTurn {
  role: "assistant";
  content: string;
  trace: unknown;
  followups: string[];
  /** Captured from streamState.citationReport at turn finalization. */
  citationReport?: import("./streamClient").CitationReportState | null;
  grounding?: import("./streamClient").GroundingState | null;
  documents?: import("./streamClient").DocumentArtifact[];
}

interface UserTurn {
  role: "user";
  content: string;
}

type Turn = UserTurn | AssistantTurn;

const QUICK_PROMPTS_ADVISOR: Array<{ label: string; prompt: string }> = [
  {
    label: "Brief me on a contact",
    prompt:
      "Brief me on [contact name] — pull recent context from memory and surface anything I previously committed to, recent concerns from email, and any deal context to lead with.",
  },
  {
    label: "Summarize recent emails",
    prompt:
      "Summarize the last 14 days of emails with [contact name]. Focus on concerns raised, commitments either side made, and anything still open.",
  },
  {
    label: "Prep for a meeting",
    prompt:
      "I have a meeting with [contact name] in 30 minutes. What should I know going in?",
  },
  {
    label: "Find stale contacts",
    prompt:
      "Which contacts have I not reached out to in over 60 days? Pull the list and flag anyone with an active deal or upcoming lease event.",
  },
];

const QUICK_PROMPTS_REALTOR: Array<{ label: string; prompt: string }> = [
  {
    label: "Brief me on a tenant",
    prompt:
      "Brief me on [tenant / contact name] — pull recent context from memory, any lease dates coming up, and open issues or requests.",
  },
  {
    label: "Summarize a lease",
    prompt:
      "Summarize the key terms of the lease for [property / tenant]. Include rent, expiry, renewal options, and any unusual clauses.",
  },
  {
    label: "Prep for a showing",
    prompt:
      "I have a showing at [property address] in 30 minutes. What should I know — comps, zoning, recent inspection notes?",
  },
  {
    label: "Expiring leases this quarter",
    prompt:
      "Which leases expire in the next 90 days? Flag any tenants I haven't contacted yet about renewal.",
  },
];

// Deep analysis templates — heavyweight prompts that run multi-tool
// agent loops. Each has a placeholder (__________) the user fills in.
const DEEP_PROMPTS_REALTOR: Array<{ label: string; description: string; prompt: string }> = [
  {
    label: "Full void analysis",
    description: "Parcel data, demographics, tenant gaps, traffic, competitive supply, highest-and-best-use",
    prompt: `I'm looking at __________. Run a full void analysis on this property and its trade area.

Drop a map of the site first, then start with the parcel — pull whatever you can: zoning, lot size, assessed value, current use, and any recent tax or ownership history. If there's an existing structure, give me the building specs.

Then analyze the trade area — 1-mile and 3-mile rings from this address:

1. DEMOGRAPHIC SNAPSHOT: Population, median household income, median age, household growth trend. How does the 1-mile ring compare to the 3-mile ring — am I in the stronger pocket or the weaker one?

2. VOID ANALYSIS: What tenant categories are missing or underserved relative to the demographics? Flag gaps in medical, dental, veterinary, QSR, fast-casual, personal services (salon, barber, spa), fitness, professional office, and specialty retail. Cross-reference against what's already clustered along the corridor — I don't want to duplicate what's within a 5-minute drive.

3. TRAFFIC & ACCESS: What are the AADT counts at this location? Signalized intersection? Ingress/egress constraints? How does visibility and access compare to nearby retail nodes?

4. COMPETITIVE SUPPLY: What other retail or mixed-use vacancies exist within 3 miles? If there's available space nearby at lower basis, tell me — I need to know what I'm competing against for tenant attention.

5. HIGHEST AND BEST USE: Given the zoning, parcel size, location along the corridor, and the void gaps you identified — what tenant mix would maximize rent per square foot while maintaining low turnover risk? Give me a realistic lease-up scenario.

6. RENT COMPS: What are NNN asking rents for comparable retail/office space in this submarket? What spread should I expect between inline and endcap? Use a chart for the rent comps.

Tell me what this site wants to be.`,
  },
  {
    label: "Acquisition underwrite",
    description: "NOI rebuild, cap rate analysis, refinance risk, comp transactions",
    prompt: `I'm evaluating __________ for acquisition. The asking price is $__________.

Run a full underwriting analysis:

1. RENT ROLL AUDIT: What is the current gross rent roll versus effective collections? Break out vacancy, concessions, and credit loss.

2. NOI REBUILD: Reconstruct the stabilized NOI. Assume realistic market rents for any vacant or month-to-month spaces, 6 months of downtime per turnover, and $15/SF TI allowance on new leases.

3. CAP RATE: What cap rate should I underwrite for this submarket and asset class — not the broker's quoted rate, the rate a lender would use for sizing?

4. COMP TRANSACTIONS: What comparable transactions have closed within 10 miles in the last 18 months? How does the asking basis per square foot compare?

5. REFINANCE RISK: Given the tenant mix and remaining lease terms, what is my refinance risk at year 5 if rates stay flat vs. rise 75bps?

6. VERDICT: Walk me through whether this is a buy, a negotiate, or a pass.`,
  },
  {
    label: "Lease abstract + red flags",
    description: "Full lease abstraction with risk analysis and clause-by-clause review",
    prompt: `Abstract the lease for __________. I need a full breakdown:

1. PARTIES AND PREMISES: Tenant, landlord, guarantor, premises description, permitted use.

2. TERM: Commencement, expiration, renewal options (terms and notice periods), early termination rights.

3. RENT STRUCTURE: Base rent schedule with escalations, percentage rent if applicable, free rent/abatement periods.

4. OPERATING EXPENSES: CAM/OpEx structure (NNN, modified gross, full service?), tax obligations, insurance requirements, management fee caps.

5. KEY CLAUSES: Co-tenancy, exclusive use, go-dark provisions, assignment/subletting restrictions, SNDA, holdover terms, default/cure periods.

6. RED FLAGS: Flag anything unusual, one-sided, or that creates outsized landlord/tenant risk. Note any cross-reference inconsistencies between sections.

Cite specific sections and page numbers for every data point.`,
  },
  {
    label: "Market rent comp survey",
    description: "Asking rents, vacancy rates, and absorption trends for a submarket",
    prompt: `Run a rent comp survey for the __________ submarket.

1. ASKING RENTS: What are current NNN asking rents for comparable retail/office space? Break out by asset quality (A/B/C) and position (inline, endcap, pad, freestanding).

2. VACANCY: What is the current vacancy rate and how does it compare to the trailing 12-month average?

3. ABSORPTION: Is net absorption positive or negative? What new supply is in the pipeline?

4. TENANT MIX TRENDS: What categories are expanding vs. contracting in this market? Where is demand strongest?

5. RENT GROWTH: What has annual rent growth been over the last 3 years? What is the forward outlook?

Chart the data wherever it helps — I want to see the numbers, not just read about them.`,
  },
];

// Full CRE prompt library — every prompt a commercial real estate
// professional needs, shown in complete detail (no truncation) so the
// user can read, copy, or send each one verbatim. Organized by
// workflow category. Placeholders use __________ for fields the user
// fills in before running.
const CRE_PROMPT_LIBRARY: Array<{
  category: string;
  prompts: Array<{ label: string; description: string; prompt: string }>;
}> = [
  {
    category: "Acquisitions & Underwriting",
    prompts: [
      {
        label: "Full acquisition underwrite",
        description: "NOI rebuild, cap rate, comp transactions, refi risk, verdict",
        prompt: `I'm evaluating __________ for acquisition. Asking price: $__________. Asset type: __________.

Run a complete institutional underwrite:

1. RENT ROLL AUDIT
   - Current gross rent roll vs. effective collections (last 12 months)
   - Vacancy, concessions, credit loss broken out
   - WALT (weighted-average lease term), tenant concentration risk
   - Flag any tenants >15% of NOI

2. NOI REBUILD (STABILIZED)
   - Reconstruct NOI using market rents for vacant / month-to-month
   - Assume 6 months downtime per turnover, $15/SF TI on new leases, $3/SF LCs
   - OpEx benchmarked to submarket (taxes, insurance, CAM, mgmt, R&M, reserves)
   - Reserve replacement: $0.25/SF retail, $0.30/SF office, $0.20/SF industrial

3. CAP RATE ANALYSIS
   - Quote the broker's cap rate AND a lender-sized cap rate
   - Pull 5 most recent submarket comp trades, give cap range
   - Adjust for vintage, tenant credit, lease term, location

4. DEBT SIZING & RETURNS
   - 65% LTV, 30-yr am, 5-yr IO, current 10-yr UST + spread
   - Year-1 cash-on-cash, 5-yr levered IRR, equity multiple
   - DSCR at year 1 and trough year

5. REFINANCE RISK
   - At year 5: refi proceeds if rates hold vs. +75bps vs. +150bps
   - Trapped equity scenarios

6. VERDICT
   - Buy / negotiate / pass with the price you'd actually pay
   - Top 3 risks and how to mitigate at PSA / closing`,
      },
      {
        label: "Pro forma deep-dive",
        description: "Line-by-line pro forma with sensitivity analysis",
        prompt: `Build a 10-year pro forma for __________. Use the rent roll attached (or pull from the file index).

For each line item, show: year 1 base, growth assumption, year 10 stabilized.

REVENUE
- Base rent (escalated by stated bumps; mark-to-market on rollover)
- Percentage rent (if applicable; tie to tenant sales reporting)
- Recoveries (CAM, taxes, insurance) — show recovery ratio per tenant
- Other income (parking, storage, signage, antenna)
- Vacancy & credit loss (use submarket average + 100bps cushion)

EXPENSES
- Real estate taxes (assume reassessment at sale; show with/without)
- Insurance (benchmark $/SF for asset class and geography)
- Utilities (separate landlord vs. tenant-billed)
- Repairs & maintenance
- Management fee (3-4% of EGI typical)
- Administrative, legal, professional
- Replacement reserves

CAPITAL
- TI allowances per scheduled rollover
- Leasing commissions per rollover
- CapEx schedule (roof, parking lot, HVAC, etc.) — pull from PCA if available

SENSITIVITY
- Vacancy: -200bps / base / +200bps
- Rent growth: 2% / 3% / 4% annual
- Exit cap: -50bps / base / +50bps
- Show levered IRR matrix across all combinations

Highlight any line where my assumption looks aggressive vs. submarket norm.`,
      },
      {
        label: "1031 exchange identification",
        description: "Find replacement properties matching basis, timing, asset profile",
        prompt: `I just sold __________ for $__________ net of closing costs on __________. Identifying replacement property for a 1031 exchange. My 45-day identification deadline is __________ and 180-day close deadline is __________.

Pull candidate replacement properties matching:

1. BASIS REQUIREMENTS
   - Minimum purchase price to absorb full proceeds + boot avoidance
   - Debt to replace: $__________ (replicate or exceed)

2. PROFILE MATCH
   - Asset class: __________ (NNN retail / multi-tenant / industrial / MOB)
   - Geography: __________ (or open to anywhere)
   - Cap rate target: __________ to __________
   - Hold period horizon: __________ years

3. SCREEN AGAINST
   - Tenant credit quality (investment grade preferred for NNN)
   - Remaining lease term (10+ yrs ideal for STNL)
   - Submarket fundamentals (positive absorption, low vacancy)
   - Recent transaction comps validate the asking cap

4. SHORTLIST
   - Rank 5 candidates with full address, ask price, NOI, cap, tenant, term
   - Flag any with environmental, title, or zoning red flags
   - Note QI deadlines and what diligence can finish inside 45 days

Output as a table I can take to my QI and 1031 attorney.`,
      },
      {
        label: "Highest and best use study",
        description: "Zoning, market, financial feasibility — what should this site be?",
        prompt: `Run a highest and best use analysis on __________.

1. LEGALLY PERMISSIBLE
   - Current zoning, allowed uses by-right vs. conditional / variance
   - FAR, height, setback, parking, lot coverage constraints
   - Overlay districts (historic, opportunity zone, TIF, etc.)
   - Any pending rezoning or comp plan changes nearby

2. PHYSICALLY POSSIBLE
   - Lot size, frontage, topography, access points
   - Utilities at site (water, sewer capacity, power, gas)
   - Environmental constraints (wetlands, floodplain, contamination history)
   - Demolition cost if existing improvements

3. FINANCIALLY FEASIBLE — score each candidate use
   For each of: retail strip, single-tenant NNN, medical office, multifamily,
   self-storage, industrial flex, hotel — compute:
   - Land residual value (backed into from achievable rents and dev cost)
   - Stabilized yield-on-cost
   - Construction timeline and lease-up risk
   - Required equity, projected IRR

4. MAXIMALLY PRODUCTIVE
   - Pick the winning use
   - Justify with the demographic / void / comp data
   - Identify the 2-3 anchor tenants or operators to approach first
   - Outline a 24-month execution path: entitlement → debt → GC → lease-up`,
      },
    ],
  },
  {
    category: "Leasing & Tenant Strategy",
    prompts: [
      {
        label: "Lease abstract + red flags",
        description: "Full clause-by-clause abstraction with risk callouts",
        prompt: `Abstract the lease for __________. Cite section and page for every data point.

1. PARTIES & PREMISES
   - Tenant entity (and parent guarantor if any)
   - Landlord entity
   - Premises description, RSF, USF, load factor
   - Permitted use clause — verbatim

2. TERM
   - Commencement (rent commencement vs. delivery date)
   - Expiration
   - Renewal options: number, length, notice window, rent reset mechanism
   - Early termination: rights, fees, conditions
   - Holdover: rate, conversion to MTM, landlord remedies

3. RENT
   - Base rent schedule with all escalations (fixed, CPI, FMV)
   - Free rent / abatement periods
   - Percentage rent: breakpoint, rate, reporting cadence
   - Late fee structure

4. OPERATING EXPENSES
   - Structure (NNN, modified gross, full service)
   - Tax obligation: pro rata, capped, base year?
   - Insurance: tenant carries what, landlord carries what
   - CAM: included, excluded, controllable cap %
   - Management fee cap
   - Audit rights, statement delivery timing

5. KEY CLAUSES — verbatim or close paraphrase
   - Co-tenancy (occupancy and named tenants)
   - Exclusive use
   - Go-dark / continuous operation
   - Assignment / subletting (consent standard, recapture, profits split)
   - SNDA / NDA / estoppel obligations
   - Default & cure periods (monetary vs. non-monetary)
   - Casualty / condemnation
   - Surrender condition

6. RED FLAGS
   - Anything one-sided or unusual for this asset class
   - Cross-reference inconsistencies between sections
   - Open dates, missing exhibits, undefined terms
   - Provisions that could trigger landlord obligations or losses I'm not pricing

Give me the 3 issues I'd negotiate before closing.`,
      },
      {
        label: "LOI draft",
        description: "Generate a tight market-standard LOI from deal terms",
        prompt: `Draft a Letter of Intent for __________ at __________. I'm representing the __________ (landlord / tenant).

Terms to include:
- Tenant entity: __________
- Premises: __________ (suite, RSF)
- Term: __________ years
- Commencement: __________
- Base rent schedule: __________
- Rent abatement: __________
- TI allowance: $__________/SF
- OpEx structure: __________ (NNN / modified gross)
- Renewal options: __________
- Security deposit / LOC: __________
- Permitted use: __________
- Brokerage commission: __________
- Contingencies: __________
- Exclusivity / non-binding language: __________

Use market-standard structure. Flag any term that's off-market and propose the standard fallback. Keep total length under 2 pages.`,
      },
      {
        label: "PSA analysis",
        description: "Analyze a Purchase and Sale Agreement for non-standard terms and risks",
        prompt: `Analyze the PSA for __________ at __________. Identify non-standard clauses, risk factors, and negotiation points. Compare against market-standard CRE purchase agreements.`,
      },
      {
        label: "Tenant credit analysis",
        description: "Underwrite tenant ability to pay over lease term",
        prompt: `Run a tenant credit analysis on __________ for a __________ year lease at $__________ annual base rent.

1. ENTITY STRUCTURE
   - Legal entity signing the lease vs. operating brand
   - Parent / guarantor structure
   - Public, private, franchisee, corporate-owned?

2. FINANCIAL HEALTH (last 3 years if available)
   - Revenue trend
   - EBITDA / operating margin
   - Liquidity (cash, current ratio)
   - Leverage (debt/EBITDA, interest coverage)
   - Same-store sales trend if retail

3. INDUSTRY POSITION
   - Market share, competitive position
   - Recent store openings / closings net
   - Bankruptcy or restructuring in last 5 years
   - Recent management changes, activist pressure

4. RENT COVERAGE
   - Estimated unit-level sales for this location (use traffic, demographics, brand averages)
   - Rent-to-sales ratio benchmark for this category
   - Occupancy cost ratio
   - 4-wall EBITDA margin estimate

5. CREDIT VERDICT
   - Investment grade equivalent (S&P / Moody's / NAIC scale)
   - Recommended security: LOC, personal guaranty, additional months deposit
   - Rent factor adjustment to underwrite as if tenant were one notch lower
   - Termination / dark risk over the lease term`,
      },
      {
        label: "Renewal negotiation prep",
        description: "Leverage map, BATNA, and proposed terms for an expiring lease",
        prompt: `I have a lease renewal coming up with __________ at __________. Current rent: $__________/SF NNN. Lease expires __________.

Prepare the negotiation:

1. TENANT LEVERAGE
   - Their relocation cost (TI, moving, downtime, lost sales) — estimate
   - Available comparable space within 3 miles (size, rate, term)
   - Their store sales trend if available
   - Strategic value of this location to their portfolio

2. MY LEVERAGE (LANDLORD)
   - Market rent today vs. their current rent (mark-to-market gap)
   - Replacement tenant timeline and TI cost if they leave
   - Co-tenancy or anchor effect on rest of center
   - Lender / refinance pressure to keep this tenant

3. PROPOSED OPENING TERMS
   - Base rent: ask vs. fallback vs. walkaway
   - Term: years
   - Escalations: fixed or CPI
   - TI allowance: $/SF and conditions
   - Free rent: months
   - Renewal options going forward

4. CONCESSION LADDER
   - What I give first, second, third
   - What I never give
   - Trade items: TI for term, free rent for higher base, exclusivity for personal guaranty

5. WALKAWAY ANALYSIS
   - Net effective rent of my offer vs. backfill scenario
   - Time to backfill, downtime cost, broker fees, TI for new tenant
   - The number below which I walk

Give me the one-page summary I'd bring to the call.`,
      },
      {
        label: "Co-tenancy clause analysis",
        description: "Map co-tenancy triggers across the center and quantify exposure",
        prompt: `Analyze the co-tenancy exposure at __________.

1. CLAUSE INVENTORY
   - Every lease with a co-tenancy provision
   - Trigger type: occupancy %, named anchor(s), category-based
   - Remedy: rent reduction, alternative rent, termination right, cure period

2. CURRENT STATUS
   - Which clauses are currently in violation
   - Which are within 6 months of triggering (anchor lease expiring, vacancy creeping)
   - Cure options available to landlord

3. EXPOSURE QUANTIFICATION
   - Annual rent at risk if each clause triggers
   - Cumulative exposure if anchor goes dark
   - Worst-case cascade scenario

4. MITIGATION
   - Replacement anchor candidates and timing
   - Re-tenanting strategy that preserves co-tenancy compliance
   - Lease amendments to renegotiate the most onerous clauses

Output as a heatmap I can show ownership.`,
      },
    ],
  },
  {
    category: "Market & Site Analysis",
    prompts: [
      {
        label: "Full void analysis",
        description: "Parcel + demographics + voids + traffic + comps + HBU",
        prompt: `I'm looking at __________. Run a full void analysis on this property and its trade area.

Drop a map of the site first, then start with the parcel — pull whatever you can: zoning, lot size, assessed value, current use, and any recent tax or ownership history. If there's an existing structure, give me the building specs.

Then analyze the trade area — 1-mile and 3-mile rings from this address:

1. DEMOGRAPHIC SNAPSHOT: Population, median household income, median age, household growth trend. How does the 1-mile ring compare to the 3-mile ring — am I in the stronger pocket or the weaker one?

2. VOID ANALYSIS: What tenant categories are missing or underserved relative to the demographics? Flag gaps in medical, dental, veterinary, QSR, fast-casual, personal services (salon, barber, spa), fitness, professional office, and specialty retail. Cross-reference against what's already clustered along the corridor — I don't want to duplicate what's within a 5-minute drive.

3. TRAFFIC & ACCESS: What are the AADT counts at this location? Signalized intersection? Ingress/egress constraints? How does visibility and access compare to nearby retail nodes?

4. COMPETITIVE SUPPLY: What other retail or mixed-use vacancies exist within 3 miles? If there's available space nearby at lower basis, tell me — I need to know what I'm competing against for tenant attention.

5. HIGHEST AND BEST USE: Given the zoning, parcel size, location along the corridor, and the void gaps you identified — what tenant mix would maximize rent per square foot while maintaining low turnover risk? Give me a realistic lease-up scenario.

6. RENT COMPS: What are NNN asking rents for comparable retail/office space in this submarket? What spread should I expect between inline and endcap? Use a chart for the rent comps.

Tell me what this site wants to be.`,
      },
      {
        label: "Market rent comp survey",
        description: "Asking rents, vacancy, absorption, supply pipeline",
        prompt: `Run a rent comp survey for the __________ submarket. Asset type: __________.

1. ASKING RENTS
   - Current NNN asking rents by quality tier (A / B / C)
   - Position premium: inline vs. endcap vs. pad vs. freestanding
   - Recent direct deals vs. asking spread

2. VACANCY
   - Current overall vacancy rate
   - TTM average and 3-yr average for trend
   - Vacancy by building class

3. ABSORPTION
   - YTD and TTM net absorption
   - New supply delivered in last 12 months
   - Forward pipeline: under construction, planned

4. TENANT DEMAND
   - Active requirements in market (categories, sizes)
   - Categories expanding vs. contracting
   - Where landlords are giving concessions

5. RENT GROWTH
   - 3-year and 5-year CAGR
   - Forward outlook by category
   - Inflection points or risks

Chart the data wherever it helps. Give me a one-line takeaway: is this submarket a landlord market or a tenant market right now?`,
      },
      {
        label: "Demographic deep-dive",
        description: "1, 3, 5-mile rings with psychographics and growth trajectory",
        prompt: `Pull a demographic deep-dive for __________. Rings: 1-mile, 3-mile, 5-mile, and a 10-min drive-time polygon if you can.

For each ring:
- Population (current + 5-yr forecast)
- Households (current + 5-yr forecast)
- Median household income
- Median age
- Educational attainment (% bachelor's+)
- Daytime population (workforce inflow)
- Racial / ethnic composition
- Owner vs. renter %
- Median home value
- Median monthly rent

PSYCHOGRAPHICS / SPENDING
- Tapestry / PRIZM dominant segments
- Annual household expenditure by category (apparel, food away from home, healthcare, etc.)
- Spending power index vs. national avg

GROWTH SIGNALS
- Permit activity (residential and commercial) in 3-mile radius last 3 years
- Major employers and recent expansion / contraction announcements
- Planned infrastructure (transit, roads, schools)

Output as a comparison table. Flag the segments most relevant for retail / medical / multifamily underwriting.`,
      },
      {
        label: "Competitive supply audit",
        description: "Every competing property within the trade area, with terms",
        prompt: `Map every competing property to __________ within a __________-mile radius (asset class: __________).

For each competitor:
- Property name, address
- Year built, last renovated
- Total RSF, current occupancy
- Asking rate ($/SF and basis: NNN, FSG, MG)
- Concession package being offered (free rent, TI)
- Major tenants and remaining lease terms
- Ownership and any signs of distress
- Recent leasing activity (last 12 months)

ANALYSIS
- Where my asset ranks on rent, quality, location
- Where I'm winning vs. losing tenant tours
- Pricing power gap — am I leaving rent on the table or overpricing
- New supply pipeline that hasn't delivered yet

Output as a comparison table sorted by direct competitive threat.`,
      },
    ],
  },
  {
    category: "Finance & Capital Markets",
    prompts: [
      {
        label: "Refinance analysis",
        description: "Rate, proceeds, structure, and execution timing",
        prompt: `Run a refinance analysis on __________. Current loan: $__________ at __________% maturing __________. Current NOI: $__________.

1. CURRENT MARKET
   - Today's index (SOFR / 10-yr UST) + spread for this asset class
   - All-in rate range from agency, life co, CMBS, debt fund
   - Typical max LTV, min DSCR, interest-only window

2. PROCEEDS SIZING
   - Max loan at min DSCR vs. max LTV — which constrains?
   - At a target DSCR of 1.25x and 65% LTV, here's my proceeds
   - Cash to / cash from refi vs. existing balance

3. STRUCTURE TRADE-OFFS
   - Fixed vs. floating with cap
   - 5/7/10-yr term
   - IO period: how much, what it costs in rate
   - Prepay: yield maintenance vs. defeasance vs. open
   - Recourse / carve-outs

4. EXECUTION TIMELINE
   - Application to close: typical days by lender type
   - Diligence list (rent roll, OS, environmental, PCA, appraisal, title)
   - Forward rate lock if it makes sense

5. RECOMMENDATION
   - Lender type and 2-3 specific lenders to approach
   - Indicative rate and proceeds I should target
   - When to launch process to hit maturity

Build the lender call list.`,
      },
      {
        label: "Cap rate justification",
        description: "Defend a cap rate with comp trades and adjustment factors",
        prompt: `I'm using a __________% cap rate for __________ in __________. Build the justification.

1. RAW COMP TRADES
   - 10 most relevant sales in last 24 months
   - Address, asset type, SF, sale price, $/SF, in-place NOI, cap rate
   - Buyer / seller profile (institutional, private, syndicate)

2. ADJUSTMENT FACTORS
   For each comp, adjust for differences vs. my subject:
   - Vintage / condition
   - Tenant credit
   - Remaining lease term (WALT)
   - Location / submarket quality
   - Lot size / parking ratio
   - In-place vs. market rent gap

3. ADJUSTED CAP RANGE
   - After adjustments, the range of supportable cap rates
   - Where my underwritten cap sits in that range
   - Whether I'm conservative, market, or aggressive

4. STRESS
   - What cap rate does the market need to move to for me to lose money
   - Probability of that scenario in next 24 months

Output the math I'd put in an IC memo.`,
      },
      {
        label: "Sources and uses build",
        description: "Full capital stack for an acquisition or development",
        prompt: `Build a sources and uses for __________. Total project cost: $__________.

USES
- Land / acquisition
- Hard costs (construction or capex)
- Soft costs (architect, engineering, legal, permits)
- TI / LC reserve
- Operating reserve through stabilization
- Financing costs (origination, legal, third-party reports)
- Interest reserve
- Developer fee
- Contingency (% of hard costs)

SOURCES
- Senior debt — sizing at __________ LTC, __________ DSCR
- Mezzanine or preferred equity — if needed to fill gap
- Sponsor equity (co-invest %)
- LP / JV equity
- Tax credits, grants, TIF, EB-5 if applicable

CAPITAL STACK
- Show $ amount, % of stack, weighted cost, return target by tranche
- Promote / waterfall structure (pref, catch-up, splits at IRR hurdles)
- Sponsor projected IRR and equity multiple on co-invest

Flag any gap and propose how to fill it.`,
      },
      {
        label: "DSCR stress test",
        description: "How rent loss, rate shock, and op-ex inflation hit coverage",
        prompt: `Stress-test debt service coverage for __________. Loan: $__________ at __________%, __________-yr am. In-place NOI: $__________. Current DSCR: __________.

SCENARIOS
1. Tenant default — largest tenant goes dark for 12 months
2. Tenant default — second largest tenant
3. Rent loss — 10%, 20%, 30% across the board
4. OpEx inflation — taxes / insurance up 25%
5. Rate shock at refi — +100bps, +200bps, +300bps
6. Combined recession — 15% rent loss + 15% OpEx inflation + 150bps refi shock

For each scenario, show:
- New NOI
- New DSCR
- Cash flow deficit (if any) and months of reserves to cover
- Trigger of any cash sweep / lockbox / springing covenants
- Likelihood we breach the loan

Build the table for the IC. Flag the scenario that worries me most.`,
      },
    ],
  },
  {
    category: "Asset Management",
    prompts: [
      {
        label: "NOI optimization plan",
        description: "Revenue uplift and expense compression playbook",
        prompt: `Build a 12-month NOI optimization plan for __________. Current NOI: $__________.

REVENUE UPLIFT
- Mark-to-market opportunities (which suites, $ uplift at renewal)
- Vacancy lease-up plan (target tenants, timing, rate)
- Recovery audit — am I billing back everything I'm entitled to
- Ancillary income (parking, antenna, storage, signage, ATM, vending)
- Percentage rent capture for retail tenants

EXPENSE COMPRESSION
- Property tax appeal opportunity (recent assessment vs. comps)
- Insurance benchmark — am I overpaying vs. market
- Utility audit (LED retrofit, controls, supplier rebid)
- Vendor rebid (janitorial, landscaping, security, R&M)
- Management fee benchmark
- Eliminate redundant / low-ROI line items

CAPITAL FOR YIELD
- Capex projects with NOI accretion (sign upgrade, parking lot, facade, common area)
- ROI and payback for each

PRIORITIZED PUNCH LIST
- Top 5 actions ranked by $ NOI impact and effort
- Owner approvals needed
- 90-day, 180-day, 12-month milestones`,
      },
      {
        label: "Property tax appeal review",
        description: "Identify over-assessment and build the appeal case",
        prompt: `Evaluate property tax appeal opportunity for __________. Current assessed value: $__________. Current tax bill: $__________.

1. ASSESSMENT VS. MARKET
   - Recent sale comps of similar properties (3 yrs)
   - Implied $/SF and cap-rate-derived value
   - Income approach: current NOI ÷ market cap rate
   - Equity / uniformity check: how nearby similar properties are assessed

2. OVER-ASSESSMENT GAP
   - $ delta between assessed and market value
   - Estimated tax savings if reduced
   - Multi-year savings if reduction holds

3. APPEAL VIABILITY
   - Jurisdiction's appeal deadline and process
   - Burden of proof and accepted methodologies
   - Recent appeal outcomes for similar properties
   - Risk of upward reassessment

4. EXECUTION
   - DIY vs. firm engagement (cost vs. contingency)
   - Evidence to assemble: appraisal, comps, income statement
   - Recommended target reduction and likely settlement

Net present value of the appeal effort.`,
      },
      {
        label: "Operating expense audit",
        description: "Line-by-line OpEx benchmark with savings opportunities",
        prompt: `Audit the operating expenses for __________. Pull last 24 months of operating statements.

For each category, benchmark $/SF against submarket for this asset class:
- Real estate taxes
- Property insurance
- Utilities (broken out: electric, gas, water, sewer)
- Janitorial / cleaning
- Landscaping / snow removal
- Security
- R&M (broken out: HVAC, plumbing, electrical, parking lot, roof)
- Trash / recycling
- Pest control
- Management fee
- Administrative
- Legal & professional
- Marketing / leasing
- Bad debt

For each line:
- Subject $/SF vs. benchmark range
- $ variance (over/under)
- Year-over-year trend
- Recommended action (rebid, audit, accept)

TOP OPPORTUNITIES
- 5 largest savings opportunities with implementation plan
- Total annual savings target
- One-time investment required vs. recurring benefit`,
      },
    ],
  },
  {
    category: "Disposition",
    prompts: [
      {
        label: "Hold / sell analysis",
        description: "Net proceeds vs. forward returns to decide timing",
        prompt: `Should I hold or sell __________ today? Current basis: $__________. In-place NOI: $__________. Outstanding debt: $__________ at __________%.

SELL TODAY
- Indicated market value at current cap of __________%
- Net proceeds after broker fee, defeasance/yield maintenance, transfer taxes, closing costs
- Recapture / depreciation tax hit
- 1031 vs. cash treatment

HOLD 3 / 5 / 7 YEARS
- NOI growth assumption and rationale
- Forward cap rate scenarios (compression, flat, expansion)
- CapEx required during hold
- Refinance proceeds at year 5
- Levered IRR through each exit year

OPPORTUNITY COST
- Where would I redeploy net sale proceeds and at what return
- Risk profile of redeploy vs. hold

VERDICT
- Hold, sell, or recapitalize (cash-out refi)
- If sell: optimal timing and listing process
- If hold: the trigger that would change my mind`,
      },
      {
        label: "BOV / Broker opinion of value",
        description: "Defensible value range with method reconciliation",
        prompt: `Build a Broker Opinion of Value for __________. Owner is considering a sale.

PROPERTY SUMMARY
- Address, asset type, year built, RSF, occupancy, WALT
- Submarket and trade area
- Recent capital improvements, deferred maintenance

VALUATION — three approaches
1. INCOME APPROACH
   - In-place NOI ÷ market cap rate = $__________
   - Stabilized NOI ÷ exit cap = $__________
   - DCF over 10 years with terminal value

2. SALES COMPARISON
   - 5 closest comp trades with $/SF and cap rate
   - Adjustments and indicated value range

3. REPLACEMENT COST
   - Land + hard cost to rebuild today, less depreciation
   - Sanity check on income / comp values

RECONCILED VALUE RANGE
- Low / mid / high
- Recommended listing strategy: whisper, off-market, broad

LIKELY BUYER POOL
- Profile: institutional, private capital, 1031 buyer, owner-user, opportunistic
- 5 specific buyer names to call first

MARKETING TIMELINE
- BOV → engagement → OM → tour → BIDs → best & final → PSA → close`,
      },
    ],
  },
];

// Quick-jump pills under the landing input. Each routes to its real
// page so the "Memory" / "Vault" / etc. labels aren't decorative —
// click them and you land on the workspace's memory, vault docs,
// contacts list, or calendar. Workflows is now a top-level nav item.
const KNOWLEDGE_SOURCES = [
  { label: "Memory", icon: Database, href: "/dante/archive" },
  { label: "Vault", icon: BookOpen, href: "/vault" },
  { label: "Contacts", icon: Users, href: "/contacts" },
  { label: "Calendar", icon: CalendarDays, href: "/calendar" },
] as const;

// Workflow tiles surfaced on the landing — the four highest-value
// templates curated for first-time-feel. Picked manually rather
// than slicing the full list from lib/dante/templates.ts because
// (a) the bundle size for the gallery's full registry is wasted on
// a 4-card preview and (b) the order matters for the buyer
// demographic — meeting prep + post-meeting + QBR + life event
// reads as the day-job of a CRE broker; niche templates can wait
// for the /dante/workflows page proper.
const RECOMMENDED_WORKFLOWS_ADVISOR = [
  { slug: "meeting-prep-packet", name: "Draft a meeting prep packet", kindLabel: "Draft", steps: 5 },
  { slug: "post-meeting-followup", name: "Generate post-meeting follow-up", kindLabel: "Output", steps: 4 },
  { slug: "qbr-reminder", name: "Quarterly review reminders", kindLabel: "Output", steps: 4 },
  { slug: "life-event-detector", name: "Surface contact deal events", kindLabel: "Review", steps: 5 },
] as const;

const RECOMMENDED_WORKFLOWS_REALTOR = [
  { slug: "lease-expiration-outreach", name: "Lease expiration outreach", kindLabel: "Outreach", steps: 4 },
  { slug: "property-showing-prep", name: "Prep a property showing packet", kindLabel: "Draft", steps: 5 },
  { slug: "tenant-renewal-followup", name: "Tenant renewal follow-up", kindLabel: "Output", steps: 4 },
  { slug: "comp-analysis", name: "Run a comp analysis", kindLabel: "Research", steps: 3 },
] as const;

const REWRITE_PRESETS = [
  { label: "Shorter", instruction: "Make it shorter — half the length, same key facts." },
  { label: "Bullets", instruction: "Rewrite as a bulleted list." },
  { label: "More formal", instruction: "Rewrite in a more formal, professional tone." },
  { label: "Add example", instruction: "Add a concrete example illustrating the main point." },
] as const;

// ── Component ────────────────────────────────────────────────────

export default function AskDante({
  assistantName = "Dante",
  userName = "",
}: {
  /** Brand name of the assistant. */
  assistantName?: string;
  /** First name of the signed-in user, for the landing greeting. */
  userName?: string;
}) {
  // Brand info (name + iconPath) flows from /dante/layout.tsx via the
  // AssistantNameProvider context. The prop above is a legacy override
  // — we keep it for the InputBar placeholder, but the hero icon
  // reads from context so it always matches the breadcrumb gate.
  const brand = useAssistantBrand();
  const isRealtor = true; // CRE-only; single vertical
  const QUICK_PROMPTS = isRealtor ? QUICK_PROMPTS_REALTOR : QUICK_PROMPTS_ADVISOR;
  const RECOMMENDED_WORKFLOWS = isRealtor ? RECOMMENDED_WORKFLOWS_REALTOR : RECOMMENDED_WORKFLOWS_ADVISOR;
  const router = useRouter();
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [chatId, setChatId] = useState<string | undefined>();
  const [streamState, setStreamState] = useState<StreamState>(initialStreamState());
  const [recent, setRecent] = useState<RecentChat[]>([]);
  const [promptsOpen, setPromptsOpen] = useState(false);
  const [promptLibraryOpen, setPromptLibraryOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deepResearch, setDeepResearch] = useState(false);
  // Vergil-only — when true the composer routes to /api/dante/web-scrape
  // (Anthropic Web Scraper managed agent). Mutually exclusive with
  // deepResearch; the toolbar enforces that.
  const [webScrape, setWebScrape] = useState(false);
  const [refining, setRefining] = useState<"customize" | "rewrite" | null>(null);
  const [contextContact, setContextContact] = useState<Contact | null>(null);
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [contextProject, setContextProject] = useState<{ id: string; name: string } | null>(null);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [vaultProjects, setVaultProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [editorContent, setEditorContent] = useState<string | null>(null);
  // Files attached via the + Files and sources button. Browser-side
  // text extraction lands here; the array gets shipped on the next
  // submit() in the existing `attachments` field. Cleared after send.
  const [attachments, setAttachments] = useState<Array<{
    name: string;
    ext?: string;
    text: string;
    truncated?: boolean;
    /** Base64 data URL for image attachments (vision). */
    image_data?: string;
    media_type?: string;
  }>>([]);
  // First-run secrets check — when broker_email isn't configured,
  // show a setup prompt so the user doesn't discover the gap via a
  // cryptic workflow failure.
  const [secretsReady, setSecretsReady] = useState<boolean | null>(null);
  // Workflow health — banner on landing when scheduled workflows are
  // failing. Fetched once on mount so the broker sees it immediately
  // without navigating to the Workflows page.
  const [workflowHealth, setWorkflowHealth] = useState<{
    ok: boolean;
    failing: Array<{
      workflow_name: string;
      error: string;
      consecutive_failures: number;
    }>;
  } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const lastMessageRef = useRef<string>("");

  const inExpandedMode = turns.length > 0 || streamState.streaming;

  const refreshRecent = useCallback(async () => {
    try {
      const res = await fetch("/api/dante/chats");
      const json = await res.json();
      setRecent((json.chats || []) as RecentChat[]);
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    refreshRecent();
    fetch("/api/vault/projects")
      .then((r) => r.json())
      .then((d) => setVaultProjects(d.projects || []))
      .catch(() => {});
    fetch("/api/dante/workflows/health")
      .then((r) => r.json())
      .then((d) => {
        if (d && typeof d.ok === "boolean") setWorkflowHealth(d);
      })
      .catch(() => {});
    fetch("/api/dante/secrets/check")
      .then((r) => r.json())
      .then((d) => {
        if (d && typeof d.has_broker_email === "boolean")
          setSecretsReady(d.has_broker_email);
      })
      .catch(() => {});
    return () => abortRef.current?.abort();
  }, [refreshRecent]);

  useEffect(() => {
    if (!projectPickerOpen) return;
    const handler = () => setProjectPickerOpen(false);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [projectPickerOpen]);

  // Auto-scroll to bottom on new content.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns.length, streamState.streaming, streamState.events.length, streamState.followups.length]);

  // Pop the Cmd+D dialog when Dante needs input from the user.
  // The needs_input SSE event sets streamState.needsInput; we watch
  // it and dispatch drift:open-ask to summon the small prompt box.
  const needsInputFiredRef = useRef<string | null>(null);
  useEffect(() => {
    const ni = streamState.needsInput;
    if (!ni) return;
    // Dedup so we don't re-fire on every render
    const key = ni.question;
    if (needsInputFiredRef.current === key) return;
    needsInputFiredRef.current = key;

    // Build a concise seed prompt. The user edits or replaces this
    // before hitting Enter, so keep it short and action-ready.
    const fieldHints = ni.fields
      .map((f) => `${f.label}: ${f.placeholder || ""}`)
      .join(", ");
    const seed = `Configure ${ni.workflow_name || "workflow"}: ${fieldHints}`;

    window.dispatchEvent(
      new CustomEvent("drift:open-ask", { detail: { prompt: seed } }),
    );

    // Schedule a server-side nudge in 5 minutes. Unlike the old
    // client-side setTimeout, this survives page navigation and app
    // close — the cron tick sweeps pending nudges and delivers them.
    fetch("/api/dante/nudge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        schedule: true,
        question: ni.question,
        workflow_name: ni.workflow_name || "a workflow",
        chat_id: chatId,
      }),
    }).catch(() => {});
  }, [streamState.needsInput, chatId]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };

  // Browser-side text extraction for the + Files and sources picker.
  // Three paths:
  //   • Plain text (txt/md/csv/json/log/yaml/yml/tsv) — TextDecoder
  //   • PDF — pdfjs-dist (already in the bundle for SourceViewer);
  //     walks pages, concatenates getTextContent items.
  //   • DOCX — mammoth (already in the bundle for SourceViewer);
  //     extractRawText returns the document's plain text.
  // Anything else gets a friendly placeholder so the model still
  // knows the user offered the file.
  const TEXT_EXTS = new Set(["txt", "md", "csv", "json", "log", "yaml", "yml", "tsv"]);
  const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp"]);
  const MAX_TEXT_CHARS = 200_000; // ~50k tokens — preserves prompt budget
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB per image

  async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
    const pdfjs = (await import("pdfjs-dist")) as unknown as {
      GlobalWorkerOptions: { workerSrc?: string };
      getDocument: (opts: { data: ArrayBuffer }) => { promise: Promise<{
        numPages: number;
        getPage: (n: number) => Promise<{
          getTextContent: () => Promise<{ items: Array<{ str?: string }> }>;
          cleanup: () => void;
        }>;
      }> };
    };
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    }
    const doc = await pdfjs.getDocument({ data: buffer }).promise;
    const out: string[] = [];
    let total = 0;
    for (let p = 1; p <= doc.numPages; p++) {
      if (total > MAX_TEXT_CHARS) break;
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((i) => i.str || "")
        .filter(Boolean)
        .join(" ");
      out.push(pageText);
      total += pageText.length;
      page.cleanup();
    }
    return out.join("\n\n");
  }

  async function extractDocxText(buffer: ArrayBuffer): Promise<string> {
    const mod = (await import(
      /* webpackChunkName: "mammoth-browser" */
      "mammoth/mammoth.browser.js" as string
    )) as unknown as {
      extractRawText: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>;
    };
    const { value } = await mod.extractRawText({ arrayBuffer: buffer });
    return value || "";
  }

  function clamp(text: string): { text: string; truncated: boolean } {
    if (text.length <= MAX_TEXT_CHARS) return { text, truncated: false };
    return { text: text.slice(0, MAX_TEXT_CHARS), truncated: true };
  }

  async function readFileForAttach(file: File): Promise<{
    name: string;
    ext?: string;
    text: string;
    truncated?: boolean;
    image_data?: string;
    media_type?: string;
  } | null> {
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    try {
      // Image files — read as base64 for Claude vision
      if (IMAGE_EXTS.has(ext)) {
        if (file.size > MAX_IMAGE_BYTES) {
          return {
            name: file.name,
            ext,
            text: `(Image ${file.name} too large — ${Math.round(file.size / 1024 / 1024)}MB exceeds the 5MB limit.)`,
          };
        }
        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        const b64 = btoa(binary);
        const mediaType = ext === "png" ? "image/png"
          : ext === "gif" ? "image/gif"
          : ext === "webp" ? "image/webp"
          : "image/jpeg";
        return {
          name: file.name,
          ext,
          text: `(Image: ${file.name})`,
          image_data: b64,
          media_type: mediaType,
        };
      }
      if (TEXT_EXTS.has(ext)) {
        const buf = await file.arrayBuffer();
        const raw = new TextDecoder("utf-8", { fatal: false }).decode(buf);
        const { text, truncated } = clamp(raw);
        return { name: file.name, ext, text, truncated };
      }
      if (ext === "pdf") {
        const buf = await file.arrayBuffer();
        const raw = await extractPdfText(buf);
        const { text, truncated } = clamp(raw);
        return { name: file.name, ext, text, truncated };
      }
      if (ext === "docx" || ext === "doc") {
        const buf = await file.arrayBuffer();
        const raw = await extractDocxText(buf);
        const { text, truncated } = clamp(raw);
        return { name: file.name, ext, text, truncated };
      }
    } catch (e) {
      console.warn(`[file-attach] extraction failed for ${file.name}:`, e);
      return {
        name: file.name,
        ext: ext || undefined,
        text: `(File ${file.name} couldn't be read: ${e instanceof Error ? e.message : "extraction failed"}. Try converting to text and re-attaching.)`,
        truncated: false,
      };
    }
    return {
      name: file.name,
      ext: ext || undefined,
      text: `(File ${file.name} attached — ${ext.toUpperCase() || "this file type"} not yet supported in chat. Drop it into a watched folder to ingest into the vault, or convert to text first.)`,
      truncated: false,
    };
  }

  async function onFilesPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow picking the same file again
    if (files.length === 0) return;
    const extracted = await Promise.all(files.map(readFileForAttach));
    const fresh = extracted.filter((x): x is NonNullable<typeof x> => Boolean(x));
    setAttachments((prev) => [...prev, ...fresh]);
  }

  // Drag-and-drop support — lets users drop files anywhere on the
  // chat surface instead of having to click the + Files button.
  const [dragOver, setDragOver] = useState(false);
  const dragCounter = useRef(0);

  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) setDragOver(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setDragOver(false);
    }
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    const extracted = await Promise.all(files.map(readFileForAttach));
    const fresh = extracted.filter((x): x is NonNullable<typeof x> => Boolean(x));
    setAttachments((prev) => [...prev, ...fresh]);
  }, []);

  const submit = async (overrideInput?: string) => {
    const message = (overrideInput ?? input).trim();
    if (!message || streamState.streaming) return;

    lastMessageRef.current = message;
    abortRef.current = new AbortController();
    setTurns((prev) => [...prev, { role: "user", content: message }]);
    setInput("");
    // Snapshot attachments now; clear state so the next turn starts
    // with a fresh tray. The body below references this snapshot.
    const sentAttachments = attachments;
    setAttachments([]);
    setStreamState({ ...initialStreamState(), streaming: true });

    try {
      let captured: StreamState = initialStreamState();
      // Mode → endpoint routing. Three modes:
      //   • web-scrape (Vergil "Pull comps") → /api/dante/web-scrape
      //   • deep-research (Telescope toggle) → /api/dante/deep-research
      //   • default chat → /api/dante/ask
      // Each managed-agent endpoint speaks the same SSE protocol, so
      // the consumer doesn't change. Contact/property scope is dropped
      // for managed-agent runs since those agents have no Drift vault
      // access — they read the open web.
      //
      // OVERRIDE: Void analysis requests MUST go through the agent
      // route regardless of toggle state, because only the agent loop
      // has survey_area, site_scan tools, accuracy enforcement, and
      // auto-dashboard construction. Without this, void analyses
      // produce a wall of unverified text.
      const msgLower = message.toLowerCase();
      const isVoidAnalysis =
        msgLower.includes("void analysis") ||
        msgLower.includes("void study") ||
        msgLower.includes("trade area analysis") ||
        msgLower.includes("find voids") ||
        msgLower.includes("what's missing") ||
        msgLower.includes("whats missing") ||
        msgLower.includes("tenant mix") ||
        msgLower.includes("gap analysis");
      const isManagedAgent = !isVoidAnalysis && (webScrape || deepResearch);
      const endpoint = isVoidAnalysis
        ? "/api/dante/ask"
        : webScrape
          ? "/api/dante/web-scrape"
          : deepResearch
            ? "/api/dante/deep-research"
            : "/api/dante/ask";
      await consumeAgentStream({
        endpoint,
        body: {
          message,
          chat_id: chatId,
          deep: deepResearch,
          context_contact_id: isManagedAgent ? undefined : contextContact?.id,
          context_contact_name: isManagedAgent ? undefined : (contextContact?.name || undefined),
          context_project_id: contextProject?.id,
          attachments: sentAttachments.length > 0 ? sentAttachments : undefined,
        },
        signal: abortRef.current.signal,
        onUpdate: (next) => {
          captured = next;
          setStreamState(next);
        },
      });
      // Stream ended — flush the assistant turn into the persistent
      // turns list so subsequent renders show it like history. Reset
      // streamState so the live trace clears.
      const assistantTurn: AssistantTurn = {
        role: "assistant",
        content: captured.finalContent || "(no response)",
        trace: captured.trace,
        followups: captured.followups || [],
        citationReport: captured.citationReport ?? null,
        grounding: captured.grounding ?? null,
        documents: captured.documents.length > 0 ? captured.documents : undefined,
      };
      if (captured.chatId) setChatId(captured.chatId);
      setTurns((prev) => [...prev, assistantTurn]);
      setStreamState(initialStreamState());
      refreshRecent();
    } catch (err) {
      setStreamState((prev) => ({
        ...prev,
        streaming: false,
        error: err instanceof Error ? err.message : "request_failed",
      }));
    }
  };

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreamState((prev) => {
      // If we already have partial content, preserve it as a truncated
      // assistant turn so the user can still read what was generated.
      if (prev.finalContent) {
        const truncatedTurn: AssistantTurn = {
          role: "assistant",
          content: prev.finalContent + "\n\n[Generation stopped by user]",
          trace: prev.trace,
          followups: [],
          citationReport: null,
          grounding: null,
        };
        setTurns((t) => [...t, truncatedTurn]);
      }
      return initialStreamState();
    });
  }, []);

  const onCustomize = async () => {
    const text = input.trim();
    if (!text || refining) return;
    setRefining("customize");
    try {
      const res = await fetch("/api/dante/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "prompt", text }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        alert(`Customize failed (${res.status}): ${body.slice(0, 200)}`);
        return;
      }
      const json = await res.json();
      if (json.text) {
        setInput(json.text);
        textareaRef.current?.focus();
      }
    } catch (err) {
      alert(`Customize failed: ${err instanceof Error ? err.message : "network error"}`);
    } finally {
      setRefining(null);
    }
  };

  const onRewriteLast = async (instruction: string) => {
    // Rewrites the latest assistant turn's content per the chosen
    // preset. Citations are preserved verbatim by the refine endpoint.
    const lastIdx = [...turns].reverse().findIndex((t) => t.role === "assistant");
    if (lastIdx < 0 || refining) return;
    const realIdx = turns.length - 1 - lastIdx;
    const assistant = turns[realIdx] as AssistantTurn;
    setRefining("rewrite");
    try {
      const res = await fetch("/api/dante/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "answer", text: assistant.content, instruction }),
      });
      const json = await res.json();
      if (res.ok && json.text) {
        setTurns((prev) => {
          const next = [...prev];
          next[realIdx] = { ...assistant, content: json.text };
          return next;
        });
      }
    } catch {
      /* swallow */
    } finally {
      setRefining(null);
    }
  };

  const usePrompt = (prompt: string) => {
    setInput(prompt);
    setPromptsOpen(false);
    textareaRef.current?.focus();
  };

  const handleFollowup = (q: string) => {
    submit(q);
  };

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div
      className={`flex flex-col h-full w-full ${inExpandedMode ? "" : "px-6"} relative`}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {/* Drop overlay */}
      {dragOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[var(--canvas)]/80 backdrop-blur-sm border-2 border-dashed border-[var(--ink-subtle)] rounded-xl pointer-events-none">
          <div className="text-center">
            <p className="text-lg font-medium text-[var(--ink-muted)]">Drop files here</p>
            <p className="text-sm text-[var(--ink-subtle)] mt-1">Images, PDFs, text files</p>
          </div>
        </div>
      )}
      {/* Landing — Mike-style centered greeting with serif font */}
      <div
        className={`transition-all duration-500 ease-out ${
          inExpandedMode
            ? "opacity-0 -translate-y-4 max-h-0 overflow-hidden pointer-events-none"
            : "flex-1 flex flex-col items-center justify-center px-6 overflow-y-auto"
        }`}
      >
        <div className="flex-col items-center w-full max-w-4xl relative px-0 xl:px-8 py-12">
          <div className="mb-10 text-center">
            <div className="label-section mb-3">
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              }).toUpperCase()}
            </div>
            <h1 className="text-4xl font-serif font-light text-[var(--ink)]">
              {(() => {
                const h = new Date().getHours();
                const tod = h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening";
                return userName ? `${tod}, ${userName}.` : `Good ${tod.toLowerCase()}.`;
              })()}
            </h1>
          </div>

          {/* First-run setup prompt — shown until broker_email is
              configured. Without it, every workflow that sends email
              will fail silently. */}
          {secretsReady === false && (
            <div className="w-full max-w-2xl mx-auto mb-4">
              <div className="rounded-lg border border-[var(--accent)]/20 bg-[var(--accent)]/[0.04] px-4 py-3">
                <p className="text-sm font-medium text-[var(--ink)] mb-1">
                  Set up your delivery email
                </p>
                <p className="text-xs text-[var(--ink-muted)] mb-2.5 leading-relaxed">
                  Workflows need an email address to send you reports.
                  Tell {brand.name} your email to get started, or configure
                  it in settings.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      window.dispatchEvent(
                        new CustomEvent("drift:open-ask", {
                          detail: { prompt: "Set my broker_email to " },
                        }),
                      );
                    }}
                    className="rounded-md bg-[var(--ink)] text-white px-3 py-1.5 text-xs font-medium hover:opacity-90 transition-opacity"
                  >
                    Configure now
                  </button>
                  <Link
                    href="/dante/settings/secrets"
                    className="text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] underline transition-colors"
                  >
                    Open settings
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Workflow health banner — visible when scheduled
              automations are failing so the broker knows immediately */}
          {workflowHealth && !workflowHealth.ok && workflowHealth.failing.length > 0 && (
            <div className="w-full max-w-2xl mx-auto mb-6">
              <Link
                href="/workflows"
                className="block rounded-lg border border-[var(--rule)] bg-[var(--canvas-subtle)] px-4 py-3 hover:bg-[var(--neu-hover)] transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 w-2 h-2 rounded-full bg-[var(--danger)] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--ink)]">
                      {workflowHealth.failing.length === 1
                        ? `"${workflowHealth.failing[0].workflow_name}" is failing`
                        : `${workflowHealth.failing.length} workflows are failing`}
                    </p>
                    <p className="text-xs text-[var(--ink-muted)] mt-0.5 line-clamp-2">
                      {workflowHealth.failing.length === 1
                        ? workflowHealth.failing[0].error
                        : workflowHealth.failing.map((f) => f.workflow_name).join(", ")}
                    </p>
                    <p className="text-xs text-[var(--ink-subtle)] mt-1">
                      View in Workflows to fix
                    </p>
                  </div>
                </div>
              </Link>
            </div>
          )}

          {/* Scope chips — thin affordance row */}
          <div className="flex items-center justify-center gap-4 mb-6">
            {contextProject ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-[var(--ink-muted)] bg-[var(--neu-hover)] rounded-full px-3 py-1">
                <BookOpen className="w-3.5 h-3.5" strokeWidth={1.5} />
                {contextProject.name}
                <button
                  onClick={() => setContextProject(null)}
                  className="hover:text-[var(--ink)] ml-0.5"
                  title="Clear project scope"
                >
                  <X className="w-3 h-3" strokeWidth={2} />
                </button>
              </span>
            ) : (
              <div className="relative">
                <button
                  onClick={() => setProjectPickerOpen((v) => !v)}
                  className="inline-flex items-center gap-1.5 text-xs text-[var(--ink-subtle)] hover:text-[var(--ink-muted)] transition"
                >
                  <BookOpen className="w-3.5 h-3.5" strokeWidth={1.5} />
                  Choose Vault project
                </button>
                {projectPickerOpen && (
                  <div className="absolute top-full left-0 mt-1 glass-card rounded-lg p-1 z-50 w-64 max-h-60 overflow-y-auto">
                    {vaultProjects.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-[var(--ink-subtle)]">No projects yet</div>
                    ) : (
                      vaultProjects.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => {
                            setContextProject(p);
                            setProjectPickerOpen(false);
                          }}
                          className="w-full px-3 py-2 text-left text-sm text-[var(--ink-muted)] hover:bg-[var(--neu-hover)] rounded-md truncate"
                        >
                          {p.name}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
            {contextContact ? (
              <ContextChip
                contact={contextContact}
                onClear={() => setContextContact(null)}
              />
            ) : (
              <button
                onClick={() => setContactPickerOpen(true)}
                className="inline-flex items-center gap-1.5 text-xs text-[var(--ink-subtle)] hover:text-[var(--ink-muted)] transition"
              >
                <Users className="w-3.5 h-3.5" strokeWidth={1.5} />
                Set contact context
              </button>
            )}
          </div>

          {/* Input — only inline (in landing) before any messages exist. */}
          {!inExpandedMode && (
            <>
              <InputBar
                input={input}
                setInput={setInput}
                onKeyDown={onKeyDown}
                submit={() => submit()}
                onStop={handleStop}
                streaming={streamState.streaming}
                deepResearch={deepResearch}
                setDeepResearch={setDeepResearch}
                webScrape={webScrape}
                setWebScrape={setWebScrape}
                promptsOpen={promptsOpen}
                setPromptsOpen={setPromptsOpen}
                promptLibraryOpen={promptLibraryOpen}
                setPromptLibraryOpen={setPromptLibraryOpen}
                onCustomize={onCustomize}
                customizing={refining === "customize"}
                textareaRef={textareaRef}
                rows={1}
                assistantName={assistantName}
                onOpenFilesAndSources={() => fileInputRef.current?.click()}
                attachments={attachments}
                onRemoveAttachment={(idx) => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                quickPrompts={QUICK_PROMPTS}
                isRealtor={isRealtor}
              />
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                onChange={onFilesPicked}
                accept=".txt,.md,.csv,.json,.log,.yaml,.yml,.tsv,.pdf,.docx,.doc,.png,.jpg,.jpeg,.gif,.webp"
              />
              <div className="text-center">
                <p className="text-xs py-3 text-[var(--ink-subtle)]">
                  AI can make mistakes. Answers are not legal or financial advice.
                </p>
              </div>

              {/* Knowledge source pills */}
              <div className="flex items-center justify-center gap-2 flex-wrap mt-2 mb-6">
                {KNOWLEDGE_SOURCES.map((s) => (
                  <Link
                    key={s.label}
                    href={s.href}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/30 border-t-white/50 bg-[var(--neu-card)] text-xs text-[var(--ink-subtle)] hover:text-[var(--ink-muted)] hover:bg-[var(--neu-hover)] transition"
                  >
                    <s.icon className="w-3 h-3" strokeWidth={1.5} />
                    {s.label}
                  </Link>
                ))}
              </div>

              {/* Recommended workflows */}
              <div className="w-full max-w-2xl mx-auto mb-6">
                <div className="grid grid-cols-2 gap-3">
                  {RECOMMENDED_WORKFLOWS.map((w) => (
                    <Link
                      key={w.slug}
                      href={`/dante/workflows?run=${w.slug}`}
                      className="group flex flex-col gap-1 glass-card rounded-lg p-3 hover:shadow-[var(--neu-shadow-raised)] transition"
                    >
                      <span className="text-[10px] uppercase tracking-wider text-[var(--ink-subtle)] font-medium">
                        {w.kindLabel} · {w.steps} steps
                      </span>
                      <span className="text-sm text-[var(--ink-muted)] group-hover:text-[var(--ink)] transition leading-snug">
                        {w.name}
                      </span>
                    </Link>
                  ))}
                </div>
                <div className="text-center mt-3">
                  <Link
                    href="/dante/workflows"
                    className="text-xs text-[var(--ink-subtle)] hover:text-[var(--ink-muted)] transition inline-flex items-center gap-1"
                  >
                    All workflows <ArrowUpRight className="w-3 h-3" strokeWidth={1.5} />
                  </Link>
                </div>
              </div>

              {/* Recent chats */}
              {recent.length > 0 && (
                <div className="w-full max-w-2xl mx-auto mb-4">
                  <button
                    onClick={() => setHistoryOpen((v) => !v)}
                    className="flex items-center gap-1.5 text-xs text-[var(--ink-subtle)] hover:text-[var(--ink-muted)] transition mb-2"
                  >
                    <History className="w-3 h-3" strokeWidth={1.5} />
                    Recent conversations
                    {historyOpen ? (
                      <ChevronDown className="w-3 h-3" strokeWidth={1.5} />
                    ) : (
                      <ChevronRight className="w-3 h-3" strokeWidth={1.5} />
                    )}
                  </button>
                  {historyOpen && (
                    <div className="space-y-0.5">
                      {recent.slice(0, 8).map((c) => (
                        <Link
                          key={c.id}
                          href={`/dante/chat/${c.id}`}
                          className="flex items-center justify-between px-3 py-2 rounded-md text-sm text-[var(--ink-muted)] hover:bg-[var(--neu-hover)] hover:text-[var(--ink)] transition"
                        >
                          <span className="truncate flex-1">{c.title}</span>
                          <span className="text-[10px] text-[var(--ink-subtle)] ml-4 shrink-0">
                            {new Date(c.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Expanded mode header — navigate back to landing */}
      {inExpandedMode && (
        <div className="flex items-center justify-between px-6 md:px-8 py-2 max-w-5xl mx-auto w-full">
          <span className="text-sm font-medium text-[var(--ink-subtle)]">{brand.name}</span>
          <button
            onClick={() => {
              // Abort any in-flight stream, clear all conversation
              // state, and navigate back to the Dante landing. A plain
              // <Link> to /dante doesn't work when we're already on
              // /dante because Next.js skips the re-mount.
              abortRef.current?.abort();
              abortRef.current = null;
              setTurns([]);
              setChatId(undefined);
              setStreamState(initialStreamState());
              setInput("");
              setContextContact(null);
              setContextProject(null);
              setEditorContent(null);
              setAttachments([]);
              setDeepResearch(false);
              setWebScrape(false);
              setRefining(null);
              router.push("/dante");
            }}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--ink-subtle)] hover:text-[var(--ink)] transition px-2.5 py-1.5 rounded-md hover:bg-[var(--neu-hover)]"
          >
            Home
          </button>
        </div>
      )}

      {/* Scrollable messages area — flex-1 so it fills remaining height and scrolls from top */}
      {inExpandedMode && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          {/* Compact context chips */}
          {(contextContact || contextProject) && (
            <div className="mb-4 flex items-center gap-4 text-xs text-[var(--ink-subtle)] max-w-5xl mx-auto px-6 md:px-8 pt-4">
              {contextProject && (
                <span className="flex items-center gap-1.5">
                  <BookOpen className="w-3 h-3" strokeWidth={1.5} />
                  <span className="text-[var(--ink)] font-medium">{contextProject.name}</span>
                  <button onClick={() => setContextProject(null)} className="hover:text-[var(--ink-muted)]" title="Clear project scope">
                    <X className="w-3 h-3" strokeWidth={2} />
                  </button>
                </span>
              )}
              {contextContact && (
                <span className="flex items-center gap-1.5">
                  <Users className="w-3 h-3" strokeWidth={1.5} />
                  <span className="text-[var(--ink)] font-medium">
                    {contextContact.name || contextContact.email}
                  </span>
                  <button onClick={() => setContextContact(null)} className="hover:text-[var(--ink-muted)]" title="Clear context">
                    <X className="w-3 h-3" strokeWidth={2} />
                  </button>
                </span>
              )}
            </div>
          )}

          {/* Threaded messages */}
          <div className="max-w-5xl mx-auto px-6 md:px-10 pt-6 md:pt-8 pb-32 space-y-10">
            {turns.map((t, i) =>
              t.role === "user" ? (
                <UserMessage key={i} content={t.content} />
              ) : (
                <AssistantMessage
                  key={i}
                  content={t.content}
                  trace={t.trace}
                  followups={t.followups}
                  citationReport={t.citationReport ?? null}
                  grounding={t.grounding ?? null}
                  documents={t.documents}
                  onOpenEditor={(c) => setEditorContent(c)}
                  onRewrite={(instruction) => onRewriteLast(instruction)}
                  onFollowup={(q) => handleFollowup(q)}
                  rewriting={refining === "rewrite"}
                />
              ),
            )}

            {streamState.streaming && (
              <LiveThinking state={streamState} deep={deepResearch} />
            )}

            {streamState.error && (
              <div className="rounded-lg border border-[var(--rule)] bg-[var(--canvas-subtle)] px-4 py-3 text-sm text-[var(--ink)]">
                <p className="mb-2 leading-relaxed">{streamState.error}</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const msg = lastMessageRef.current;
                      if (!msg) return;
                      setStreamState(initialStreamState());
                      setTurns((prev) => {
                        const last = prev[prev.length - 1];
                        if (last?.role === "user") return prev.slice(0, -1);
                        return prev;
                      });
                      setTimeout(() => submit(msg), 0);
                    }}
                    className="shrink-0 rounded-md bg-[var(--ink)] text-white px-3 py-1 text-xs font-medium hover:opacity-90 transition-opacity"
                  >
                    Try again
                  </button>
                  {streamState.error.includes("secrets") && (
                    <Link
                      href="/dante/settings/secrets"
                      className="text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] underline transition-colors"
                    >
                      Open Secrets settings
                    </Link>
                  )}
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Pinned input bar — sticky within the scroll container so it
              centres against the same width as the messages above. */}
          <div className="sticky bottom-0 z-30 bg-gradient-to-t from-[var(--canvas)] via-[var(--canvas)]/95 to-transparent pt-6 pb-4">
            <div className="max-w-5xl mx-auto px-6 md:px-8">
              <InputBar
                compact
                input={input}
                setInput={setInput}
                onKeyDown={onKeyDown}
                submit={() => submit()}
                onStop={handleStop}
                streaming={streamState.streaming}
                deepResearch={deepResearch}
                setDeepResearch={setDeepResearch}
                webScrape={webScrape}
                setWebScrape={setWebScrape}
                promptsOpen={promptsOpen}
                setPromptsOpen={setPromptsOpen}
                promptLibraryOpen={promptLibraryOpen}
                setPromptLibraryOpen={setPromptLibraryOpen}
                onCustomize={onCustomize}
                customizing={refining === "customize"}
                textareaRef={textareaRef}
                rows={1}
                assistantName={assistantName}
              />
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {contactPickerOpen && (
        <ContactPicker
          onPick={(c) => {
            setContextContact(c);
            setContactPickerOpen(false);
          }}
          onClose={() => setContactPickerOpen(false)}
        />
      )}
      {editorContent != null && (
        <DraftEditor
          initialContent={editorContent}
          filenameStem={deriveFilenameStem(editorContent)}
          onClose={() => setEditorContent(null)}
        />
      )}
    </div>
  );
}

// ── Needs-input card ────────────────────────────────────────────
// Inline form card rendered when a tool (typically workflow.run)
// needs configuration values from the user. Submits as a follow-up
// chat message so Dante can call secrets.set for each field.

function NeedsInputCard({
  state,
  onSubmit,
  chatId,
}: {
  state: NeedsInputState;
  onSubmit: (values: Record<string, string>) => void;
  chatId?: string;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [nudgeSent, setNudgeSent] = useState(false);
  const submittedRef = useRef(false);

  // 5-minute idle nudge: if the user doesn't fill the card in time,
  // send them an SMS / email so they know Dante needs input.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (submittedRef.current || nudgeSent) return;
      setNudgeSent(true);
      fetch("/api/dante/nudge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: state.question,
          workflow_name: state.workflow_name || "a workflow",
          chat_id: chatId,
        }),
      }).catch(() => {});
    }, 5 * 60 * 1000); // 5 minutes
    return () => clearTimeout(timer);
  }, [state.question, state.workflow_name, chatId, nudgeSent]);

  const allFilled = state.fields.every((f) => (values[f.key] || "").trim());

  const handleSubmit = () => {
    if (!allFilled) return;
    submittedRef.current = true;
    onSubmit(values);
  };

  return (
    <div className="rounded-xl border border-[var(--rule)] bg-[var(--neu-card)] p-5 max-w-lg">
      <p className="text-sm font-medium text-[var(--ink)] mb-4">
        {state.question}
      </p>
      <div className="space-y-3">
        {state.fields.map((f) => (
          <div key={f.key}>
            <label className="block text-xs font-medium text-[var(--ink-muted)] mb-1">
              {f.label}
            </label>
            <input
              type="text"
              placeholder={f.placeholder || ""}
              value={values[f.key] || ""}
              onChange={(e) =>
                setValues((prev) => ({ ...prev, [f.key]: e.target.value }))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" && allFilled) handleSubmit();
              }}
              className="w-full rounded-lg border border-[var(--rule)] bg-transparent px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)] outline-none focus:border-[var(--ink-muted)] transition-colors"
            />
          </div>
        ))}
      </div>
      <button
        onClick={handleSubmit}
        disabled={!allFilled}
        className="mt-4 px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-b from-neutral-700 to-black text-white disabled:opacity-40 active:enabled:scale-[0.98] transition-all"
      >
        Configure and run
      </button>
    </div>
  );
}

// ── Attachment preview card (Claude-style 100px card) ────────

function AttachmentCard({
  attachment,
  onRemove,
}: {
  attachment: { name: string; ext?: string; truncated?: boolean; text?: string; image_data?: string; media_type?: string };
  onRemove: () => void;
}) {
  const isImage = !!(attachment.image_data && attachment.media_type);
  const extLabel = (attachment.ext || attachment.name.split(".").pop() || "FILE").toUpperCase();

  if (isImage) {
    return (
      <div className="relative group flex-shrink-0 w-[100px] h-[100px] rounded-lg overflow-hidden bg-[var(--canvas-muted)]">
        <img
          src={`data:${attachment.media_type};base64,${attachment.image_data}`}
          alt={attachment.name}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/60 flex items-end p-2 pointer-events-none">
          <span className="text-[10px] text-white/90 bg-black/40 backdrop-blur-sm px-1.5 py-0.5 rounded">
            {extLabel}
          </span>
        </div>
        <button
          onClick={onRemove}
          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label={`Remove ${attachment.name}`}
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  // Text / document file preview
  const previewText = attachment.text?.slice(0, 200) || attachment.name;
  return (
    <div className="relative group flex-shrink-0 w-[100px] h-[100px] rounded-lg overflow-hidden bg-[var(--neu-card)] border border-[var(--rule)] p-2">
      <div className="text-[7px] leading-tight text-[var(--ink-muted)] whitespace-pre-wrap break-words overflow-hidden h-full">
        {previewText}
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[var(--neu-input)] flex items-end p-2 pointer-events-none">
        <span className="text-[10px] bg-[var(--canvas-muted)] border border-[var(--rule)] px-1.5 py-0.5 rounded text-[var(--ink-muted)]">
          {extLabel}
        </span>
        {attachment.truncated && (
          <span className="text-[8px] text-[var(--ink-subtle)] ml-1">truncated</span>
        )}
      </div>
      <button
        onClick={onRemove}
        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label={`Remove ${attachment.name}`}
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

// ── Input bar (Claude-style) ────────────────────────────────────

interface InputBarProps {
  input: string;
  setInput: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  submit: () => void;
  onStop?: () => void;
  streaming: boolean;
  deepResearch: boolean;
  setDeepResearch: (v: boolean | ((prev: boolean) => boolean)) => void;
  webScrape: boolean;
  setWebScrape: (v: boolean | ((prev: boolean) => boolean)) => void;
  promptsOpen: boolean;
  setPromptsOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  promptLibraryOpen: boolean;
  setPromptLibraryOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  onCustomize: () => void;
  customizing: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  rows: number;
  assistantName: string;
  onOpenFilesAndSources?: () => void;
  attachments?: Array<{ name: string; ext?: string; truncated?: boolean; text?: string; image_data?: string; media_type?: string }>;
  onRemoveAttachment?: (idx: number) => void;
  compact?: boolean;
  quickPrompts?: Array<{ label: string; prompt: string }>;
  isRealtor?: boolean;
}

function InputBar(p: InputBarProps) {
  const hasAttachments = p.attachments && p.attachments.length > 0;

  // ── Auto-resize textarea to fit content ─────────────────────
  // Set overflow to hidden while measuring so scrollHeight reflects
  // the full content height, then restore overflow for scrolling.
  useEffect(() => {
    const el = p.textareaRef.current;
    if (!el) return;
    el.style.overflow = "hidden";
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, 384);
    el.style.height = next + "px";
    el.style.overflow = next >= 384 ? "auto" : "hidden";
  }, [p.input, p.textareaRef]);

  // ── Send / Stop button (shared) ────────────────────────────
  const sendStopButton = p.streaming ? (
    <button
      onClick={p.onStop}
      className="relative bg-gradient-to-b from-neutral-700 to-black text-white rounded-[10px] h-8 w-8 flex items-center justify-center backdrop-blur-xl border border-white/30 active:scale-95 transition-all duration-150"
      title="Stop generating"
    >
      <Square className="w-3 h-3" fill="currentColor" />
    </button>
  ) : (
    <button
      onClick={p.submit}
      disabled={!p.input.trim() && !hasAttachments}
      className="relative bg-gradient-to-b from-neutral-700 to-black text-white rounded-[10px] h-8 w-8 flex items-center justify-center disabled:from-neutral-600 disabled:to-black disabled:opacity-40 backdrop-blur-xl border border-white/30 active:enabled:scale-95 transition-all duration-150"
      title="Send (Cmd+Enter)"
    >
      <Send className="w-3.5 h-3.5" strokeWidth={2} />
    </button>
  );

  // ── Attachment cards (Claude-style preview strip) ──────────
  const attachmentStrip = hasAttachments ? (
    <div className="overflow-x-auto border-t border-[var(--rule)] p-2.5 bg-[var(--canvas-muted)] rounded-b-[16px] md:rounded-b-[20px] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      <div className="flex gap-2">
        {p.attachments!.map((a, i) => (
          <AttachmentCard
            key={`${a.name}-${i}`}
            attachment={a}
            onRemove={() => p.onRemoveAttachment?.(i)}
          />
        ))}
      </div>
    </div>
  ) : null;

  // ── Compact mode ───────────────────────────────────────────
  if (p.compact) {
    return (
      <div className="glass-input rounded-[16px] md:rounded-[20px] bg-[var(--neu-input)] border border-white/30 border-t-white/50 flex flex-col transition-all duration-200">
        <div className="px-4 pt-3">
          <textarea
            ref={p.textareaRef}
            value={p.input}
            onChange={(e) => p.setInput(e.target.value)}
            onKeyDown={p.onKeyDown}
            placeholder="How can I help you today?"
            disabled={p.streaming}
            rows={1}
            className="w-full resize-none text-sm border-0 p-0 bg-transparent outline-none placeholder:text-[var(--ink-subtle)] text-[var(--ink)] leading-6 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
            style={{ minHeight: "1.5em", maxHeight: "384px" }}
          />
        </div>
        <div className="flex items-center justify-between p-2.5">
          <div className="flex items-center gap-1">
            {p.onOpenFilesAndSources && (
              <button
                onClick={p.onOpenFilesAndSources}
                disabled={p.streaming}
                className="flex items-center justify-center h-8 w-8 rounded-lg text-[var(--ink-subtle)] hover:bg-[var(--neu-hover)] hover:text-[var(--ink-muted)] transition-colors disabled:opacity-50"
                title="Attach files"
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={2} />
              </button>
            )}
          </div>
          {sendStopButton}
        </div>
        {attachmentStrip}
      </div>
    );
  }

  // ── Full landing input (Claude-style layout) ──────────────
  return (
    <div className="glass-input rounded-[16px] md:rounded-[20px] bg-[var(--neu-input)] border border-white/30 border-t-white/50 flex flex-col transition-all duration-200">
      {/* Auto-expanding textarea */}
      <div className="px-4 pt-4">
        <textarea
          ref={p.textareaRef}
          value={p.input}
          onChange={(e) => p.setInput(e.target.value)}
          onKeyDown={p.onKeyDown}
          placeholder="How can I help you today?"
          disabled={p.streaming}
          rows={1}
          className="w-full resize-none text-sm border-0 p-0 bg-transparent outline-none placeholder:text-[var(--ink-subtle)] text-[var(--ink)] leading-6 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
          style={{ minHeight: "1.5em", maxHeight: "384px" }}
        />
      </div>

      {/* Toolbar — Claude layout: left actions, right send */}
      <div className="flex items-center justify-between px-2 pb-1.5 md:px-2.5">
        <div className="flex items-center gap-1">
          {p.onOpenFilesAndSources && (
            <button
              onClick={p.onOpenFilesAndSources}
              disabled={p.streaming}
              className="flex items-center gap-1.5 rounded-lg px-2 h-8 text-sm text-[var(--ink-subtle)] hover:bg-[var(--neu-hover)] hover:text-[var(--ink-muted)] transition-colors disabled:opacity-50"
              title="Attach files"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={2} />
              <span className="hidden sm:inline">Files</span>
            </button>
          )}
          <ToolbarButton
            icon={Library}
            label="Prompts"
            active={p.promptLibraryOpen}
            onClick={() => p.setPromptLibraryOpen((v) => !v)}
          />
          <ToolbarButton
            icon={Telescope}
            label="Deep research"
            active={p.deepResearch}
            onClick={() => {
              p.setDeepResearch((v) => {
                const next = !v;
                if (next) p.setWebScrape(false);
                return next;
              });
            }}
          />
          <ToolbarButton
            icon={Globe}
            label="Web scrape"
            active={p.webScrape}
            onClick={() => {
              p.setWebScrape((v) => {
                const next = !v;
                if (next) p.setDeepResearch(false);
                return next;
              });
            }}
          />
        </div>
        {sendStopButton}
      </div>

      {/* Attachment preview cards */}
      {attachmentStrip}

      {/* Prompt library modal */}
      {p.promptLibraryOpen && (
        <PromptLibraryModal
          onClose={() => p.setPromptLibraryOpen(false)}
          onUse={(text) => {
            p.setInput(text);
            p.setPromptLibraryOpen(false);
            p.textareaRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}

// ── Full CRE prompt library modal ───────────────────────────────
// Shows every prompt in complete detail. Sidebar of categories on
// the left, prompt cards on the right with the full text visible
// (collapsible) plus copy + use-in-chat actions.

function PromptLibraryModal({
  onClose,
  onUse,
}: {
  onClose: () => void;
  onUse: (text: string) => void;
}) {
  const [activeCategory, setActiveCategory] = useState(CRE_PROMPT_LIBRARY[0].category);
  const [query, setQuery] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const q = query.trim().toLowerCase();
  const sections = q
    ? CRE_PROMPT_LIBRARY.map((s) => ({
        ...s,
        prompts: s.prompts.filter(
          (p) =>
            p.label.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q) ||
            p.prompt.toLowerCase().includes(q),
        ),
      })).filter((s) => s.prompts.length > 0)
    : CRE_PROMPT_LIBRARY.filter((s) => s.category === activeCategory);

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500);
    } catch {
      /* ignore */
    }
  };

  const toggleExpanded = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[2px] p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[var(--canvas)] border border-[var(--rule)] rounded-xl shadow-xl w-full max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--rule)]">
          <div>
            <h2 className="text-sm font-semibold text-[var(--ink)]">CRE prompt library</h2>
            <p className="text-[11px] text-[var(--ink-subtle)] mt-0.5">
              Every prompt a commercial real estate professional needs — in full detail.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--ink-subtle)]" strokeWidth={1.5} />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search prompts…"
                className="rounded-md border border-[var(--rule)] bg-transparent pl-8 pr-3 py-1.5 text-xs text-[var(--ink)] placeholder:text-[var(--ink-subtle)] outline-none focus:border-[var(--ink-muted)] transition w-56"
              />
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-[var(--ink-subtle)] hover:bg-[var(--neu-hover)] hover:text-[var(--ink)] transition"
              title="Close (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 flex min-h-0">
          {/* Category sidebar — hidden when searching */}
          {!q && (
            <div className="w-48 border-r border-[var(--rule)] py-3 px-2 overflow-y-auto shrink-0">
              {CRE_PROMPT_LIBRARY.map((s) => (
                <button
                  key={s.category}
                  onClick={() => setActiveCategory(s.category)}
                  className={`w-full text-left px-3 py-2 rounded-md text-xs transition mb-0.5 ${
                    activeCategory === s.category
                      ? "bg-[var(--neu-active)] text-[var(--ink)] font-medium"
                      : "text-[var(--ink-muted)] hover:bg-[var(--neu-hover)] hover:text-[var(--ink)]"
                  }`}
                >
                  {s.category}
                  <span className="ml-1.5 text-[10px] text-[var(--ink-subtle)]">
                    {s.prompts.length}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Prompt list */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {sections.length === 0 && (
              <div className="text-center py-12 text-xs text-[var(--ink-subtle)]">
                No prompts match &ldquo;{query}&rdquo;.
              </div>
            )}
            {sections.map((s) => (
              <div key={s.category}>
                {q && (
                  <div className="text-[10px] uppercase tracking-wider text-[var(--ink-subtle)] mb-2">
                    {s.category}
                  </div>
                )}
                <div className="space-y-3">
                  {s.prompts.map((pr) => {
                    const key = `${s.category}|${pr.label}`;
                    const isOpen = expanded.has(key);
                    return (
                      <div
                        key={key}
                        className="rounded-lg border border-[var(--rule)] bg-[var(--canvas-subtle)]/40 overflow-hidden"
                      >
                        <div className="px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="text-[13px] font-medium text-[var(--ink)]">{pr.label}</div>
                              <div className="text-[11px] text-[var(--ink-muted)] mt-0.5">{pr.description}</div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => copy(key, pr.prompt)}
                                title="Copy prompt"
                                className="inline-flex items-center gap-1 rounded-md border border-[var(--rule)] px-2 py-1 text-[11px] text-[var(--ink-muted)] hover:bg-[var(--neu-hover)] hover:text-[var(--ink)] transition"
                              >
                                {copiedKey === key ? (
                                  <>
                                    <Check className="w-3 h-3" /> Copied
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" /> Copy
                                  </>
                                )}
                              </button>
                              <button
                                onClick={() => onUse(pr.prompt)}
                                title="Send to chat input"
                                className="inline-flex items-center gap-1 rounded-md bg-[var(--ink)] text-white px-2 py-1 text-[11px] hover:opacity-90 transition"
                              >
                                Use
                              </button>
                            </div>
                          </div>
                          <button
                            onClick={() => toggleExpanded(key)}
                            className="mt-2 inline-flex items-center gap-1 text-[10px] text-[var(--ink-subtle)] hover:text-[var(--ink-muted)] transition"
                          >
                            {isOpen ? (
                              <>
                                <ChevronDown className="w-3 h-3" /> Hide full prompt
                              </>
                            ) : (
                              <>
                                <ChevronRight className="w-3 h-3" /> Show full prompt
                              </>
                            )}
                          </button>
                          {isOpen && (
                            <pre className="mt-2 whitespace-pre-wrap text-[11px] leading-relaxed text-[var(--ink-muted)] bg-[var(--canvas)] rounded-md border border-[var(--rule)] p-3 font-sans">
                              {pr.prompt}
                            </pre>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Toolbar button ──────────────────────────────────────────────

function ToolbarButton({
  icon: Icon,
  label,
  active,
  disabled,
  loading,
  tip,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  active?: boolean;
  disabled?: boolean;
  loading?: boolean;
  tip?: string;
  onClick?: () => void;
}) {
  const palette = active
    ? "text-[var(--ink)] bg-[var(--neu-active)] shadow-[var(--neu-shadow-pressed)]"
    : disabled
      ? "text-[var(--ink-subtle)] opacity-50"
      : "text-[var(--ink-subtle)] hover:bg-[var(--neu-hover)] hover:text-[var(--ink-muted)]";
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      title={tip}
      className={`flex items-center gap-1.5 rounded-lg px-2 h-8 text-sm transition-colors disabled:cursor-not-allowed ${palette}`}
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
      )}
      {label}
    </button>
  );
}

// ── Context chip (landing) ──────────────────────────────────────

function ContextChip({
  contact,
  onClear,
}: {
  contact: Contact;
  onClear: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-900 px-3 py-1 text-xs text-white">
      <Users className="w-3 h-3" strokeWidth={1.5} />
      {contact.name || contact.email || "Unnamed"}
      <button onClick={onClear} className="ml-0.5 hover:opacity-70" title="Clear context">
        <X className="w-3 h-3" strokeWidth={2} />
      </button>
    </span>
  );
}

// ── Contact picker modal ────────────────────────────────────────

function ContactPicker({
  onPick,
  onClose,
}: {
  onPick: (c: Contact) => void;
  onClose: () => void;
}) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/contacts");
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = await res.json();
        if (!cancelled) setContacts(data as Contact[]);
      } catch {
        /* swallow */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? contacts.filter((c) => `${c.name || ""} ${c.email || ""}`.toLowerCase().includes(q))
    : contacts;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-6 pt-24"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md glass-card rounded-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-black/[0.06] px-3 py-2">
          <Search className="w-4 h-4 text-[var(--ink-subtle)]" strokeWidth={1.5} />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search contacts…"
            className="flex-1 bg-transparent text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none"
          />
          <button
            onClick={onClose}
            className="text-[var(--ink-subtle)] hover:text-[var(--ink-muted)]"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {loading ? (
            <div className="px-3 py-6 text-center text-xs text-[var(--ink-subtle)]">
              <Loader2 className="w-4 h-4 animate-spin inline-block mr-1.5" />
              Loading contacts…
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-[var(--ink-subtle)]">
              No matching contacts.
            </div>
          ) : (
            filtered.slice(0, 50).map((c) => (
              <button
                key={c.id}
                onClick={() => onPick(c)}
                className="block w-full text-left px-3 py-2 text-sm text-[var(--ink)] hover:bg-[var(--neu-hover)] border-b border-black/[0.04] last:border-0"
              >
                <div className="font-medium">{c.name || "(unnamed)"}</div>
                {c.email && (
                  <div className="text-[11px] text-[var(--ink-subtle)]">{c.email}</div>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
