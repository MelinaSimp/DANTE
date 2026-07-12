import PageHero from '@/components/site/PageHero'
import Link from 'next/link'

const DOC_TYPES = [
  { name: 'Knowledge bases', detail: 'Help centers, runbooks, internal docs, FAQs, and product guides.' },
  { name: 'Contracts', detail: 'MSAs, DPAs, order forms, procurement docs, and renewals.' },
  { name: 'Support records', detail: 'Tickets, transcripts, escalations, and resolution notes.' },
  { name: 'Product docs', detail: 'Specs, release notes, changelogs, and launch plans.' },
  { name: 'Policies', detail: 'Security, privacy, HR, operations, and customer-facing policies.' },
  { name: 'Data exports', detail: 'CSV, JSON, warehouse extracts, and structured system records.' },
  { name: 'Web content', detail: 'Landing pages, docs sites, embedded agent sessions, and public FAQs.' },
  { name: 'Correspondence', detail: 'Emails, meeting notes, customer threads, and partner memos.' },
]

const STATS = [
  { v: '14k', l: 'documents in a typical workspace rollout' },
  { v: '< 60s', l: 'from upload to fully indexed and searchable' },
  { v: '99.4%', l: 'extraction accuracy on structured document tables' },
  { v: '7 yrs', l: 'default retention; workspace policy honored' },
]

export default function Page() {
  return (
    <main className="min-h-screen bg-black">
      <PageHero
        eyebrow="Product · Vault"
        headline={
          <>
            Every document in your workspace, <em className="font-serif italic text-[#E8E2D5]">finally readable.</em>
          </>
        }
        lede="Docs, tickets, transcripts, policies, pages, and data exports — your whole source graph, semantically indexed for grounded agents."
      />

      {/* Scanner visualization + Q&A */}
      <section className="px-6 py-20">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-12 gap-px bg-white/[0.06] border border-white/[0.06] rounded-2xl overflow-hidden">
          {/* Document */}
          <div className="lg:col-span-5 bg-black p-8 relative overflow-hidden">
            <div className="text-[10px] tracking-[0.3em] uppercase text-gray-500 mb-2">
              Indexing
            </div>
            <div className="text-sm font-medium text-white mb-1">
              Enterprise MSA 2026 (Redlines).pdf
            </div>
            <div className="text-xs text-gray-500 mb-8">42 pages · 1.4 MB</div>

            <div className="relative rounded-lg border border-white/[0.08] bg-white/[0.015] p-5 h-[280px] overflow-hidden">
              {/* faux text lines */}
              <div className="space-y-2.5">
                {[
                  'SECTION 4 — DATA PROCESSING',
                  '4.1 Customer may request a security addendum',
                  '    before production deployment.',
                  '4.2 Addenda require written approval by',
                  '    an authorized security reviewer.',
                  'SECTION 5 — SUPPORT',
                  '5.1 Standard response applies during business hours.',
                  '5.2 Enterprise plans may include named escalation',
                  '    contacts and custom response targets.',
                  'SECTION 6 — PUBLIC AGENTS',
                ].map((line, i) => (
                  <div
                    key={i}
                    className="text-[10.5px] text-[#E8E2D5]/55 font-mono tracking-tight whitespace-pre"
                    style={{
                      animation: `vaultLine 3.6s ease-in-out infinite`,
                      animationDelay: `${i * 0.18}s`,
                    }}
                  >
                    {line}
                  </div>
                ))}
              </div>
              {/* scanner beam */}
              <div
                className="absolute left-0 right-0 h-px"
                style={{
                  background: 'linear-gradient(90deg, transparent, #E8E2D5, transparent)',
                  boxShadow: '0 0 12px rgba(232,226,213,0.5)',
                  animation: 'vaultBeam 3.6s ease-in-out infinite',
                }}
              />
            </div>
          </div>

          {/* Q&A */}
          <div className="lg:col-span-7 bg-[#080808] p-8 md:p-10">
            <div className="text-[10px] tracking-[0.3em] uppercase text-gray-500 mb-4">
              Ask the document
            </div>
            <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white mb-6">
              Who can approve a security addendum before launch?
            </div>

            <div className="text-[10px] tracking-[0.3em] uppercase text-gray-500 mb-3">
              Answer
            </div>
            <p className="text-base md:text-lg text-[#E8E2D5] font-light leading-relaxed mb-6">
              An authorized security reviewer must approve the addendum in writing before
              production deployment. The clause appears in Section 4.2 of the Enterprise MSA.
            </p>

            <div className="border border-white/[0.06] bg-white/[0.02] rounded-lg p-4 text-xs">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[#E8E2D5] font-medium">[1]</span>
                <span className="text-gray-400">
                  Enterprise MSA 2026 (Redlines).pdf
                </span>
                <span className="text-gray-600">·</span>
                <span className="text-gray-500">p. 7, Section 4.2</span>
              </div>
              <div className="text-[#E8E2D5]/70 font-light italic leading-relaxed">
                &ldquo;...Addenda require written approval by an authorized security reviewer.&rdquo;
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* What it ingests */}
      <section className="px-6 py-20 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto">
          <div className="text-[10px] tracking-[0.3em] uppercase text-gray-500 mb-4">
            What Vault ingests
          </div>
          <h2 className="text-3xl md:text-4xl font-light text-white tracking-tight mb-12 max-w-2xl">
            Every shape of source material an agent needs to stay grounded.
          </h2>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-white/[0.06] border border-white/[0.06] rounded-2xl overflow-hidden">
            {DOC_TYPES.map((d) => (
              <div key={d.name} className="bg-black p-6">
                <div className="text-sm font-medium text-white mb-2">{d.name}</div>
                <div className="text-xs text-gray-500 leading-relaxed">{d.detail}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="px-6 py-20 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto">
          <div className="text-[10px] tracking-[0.3em] uppercase text-gray-500 mb-10">
            What scale looks like
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-white/[0.06] border border-white/[0.06] rounded-2xl overflow-hidden">
            {STATS.map((s) => (
              <div key={s.l} className="bg-black p-7">
                <div className="text-4xl md:text-5xl font-light text-[#E8E2D5] tracking-tight leading-none mb-3 tabular-nums">
                  {s.v}
                </div>
                <div className="text-xs text-gray-500 leading-relaxed">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 pb-32 pt-16 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-gray-500 mb-3">
              Bring your archive
            </div>
            <h2 className="text-2xl md:text-3xl font-light text-white tracking-tight max-w-md">
              Index your first 1,000 documents and ask questions with citations.
            </h2>
          </div>
          <Link
            href="/auth"
            className="inline-flex items-center gap-2 bg-[#E8E2D5] text-black px-6 py-3 rounded-full text-sm font-semibold whitespace-nowrap hover:bg-white transition"
          >
            Meet Dante
            <span aria-hidden>→</span>
          </Link>
        </div>
      </section>

      <style>{`
        @keyframes vaultBeam {
          0% { top: 0; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        @keyframes vaultLine {
          0%, 100% { color: rgba(232,226,213,0.55); }
          45%, 55% { color: rgba(232,226,213,1); }
        }
      `}</style>
    </main>
  )
}
