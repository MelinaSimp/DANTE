import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)] flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <div className="heading-display text-6xl text-[var(--accent)] mb-4">404</div>
        <h1 className="heading-display text-3xl text-[var(--ink)] mb-3">Page not found</h1>
        <p className="text-sm text-[var(--ink-muted)] mb-8">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="flex gap-3 justify-center">
          <Link
            href="/home"
            className="px-4 py-2 rounded-[4px] bg-[var(--ink)] hover:bg-[var(--ink)]/90 text-[var(--canvas)] text-sm font-medium transition"
          >
            Go home
          </Link>
          <Link
            href="/"
            className="px-4 py-2 rounded-[4px] border border-[var(--rule)] hover:bg-[var(--canvas-subtle)] text-[var(--ink)] text-sm font-medium transition"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
