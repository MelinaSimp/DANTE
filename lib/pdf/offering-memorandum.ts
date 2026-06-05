// lib/pdf/offering-memorandum.ts
//
// Renders a branded Offering Memorandum PDF from structured property
// data. Uses the same @react-pdf/renderer infrastructure as the
// generic report renderer but with an OM-specific multi-page layout:
//
//   Page 1: Cover — property photo placeholder, address, deal type
//   Page 2: Executive Summary — key metrics grid + narrative
//   Page 3: Property Overview — physical details, improvements, zoning
//   Page 4: Financial Analysis — income, expenses, NOI, cap rate
//   Page 5: Location Overview — market context, demographics
//   Page 6: Terms & Disclaimers
//
// Callers pass an OMInput object; the renderer fills what's provided
// and gracefully omits sections with no data.

import { loadBrandingContext, type BrandingContext } from "./render";

export interface OMFinancials {
  asking_price?: number;
  noi?: number;
  cap_rate?: number;
  price_per_sf?: number;
  gross_income?: number;
  vacancy_rate?: number;
  operating_expenses?: number;
  debt_service?: number;
  cash_on_cash?: number;
  grm?: number;
  dscr?: number;
}

export interface OMProperty {
  address: string;
  city?: string;
  state?: string;
  zip?: string;
  property_type?: string;   // Retail, Office, Industrial, Multifamily, etc.
  building_sf?: number;
  lot_sf?: number;
  year_built?: number;
  stories?: number;
  units?: number;
  parking_spaces?: number;
  zoning?: string;
  occupancy_pct?: number;
  anchor_tenants?: string[];
  improvements?: string;
}

export interface OMLocation {
  market_overview?: string;
  population?: number;
  median_income?: number;
  traffic_count?: string;
  nearby_anchors?: string[];
  demographics_note?: string;
}

export interface OMInput {
  workspaceId: string;
  deal_type?: string;         // "Sale", "Sale-Leaseback", "Ground Lease", etc.
  executive_summary?: string;
  property: OMProperty;
  financials?: OMFinancials;
  location?: OMLocation;
  additional_notes?: string;
  disclaimers?: string;
}

function fmt$(n: number | undefined): string {
  if (n === undefined || n === null) return "--";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function fmtPct(n: number | undefined): string {
  if (n === undefined || n === null) return "--";
  return `${n.toFixed(1)}%`;
}

function fmtNum(n: number | undefined, suffix = ""): string {
  if (n === undefined || n === null) return "--";
  return `${n.toLocaleString()}${suffix}`;
}

const DEFAULT_DISCLAIMER = [
  "This Offering Memorandum has been prepared for informational purposes only.",
  "It does not constitute an offer to sell or a solicitation of an offer to buy",
  "any security or property. The information contained herein has been obtained",
  "from sources believed to be reliable but has not been independently verified.",
  "No representation or warranty, express or implied, is made as to the accuracy",
  "or completeness of the information contained herein. Prospective purchasers",
  "should conduct their own due diligence investigation.",
].join(" ");

export async function renderOfferingMemorandum(input: OMInput): Promise<Buffer> {
  const branding = await loadBrandingContext(input.workspaceId);

  let reactPdf: any;
  try {
    reactPdf = await import("@react-pdf/renderer" as never);
  } catch {
    throw new Error(
      "PDF rendering not available -- @react-pdf/renderer is not installed.",
    );
  }
  const { Document, Page, Text, View, StyleSheet, Image } = reactPdf;
  const React = (await import("react")).default;

  const accent = branding.brandColorHex ?? "#1a3a5c";
  const lightAccent = accent + "15"; // 15 = ~8% opacity hex

  const s = StyleSheet.create({
    // Global
    page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#151515" },
    footer: {
      position: "absolute", bottom: 20, left: 40, right: 40,
      fontSize: 7, color: "#9b9b9b",
      borderTopWidth: 0.5, borderTopColor: "#e0e0e0", paddingTop: 4,
      flexDirection: "row", justifyContent: "space-between",
    },
    logo: { width: 80, height: 24, marginBottom: 8, objectFit: "contain" as any },

    // Cover
    coverPage: { padding: 40, justifyContent: "center", alignItems: "center" },
    coverType: { fontSize: 11, color: accent, letterSpacing: 2, marginBottom: 8, textTransform: "uppercase" as any },
    coverAddress: { fontSize: 24, fontWeight: 700, textAlign: "center" as any, marginBottom: 6 },
    coverCity: { fontSize: 14, color: "#6b6b6b", textAlign: "center" as any, marginBottom: 24 },
    coverDeal: { fontSize: 12, color: accent, fontWeight: 600 },
    coverLine: { width: 60, height: 2, backgroundColor: accent, marginVertical: 16 },

    // Section headers
    sectionTitle: { fontSize: 14, fontWeight: 700, color: accent, marginBottom: 10, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: accent },
    sectionBody: { fontSize: 10, lineHeight: 1.6, marginBottom: 8 },

    // Metric grid
    metricRow: { flexDirection: "row" as any, marginBottom: 4 },
    metricLabel: { width: 160, fontSize: 9, color: "#6b6b6b" },
    metricValue: { fontSize: 10, fontWeight: 600 },

    // Key metrics highlight
    highlightRow: { flexDirection: "row" as any, marginBottom: 12, gap: 8 },
    highlightBox: {
      flex: 1, padding: 10, borderRadius: 4,
      borderWidth: 0.5, borderColor: accent,
      alignItems: "center" as any,
    },
    highlightLabel: { fontSize: 8, color: "#6b6b6b", marginBottom: 2, textTransform: "uppercase" as any },
    highlightValue: { fontSize: 14, fontWeight: 700, color: accent },

    // Sub-heading
    subHeading: { fontSize: 11, fontWeight: 600, marginTop: 12, marginBottom: 4 },

    // Disclaimer
    disclaimer: { fontSize: 7, color: "#9b9b9b", lineHeight: 1.5, marginTop: 20 },
  });

  // Helper to build a page with footer
  const makePage = (children: React.ReactNode[], pageStyle?: any) =>
    React.createElement(
      Page,
      { size: "LETTER", style: pageStyle || s.page },
      [
        ...children,
        React.createElement(
          View,
          { key: "footer", style: s.footer, fixed: true },
          [
            React.createElement(Text, { key: "l" }, branding.pdfHeaderText || branding.workspaceName),
            React.createElement(Text, { key: "r" }, `Confidential -- ${new Date().toLocaleDateString()}`),
          ],
        ),
      ],
    );

  const pages: React.ReactNode[] = [];
  const p = input.property;
  const f = input.financials;
  const loc = input.location;

  // ── Page 1: Cover ──────────────────────────────────────────
  const coverChildren: React.ReactNode[] = [];
  if (branding.logoUrl) {
    coverChildren.push(
      React.createElement(Image, { key: "logo", style: { ...s.logo, width: 120, height: 36, marginBottom: 24 }, src: branding.logoUrl }),
    );
  }
  coverChildren.push(
    React.createElement(Text, { key: "type", style: s.coverType }, "Offering Memorandum"),
    React.createElement(View, { key: "line1", style: s.coverLine }),
    React.createElement(Text, { key: "addr", style: s.coverAddress }, p.address),
  );
  const cityLine = [p.city, p.state, p.zip].filter(Boolean).join(", ");
  if (cityLine) {
    coverChildren.push(React.createElement(Text, { key: "city", style: s.coverCity }, cityLine));
  }
  if (input.deal_type) {
    coverChildren.push(
      React.createElement(View, { key: "line2", style: s.coverLine }),
      React.createElement(Text, { key: "deal", style: s.coverDeal }, input.deal_type),
    );
  }
  if (p.property_type) {
    coverChildren.push(
      React.createElement(Text, { key: "ptype", style: { fontSize: 11, color: "#6b6b6b", marginTop: 8 } }, p.property_type),
    );
  }
  pages.push(makePage(coverChildren, { ...s.page, justifyContent: "center", alignItems: "center" }));

  // ── Page 2: Executive Summary + Key Metrics ────────────────
  const execChildren: React.ReactNode[] = [
    React.createElement(Text, { key: "h", style: s.sectionTitle }, "Executive Summary"),
  ];

  // Key metrics highlight boxes
  const highlights: { label: string; value: string }[] = [];
  if (f?.asking_price) highlights.push({ label: "Asking Price", value: fmt$(f.asking_price) });
  if (f?.noi) highlights.push({ label: "NOI", value: fmt$(f.noi) });
  if (f?.cap_rate) highlights.push({ label: "Cap Rate", value: fmtPct(f.cap_rate) });
  if (p.building_sf) highlights.push({ label: "Building SF", value: fmtNum(p.building_sf, " SF") });

  if (highlights.length > 0) {
    execChildren.push(
      React.createElement(
        View,
        { key: "highlights", style: s.highlightRow },
        highlights.slice(0, 4).map((h, i) =>
          React.createElement(View, { key: i, style: s.highlightBox }, [
            React.createElement(Text, { key: "l", style: s.highlightLabel }, h.label),
            React.createElement(Text, { key: "v", style: s.highlightValue }, h.value),
          ]),
        ),
      ),
    );
  }

  if (input.executive_summary) {
    execChildren.push(
      React.createElement(Text, { key: "body", style: s.sectionBody }, input.executive_summary),
    );
  }
  pages.push(makePage(execChildren));

  // ── Page 3: Property Overview ──────────────────────────────
  const propChildren: React.ReactNode[] = [
    React.createElement(Text, { key: "h", style: s.sectionTitle }, "Property Overview"),
  ];

  const propMetrics: [string, string][] = [];
  if (p.property_type) propMetrics.push(["Property Type", p.property_type]);
  if (p.building_sf) propMetrics.push(["Building Size", fmtNum(p.building_sf, " SF")]);
  if (p.lot_sf) propMetrics.push(["Lot Size", fmtNum(p.lot_sf, " SF")]);
  if (p.year_built) propMetrics.push(["Year Built", String(p.year_built)]);
  if (p.stories) propMetrics.push(["Stories", String(p.stories)]);
  if (p.units) propMetrics.push(["Units", String(p.units)]);
  if (p.parking_spaces) propMetrics.push(["Parking", fmtNum(p.parking_spaces, " spaces")]);
  if (p.zoning) propMetrics.push(["Zoning", p.zoning]);
  if (p.occupancy_pct !== undefined) propMetrics.push(["Occupancy", fmtPct(p.occupancy_pct)]);

  for (const [label, value] of propMetrics) {
    propChildren.push(
      React.createElement(View, { key: label, style: s.metricRow }, [
        React.createElement(Text, { key: "l", style: s.metricLabel }, label),
        React.createElement(Text, { key: "v", style: s.metricValue }, value),
      ]),
    );
  }

  if (p.anchor_tenants?.length) {
    propChildren.push(
      React.createElement(Text, { key: "tenants-h", style: s.subHeading }, "Anchor Tenants"),
      React.createElement(Text, { key: "tenants-b", style: s.sectionBody }, p.anchor_tenants.join(", ")),
    );
  }

  if (p.improvements) {
    propChildren.push(
      React.createElement(Text, { key: "impr-h", style: s.subHeading }, "Recent Improvements"),
      React.createElement(Text, { key: "impr-b", style: s.sectionBody }, p.improvements),
    );
  }
  pages.push(makePage(propChildren));

  // ── Page 4: Financial Analysis ─────────────────────────────
  if (f && Object.keys(f).length > 0) {
    const finChildren: React.ReactNode[] = [
      React.createElement(Text, { key: "h", style: s.sectionTitle }, "Financial Analysis"),
    ];

    const finMetrics: [string, string][] = [];
    if (f.asking_price) finMetrics.push(["Asking Price", fmt$(f.asking_price)]);
    if (f.price_per_sf) finMetrics.push(["Price / SF", fmt$(f.price_per_sf)]);
    if (f.gross_income) finMetrics.push(["Gross Income", fmt$(f.gross_income)]);
    if (f.vacancy_rate !== undefined) finMetrics.push(["Vacancy Rate", fmtPct(f.vacancy_rate)]);
    if (f.operating_expenses) finMetrics.push(["Operating Expenses", fmt$(f.operating_expenses)]);
    if (f.noi) finMetrics.push(["Net Operating Income", fmt$(f.noi)]);
    if (f.cap_rate) finMetrics.push(["Cap Rate", fmtPct(f.cap_rate)]);
    if (f.debt_service) finMetrics.push(["Annual Debt Service", fmt$(f.debt_service)]);
    if (f.cash_on_cash) finMetrics.push(["Cash-on-Cash Return", fmtPct(f.cash_on_cash)]);
    if (f.dscr) finMetrics.push(["DSCR", f.dscr.toFixed(2) + "x"]);
    if (f.grm) finMetrics.push(["GRM", f.grm.toFixed(1) + "x"]);

    for (const [label, value] of finMetrics) {
      finChildren.push(
        React.createElement(View, { key: label, style: s.metricRow }, [
          React.createElement(Text, { key: "l", style: s.metricLabel }, label),
          React.createElement(Text, { key: "v", style: s.metricValue }, value),
        ]),
      );
    }
    pages.push(makePage(finChildren));
  }

  // ── Page 5: Location Overview ──────────────────────────────
  if (loc && Object.keys(loc).length > 0) {
    const locChildren: React.ReactNode[] = [
      React.createElement(Text, { key: "h", style: s.sectionTitle }, "Location Overview"),
    ];

    if (loc.market_overview) {
      locChildren.push(
        React.createElement(Text, { key: "mkt", style: s.sectionBody }, loc.market_overview),
      );
    }

    const locMetrics: [string, string][] = [];
    if (loc.population) locMetrics.push(["Population (3-mi)", fmtNum(loc.population)]);
    if (loc.median_income) locMetrics.push(["Median HH Income", fmt$(loc.median_income)]);
    if (loc.traffic_count) locMetrics.push(["Traffic Count", loc.traffic_count]);

    for (const [label, value] of locMetrics) {
      locChildren.push(
        React.createElement(View, { key: label, style: s.metricRow }, [
          React.createElement(Text, { key: "l", style: s.metricLabel }, label),
          React.createElement(Text, { key: "v", style: s.metricValue }, value),
        ]),
      );
    }

    if (loc.nearby_anchors?.length) {
      locChildren.push(
        React.createElement(Text, { key: "anchors-h", style: s.subHeading }, "Nearby Anchors"),
        React.createElement(Text, { key: "anchors-b", style: s.sectionBody }, loc.nearby_anchors.join(", ")),
      );
    }

    if (loc.demographics_note) {
      locChildren.push(
        React.createElement(Text, { key: "demo-h", style: s.subHeading }, "Demographics"),
        React.createElement(Text, { key: "demo-b", style: s.sectionBody }, loc.demographics_note),
      );
    }
    pages.push(makePage(locChildren));
  }

  // ── Page 6: Additional Notes + Disclaimers ─────────────────
  const closingChildren: React.ReactNode[] = [];
  if (input.additional_notes) {
    closingChildren.push(
      React.createElement(Text, { key: "notes-h", style: s.sectionTitle }, "Additional Information"),
      React.createElement(Text, { key: "notes-b", style: s.sectionBody }, input.additional_notes),
    );
  }
  closingChildren.push(
    React.createElement(Text, { key: "disc-h", style: { ...s.sectionTitle, marginTop: input.additional_notes ? 20 : 0 } }, "Disclaimers"),
    React.createElement(Text, { key: "disc-b", style: s.disclaimer }, input.disclaimers || DEFAULT_DISCLAIMER),
  );
  pages.push(makePage(closingChildren));

  const docElement = React.createElement(Document, {}, ...pages);
  const buf = await reactPdf.renderToBuffer(docElement as never);
  return Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
}
