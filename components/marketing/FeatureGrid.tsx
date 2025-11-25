import { Card, CardBody, CardSubtitle, CardTitle } from "@/components/ui/card";

const tiles = [
  {
    title: "AI Receptionist",
    desc: "Answers calls, captures details, and creates notes/tasks.",
    icon: (
      // Phone
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 011 1V21a1 1 0 01-1 1C10.85 22 2 13.15 2 2a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.46.57 3.58a1 1 0 01-.24 1.01l-2.2 2.2z"/>
      </svg>
    ),
    href: "/calls",
  },
  {
    title: "Personal Assistant",
    desc: "Contacts + AI analysis + Tasks — your simple CRM.",
    icon: (
      // Brain
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M8 2a3 3 0 00-3 3v1a3 3 0 00-2 2.82V11a3 3 0 002 2.82V16a3 3 0 003 3h2V2H8zm8 0h-2v17h2a3 3 0 003-3v-2.18A3 3 0 0021 11V8.82A3 3 0 0019 6V5a3 3 0 00-3-3z"/>
      </svg>
    ),
    href: "/compiled",
  },
  {
    title: "Appointment Setter",
    desc: "Qualify leads and book time without back-and-forth.",
    icon: (
      // Calendar
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M7 2h2v2h6V2h2v2h3a2 2 0 012 2v3H2V6a2 2 0 012-2h3V2zm15 8v10a2 2 0 01-2 2H4a2 2 0 01-2-2V10h20z"/>
      </svg>
    ),
    href: "/schedule",
  },
  {
    title: "Website Designer",
    desc: "Spin up a simple site with call and lead capture.",
    icon: (
      // Layout
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M3 4h18v4H3V4zm0 6h8v10H3V10zm10 0h8v10h-8V10z"/>
      </svg>
    ),
    href: "/",
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
