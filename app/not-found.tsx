import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#242423] text-white flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <div className="text-[#3351ff] text-6xl font-bold mb-4">404</div>
        <h1 className="text-2xl font-semibold mb-3">Page not found</h1>
        <p className="text-white/60 mb-8">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="flex gap-3 justify-center">
          <Link
            href="/dashboard"
            className="px-4 py-2 rounded-xl bg-[#3351ff] hover:bg-[#4a64ff] text-white text-sm font-medium transition"
          >
            Go to dashboard
          </Link>
          <Link
            href="/"
            className="px-4 py-2 rounded-xl border border-white/15 hover:bg-white/5 text-white text-sm font-medium transition"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
