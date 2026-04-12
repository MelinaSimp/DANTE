import Link from "next/link";
import { ReactNode } from "react";

interface LegalLayoutProps {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}

export default function LegalLayout({ title, lastUpdated, children }: LegalLayoutProps) {
  return (
    <div className="min-h-screen bg-[#242423] text-white">
      <div className="border-b border-white/8">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2 group">
            <img
              src="/brand/logo-circle.png"
              alt="Drift"
              className="w-6 h-6 rounded-full object-cover"
            />
            <span className="text-base font-medium text-white/80 group-hover:text-white transition">
              Drift
            </span>
          </Link>
          <nav className="flex items-center gap-5 text-sm text-white/60">
            <Link href="/terms" className="hover:text-white transition">Terms</Link>
            <Link href="/privacy" className="hover:text-white transition">Privacy</Link>
            <Link href="/security" className="hover:text-white transition">Security</Link>
          </nav>
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-semibold mb-3">{title}</h1>
        <p className="text-white/40 text-sm mb-12">Last updated: {lastUpdated}</p>
        <div className="legal-prose">
          {children}
        </div>
      </div>
      <style>{`
        .legal-prose h2 {
          font-size: 1.25rem;
          font-weight: 600;
          margin-top: 2.5rem;
          margin-bottom: 0.75rem;
          color: rgb(255 255 255);
        }
        .legal-prose h3 {
          font-size: 1rem;
          font-weight: 600;
          margin-top: 1.75rem;
          margin-bottom: 0.5rem;
          color: rgb(255 255 255 / 0.9);
        }
        .legal-prose p {
          color: rgb(255 255 255 / 0.7);
          line-height: 1.7;
          margin-bottom: 1rem;
        }
        .legal-prose ul {
          list-style: disc;
          padding-left: 1.5rem;
          margin-bottom: 1rem;
          color: rgb(255 255 255 / 0.7);
        }
        .legal-prose ul li {
          margin-bottom: 0.5rem;
          line-height: 1.6;
        }
        .legal-prose a {
          color: #7b92ff;
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .legal-prose a:hover {
          color: #9dafff;
        }
        .legal-prose strong {
          color: rgb(255 255 255 / 0.9);
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}
