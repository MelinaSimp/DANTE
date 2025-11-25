export default function Hero() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-14 text-center">
      <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
        Tasks and calls automated for the pros.
      </h1>
      <p className="mt-3 text-sm md:text-base text-black/70">
        Never miss a call again. <span className="font-medium">Drift</span> answers calls and texts,
        captures details, and turns them into notes and tasks automatically.
      </p>

      <div className="mt-6 flex items-center justify-center gap-3">
        <a href="/auth" className="cta cta-black">Try for free</a>
        <a href="/#features" className="cta cta-outline">View features</a>
      </div>
    </section>
  );
}
