import { Card, CardBody, CardSubtitle, CardTitle } from "@/components/ui/card";

const tiles = [
  {
    title: "Dante AI",
    desc: "Ask anything about your deals, leases, and properties.",
    icon: (
      // MessageSquare
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"/>
      </svg>
    ),
    href: "/dante",
  },
  {
    title: "Deal Pipeline",
    desc: "Track listings, showings, offers, and closings in one view.",
    icon: (
      // Building
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M3 21V3h8v4h10v14H3zm2-2h4v-2H5v2zm0-4h4v-2H5v2zm0-4h4V9H5v2zm0-4h4V5H5v2zm6 12h8v-2h-8v2zm0-4h8v-2h-8v2zm0-4h8V9h-8v2z"/>
      </svg>
    ),
    href: "/properties",
  },
  {
    title: "Lease Abstractor",
    desc: "Extract key terms from commercial lease PDFs with AI.",
    icon: (
      // FileSearch
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm4 18H6V4h7v5h5v11zm-5-5a3 3 0 10-1.8 2.75l2.55 2.55 1.41-1.41-2.55-2.55A3 3 0 0013 15z"/>
      </svg>
    ),
    href: "/lease-abstractor",
  },
  {
    title: "Voice Agent",
    desc: "AI-powered phone agent for inbound calls and lead capture.",
    icon: (
      // Phone
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 011 1V21a1 1 0 01-1 1C10.85 22 2 13.15 2 2a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.46.57 3.58a1 1 0 01-.24 1.01l-2.2 2.2z"/>
      </svg>
    ),
    href: "/agent",
  },
];

export default function FeatureGrid() {
  return (
    <div className="mx-auto max-w-5xl grid grid-cols-1 gap-4 sm:grid-cols-2">
      {tiles.map((t) => (
        <a key={t.title} href={t.href} className="block">
          <Card className="hover:shadow-md transition">
            <CardBody className="flex gap-3">
              <span className="icon-badge">{t.icon}</span>
              <div>
                <CardTitle className="flex items-center gap-2">
                  {t.title}
                  <span className="text-gray-400">›</span>
                </CardTitle>
                <CardSubtitle className="mt-1">{t.desc}</CardSubtitle>
              </div>
            </CardBody>
          </Card>
        </a>
      ))}
    </div>
  );
}
