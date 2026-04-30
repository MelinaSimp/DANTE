// Form ADV Part 2A — section catalog.
//
// Form ADV is the SEC's required RIA brochure. Part 2A has 19
// numbered items with prescribed content. This catalog tells the
// drafting assistant what each section is for and what to draft;
// the LLM returns content that the CCO then edits and finalizes.
//
// Source: SEC Form ADV Part 2A Instructions
// (https://www.sec.gov/about/forms/formadv-part2.pdf).

export interface AdvSection {
  item: string; // "1", "2", ... "19"
  title: string;
  description: string; // What the SEC requires here
  drafting_hint: string; // What to feed the LLM to produce a sensible default
}

export const ADV_SECTIONS: AdvSection[] = [
  {
    item: "1",
    title: "Cover Page",
    description:
      "Firm name, contact info, brochure date, and the SEC-required boilerplate disclosure that the brochure provides information about qualifications and business practices and that the SEC has not approved its content.",
    drafting_hint:
      "Output a cover page with the firm name, address, phone, web URL, and a 'Brochure dated [DATE]' line. Include the standard SEC disclaimer: 'This brochure provides information about the qualifications and business practices of [FIRM]. If you have any questions about the contents of this brochure, please contact us at [PHONE]. The information in this brochure has not been approved or verified by the SEC or by any state securities authority. Additional information about [FIRM] is available on the SEC's website at www.adviserinfo.sec.gov.'",
  },
  {
    item: "2",
    title: "Material Changes",
    description:
      "Summary of material changes since the last annual update of the brochure.",
    drafting_hint:
      "If the firm is filing the brochure for the first time, draft 'This is the firm's initial brochure; no material changes to disclose.' Otherwise leave a placeholder with 'Material changes since [LAST_DATE]:' for the CCO to fill in.",
  },
  {
    item: "3",
    title: "Table of Contents",
    description:
      "Numbered table of contents matching the headings in the brochure.",
    drafting_hint:
      "Draft a numbered table of contents listing items 1 through 19 with their standard titles. The CCO will adjust page numbers post-typesetting.",
  },
  {
    item: "4",
    title: "Advisory Business",
    description:
      "Description of the advisory firm — type of services offered, principal owners, AUM (regulatory and discretionary), and the firm's history.",
    drafting_hint:
      "Describe the firm's services in plain English (financial planning, portfolio management, retirement consulting, etc.), name the principal owners, state regulatory AUM and discretionary AUM as of the most recent fiscal year-end, and give brief firm history. Use the workspace facts to fill in. Mark any unknown values as [TO BE COMPLETED].",
  },
  {
    item: "5",
    title: "Fees and Compensation",
    description:
      "Detailed fee schedule, billing frequency, whether fees are deducted from accounts, other costs the client may incur (custodian fees, transaction costs, etc.), and any compensation the firm receives from third parties.",
    drafting_hint:
      "Draft the firm's fee schedule including AUM tiers, planning fees if applicable, billing frequency (typically quarterly in advance), and whether fees are deducted directly from custodian accounts. Disclose third-party costs (brokerage, custodian, fund expenses) and any 12b-1 / referral compensation. State whether the firm bills in advance or arrears and refund practices for terminated agreements.",
  },
  {
    item: "6",
    title: "Performance-Based Fees and Side-by-Side Management",
    description:
      "Whether the firm or any supervised person accepts performance-based fees, and how performance-based and other accounts are managed.",
    drafting_hint:
      "If the firm does NOT charge performance-based fees, draft a one-paragraph negative response. If it does, describe the structure, the conflicts it creates, and how the firm mitigates them.",
  },
  {
    item: "7",
    title: "Types of Clients",
    description:
      "Types of clients (individuals, high-net-worth individuals, retirement plans, charities, etc.) and any minimum account size requirements.",
    drafting_hint:
      "List client types served (individuals, HNW individuals, trusts, retirement plans, etc.) and state any minimum AUM or fee requirement (e.g. '$500,000 account minimum, waived at firm discretion').",
  },
  {
    item: "8",
    title: "Methods of Analysis, Investment Strategies and Risk of Loss",
    description:
      "Investment methods, strategies, and the material risks involved.",
    drafting_hint:
      "Describe the firm's investment methodology (e.g. 'strategic asset allocation, modified by tactical adjustments based on macroeconomic conditions'), the primary asset classes used, and the principal risks (market risk, interest-rate risk, manager risk, concentration risk, etc.). State that investing involves risk of loss, including loss of principal.",
  },
  {
    item: "9",
    title: "Disciplinary Information",
    description:
      "Material legal or disciplinary events related to the firm or management.",
    drafting_hint:
      "Default to 'No material disciplinary events to report.' if none. CCO must verify against IAPD records before filing.",
  },
  {
    item: "10",
    title: "Other Financial Industry Activities and Affiliations",
    description:
      "Firm or supervised person registrations as broker-dealers, futures commission merchants, etc., and material relationships with other financial entities.",
    drafting_hint:
      "Disclose any broker-dealer / FCM / commodity pool / insurance affiliations. Include parent-company structure if applicable. If none, state 'Neither the firm nor any of its supervised persons is registered as a broker-dealer, futures commission merchant, commodity pool operator, or commodity trading advisor.'",
  },
  {
    item: "11",
    title: "Code of Ethics, Participation in Client Transactions, and Personal Trading",
    description:
      "Description of the firm's Code of Ethics, related-person transactions, and personal trading policies.",
    drafting_hint:
      "State that the firm has adopted a Code of Ethics under Rule 204A-1 covering personal trading, gifts, and confidentiality. Disclose whether the firm or related persons trade in the same securities as clients and any policies controlling such trades. Offer to provide a copy of the Code on request.",
  },
  {
    item: "12",
    title: "Brokerage Practices",
    description:
      "How the firm selects custodians and brokers, soft-dollar practices, brokerage referrals, directed brokerage, and trade aggregation.",
    drafting_hint:
      "Identify the principal custodian(s) (e.g. Schwab, Fidelity, Altruist) and basis for selection (execution quality, custody fees, technology). Disclose any soft-dollar arrangements or brokerage referrals. State whether trades are aggregated and how allocation is handled.",
  },
  {
    item: "13",
    title: "Review of Accounts",
    description:
      "Frequency and triggers for account reviews and the personnel involved.",
    drafting_hint:
      "Describe the firm's review cadence (e.g. 'reviewed at least quarterly by the lead advisor; ad-hoc reviews triggered by client life events, market disruptions, or changes in stated objectives'). Describe what reviews cover (allocation drift, performance vs benchmark, fee accuracy).",
  },
  {
    item: "14",
    title: "Client Referrals and Other Compensation",
    description:
      "Compensation received from third parties for advisory services, and any compensation paid to non-supervised persons for client referrals.",
    drafting_hint:
      "Disclose any economic benefit received from non-clients (e.g. custodian platforms providing technology / research / training). Disclose any solicitor / referral arrangements under Rule 206(4)-1, including fee splits.",
  },
  {
    item: "15",
    title: "Custody",
    description:
      "Whether the firm has custody of client assets and the safeguards in place.",
    drafting_hint:
      "If the firm has constructive custody only via authority to deduct fees, state so and describe the qualified-custodian arrangement. If full custody, describe the surprise audit and other safeguards required by Rule 206(4)-2.",
  },
  {
    item: "16",
    title: "Investment Discretion",
    description:
      "Whether the firm has discretionary authority and any limitations.",
    drafting_hint:
      "State whether the firm operates on a discretionary or non-discretionary basis (or both). Describe any client-imposed restrictions (e.g. socially responsible screens) and how the firm documents them.",
  },
  {
    item: "17",
    title: "Voting Client Securities",
    description:
      "Proxy voting policies and client retention of voting authority.",
    drafting_hint:
      "Default: 'The firm does not vote proxies on behalf of clients. Clients retain the authority to vote proxies for securities held in their accounts.' If the firm does vote, describe its policy and conflict-resolution procedure.",
  },
  {
    item: "18",
    title: "Financial Information",
    description:
      "Audited financial statements, prepayment of fees more than six months in advance, and any condition reasonably likely to impair the firm's ability to meet contractual commitments.",
    drafting_hint:
      "If the firm does not require prepayment >$1,200 six months or more in advance, state 'The firm does not require prepayment of fees more than six months in advance and has no financial conditions that would impair its ability to meet contractual commitments.' Otherwise, attach the most recent audited balance sheet.",
  },
  {
    item: "19",
    title: "Requirements for State-Registered Advisers",
    description:
      "Required only for state-registered (sub-$100M AUM, generally) advisers — additional disclosures including outside business activities, performance-fee arrangements, and disciplinary disclosures of management.",
    drafting_hint:
      "If the firm is SEC-registered (>$100M AUM), state 'Not applicable; the firm is registered with the SEC.' Otherwise, draft per the state's specific requirements; OBA disclosures should pull from compliance_oba_records.",
  },
];

export function getAdvSection(item: string): AdvSection | undefined {
  return ADV_SECTIONS.find((s) => s.item === item);
}
