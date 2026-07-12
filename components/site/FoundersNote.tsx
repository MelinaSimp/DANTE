import Link from 'next/link'

// TODO: needs content from human — confirm:
//   - Founder name + role to feature on the homepage
//   - Founder photo asset path (place under /public, e.g. /founders/luca.jpg)
//   - Two-sentence "why we built Dante" copy (no fabricated stats)
//   - Optional signature image (place under /public, e.g. /founders/luca-sig.svg)
const FOUNDER = {
  name: 'Luca Oravecz',
  role: 'Co-founder & CEO',
  photo: null as string | null, // e.g. '/founders/luca.jpg'
  initials: 'LO',
  // Replace this paragraph with the founder's own two sentences.
  body:
    'We built Dante because people should be able to turn their knowledge into agents, sites, and workflows without accepting hallucinations as the cost of using AI. The platform is simple on the surface and strict underneath: retrieve first, cite everything, and keep humans in control.',
  signature: null as string | null, // e.g. '/founders/luca-sig.svg'
  link: '/about',
}

export default function FoundersNote() {
  return (
    <section className="w-full bg-black px-6 py-28 border-t border-white/5">
      <div className="max-w-5xl mx-auto">
        <div className="text-[10px] tracking-[0.3em] uppercase text-gray-500 mb-10">
          From the team
        </div>

        <div className="grid md:grid-cols-12 gap-10 items-start">
          <div className="md:col-span-4">
            {FOUNDER.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={FOUNDER.photo}
                alt={FOUNDER.name}
                className="w-40 h-40 md:w-44 md:h-44 rounded-2xl object-cover grayscale border border-white/[0.08]"
              />
            ) : (
              <div
                className="w-40 h-40 md:w-44 md:h-44 rounded-2xl border border-white/[0.08] bg-white/[0.03] flex items-center justify-center text-3xl font-light text-[#E8E2D5]/85 tracking-wide"
                aria-label={FOUNDER.name}
              >
                {FOUNDER.initials}
              </div>
            )}
          </div>

          <div className="md:col-span-8">
            <p className="text-xl md:text-2xl text-[#E8E2D5]/90 font-light leading-snug tracking-tight">
              {FOUNDER.body}
            </p>

            <div className="mt-8 flex items-center gap-4">
              {FOUNDER.signature ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={FOUNDER.signature}
                  alt=""
                  aria-hidden
                  className="h-10 opacity-80"
                />
              ) : null}
              <div>
                <div className="text-sm font-medium text-white">{FOUNDER.name}</div>
                <div className="text-xs text-gray-500">{FOUNDER.role}</div>
              </div>
              <Link
                href={FOUNDER.link}
                className="ml-auto text-sm text-[#E8E2D5] hover:text-white transition-colors whitespace-nowrap"
              >
                More on the team <span aria-hidden>→</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
