// app/features/page.tsx
// Public landing page for Dante — all-in-one agentic platform.
// Unauthenticated "/" redirects here; this is also the site entry
// point to access Dante via /auth.

import { Metadata } from "next";
import DanteLanding from "@/components/landing/DanteLanding";

export const metadata: Metadata = {
  title: "Dante — All-in-one agentic platform",
  description:
    "Build agents, sites, and workflows on an almost hallucination-free LLM. Citation-grounded answers for anyone — not just one industry.",
  openGraph: {
    title: "Dante — All-in-one agentic platform",
    description:
      "Agents, sites, and workflows on an almost hallucination-free LLM. Grounded in your data, cited every time.",
    url: "https://driftai.studio/features",
  },
  twitter: {
    card: "summary_large_image",
    title: "Dante — All-in-one agentic platform",
    description:
      "Agents, sites, and workflows on an almost hallucination-free LLM.",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Dante",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web, macOS, Windows",
  description:
    "All-in-one agentic platform. Build agents, sites, and workflows on an almost hallucination-free LLM — citation-grounded answers for anyone.",
  url: "https://driftai.studio",
  offers: [
    {
      "@type": "Offer",
      name: "Starter",
      price: "300",
      priceCurrency: "USD",
      description: "Agents, sites, vault, workflows — for individuals and small teams.",
    },
    {
      "@type": "Offer",
      name: "Pro",
      price: "800",
      priceCurrency: "USD",
      description: "Advanced workflows, voice agents, autonomous agents — up to 5 seats.",
    },
    {
      "@type": "Offer",
      name: "Enterprise",
      price: "1500",
      priceCurrency: "USD",
      description: "SSO, BYOK, compliance export, dedicated CSM, unlimited seats.",
    },
  ],
  featureList: [
    "Build AI agents by chatting — no code",
    "Publish agents to sites and embeddable widgets",
    "Natural-language workflow engine",
    "Almost hallucination-free, citation-grounded answers",
    "Voice agents for inbound and outbound calls",
    "Memory that grows with every conversation",
  ],
};

export default function FeaturesPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <DanteLanding />
    </>
  );
}
