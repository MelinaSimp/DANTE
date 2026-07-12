import PageHero from '@/components/site/PageHero'

const ROUTES = [
  {
    label: 'Support',
    detail: 'Existing customer? Email the on-call team.',
    addr: 'support@dante.ai',
  },
  {
    label: 'General',
    detail: 'Anything else — partnerships, research, hiring.',
    addr: 'hello@dante.ai',
  },
]

const FIRM_SIZE = ['1–10 people', '11–50 people', '51–200 people', '200+ people']
const USE_CASES = ['Docs / knowledge', 'Support', 'Sales', 'Operations', 'Product', 'Other']

export default function Page() {
  return (
    <main className="min-h-screen bg-black">
      <PageHero
        eyebrow="Company · Contact"
        headline={
          <>
            Talk to <em className="font-serif italic text-[#E8E2D5]">the team.</em>
          </>
        }
        lede="Sales, partnerships, support. Tell us who you are and what you're working on — we read everything."
      />

      <section className="px-6 py-20">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-12 gap-12">
          {/* Sales form */}
          <div className="lg:col-span-7">
            <div className="text-[10px] tracking-[0.3em] uppercase text-gray-500 mb-3">
              Sales &middot; I want access
            </div>
            <h2 className="text-2xl md:text-3xl font-light text-white tracking-tight mb-10 max-w-md">
              We&rsquo;ll respond within one business day.
            </h2>

            <form className="space-y-6">
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="First name" name="first" placeholder="Alex" />
                <Field label="Last name" name="last" placeholder="Morgan" />
              </div>
              <Field label="Work email" name="email" type="email" placeholder="alex@company.com" />
              <Field label="Company" name="firm" placeholder="Acme" />

              <div>
                <Label>Team size</Label>
                <div className="flex flex-wrap gap-2">
                  {FIRM_SIZE.map((s) => (
                    <Chip key={s} name="size" label={s} />
                  ))}
                </div>
              </div>

              <div>
                <Label>Primary use case</Label>
                <div className="flex flex-wrap gap-2">
                  {USE_CASES.map((c) => (
                    <Chip key={c} name="use-case" label={c} />
                  ))}
                </div>
              </div>

              <div>
                <Label>What are you hoping Dante solves?</Label>
                <textarea
                  rows={4}
                  placeholder="Optional — but it helps us prep."
                  className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-white/20 transition-colors resize-none"
                />
              </div>

              <button
                type="submit"
                className="bg-[#E8E2D5] text-black px-7 py-3 rounded-full text-sm font-semibold whitespace-nowrap hover:bg-white transition"
              >
                Request access
              </button>
            </form>
          </div>

          {/* Other routes */}
          <aside className="lg:col-span-5">
            <div className="text-[10px] tracking-[0.3em] uppercase text-gray-500 mb-3">
              Other routes
            </div>
            <ul className="space-y-px bg-white/[0.06] border border-white/[0.06] rounded-2xl overflow-hidden">
              {ROUTES.map((r) => (
                <li key={r.label} className="bg-black">
                  <a
                    href={`mailto:${r.addr}`}
                    className="block p-5 hover:bg-white/[0.02] transition-colors group"
                  >
                    <div className="text-sm font-medium text-white mb-1">{r.label}</div>
                    <div className="text-xs text-gray-500 mb-3 leading-relaxed">{r.detail}</div>
                    <div className="text-sm text-[#E8E2D5] group-hover:underline">
                      {r.addr} <span aria-hidden>→</span>
                    </div>
                  </a>
                </li>
              ))}
            </ul>

            <div className="mt-10 text-xs text-gray-500 leading-relaxed">
              Dante · Drift AI LLC<br />
              548 Market St #57204<br />
              San Francisco, CA 94104
            </div>
          </aside>
        </div>
      </section>
    </main>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] tracking-[0.25em] uppercase text-gray-500 mb-3">
      {children}
    </div>
  )
}

function Field({
  label,
  name,
  placeholder,
  type = 'text',
}: {
  label: string
  name: string
  placeholder?: string
  type?: string
}) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        type={type}
        name={name}
        placeholder={placeholder}
        className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-white/20 transition-colors"
      />
    </div>
  )
}

function Chip({ name, label }: { name: string; label: string }) {
  return (
    <label className="cursor-pointer">
      <input type="radio" name={name} value={label} className="peer sr-only" />
      <span className="block text-xs text-[#E8E2D5]/85 border border-white/[0.1] hover:border-white/30 hover:bg-white/[0.03] peer-checked:bg-[#E8E2D5] peer-checked:text-black peer-checked:border-[#E8E2D5] px-3.5 py-1.5 rounded-full transition-colors">
        {label}
      </span>
    </label>
  )
}
