// components/marketing/Footer.tsx
export default function Footer() {
  return (
    <footer className="mt-20 border-t border-white/10 py-10">
      <div className="container flex flex-col items-center justify-between gap-6 md:flex-row">
        <div className="text-sm text-slate-400">
          © {new Date().getFullYear()} Drift. All rights reserved.
        </div>
        <nav className="flex items-center gap-6 text-sm text-slate-300">
          <a className="hover:text-white" href="#">Docs</a>
          <a className="hover:text-white" href="#">Guides</a>
          <a className="hover:text-white" href="#">Terms</a>
          <a className="hover:text-white" href="#">Privacy</a>
        </nav>
      </div>
    </footer>
  );
}
