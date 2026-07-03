'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import SignOutButton from "@/components/auth/SignOutButton";

interface HeaderClientProps {
  isAuthenticated: boolean;
  greeting: string | null;
  canSeeAdmin: boolean;
  isSuperadmin: boolean;
}

const navLinks = [
  { href: "/dante", label: "Dante AI" },
  { href: "/workflows", label: "Workflows" },
  { href: "/contacts", label: "Contacts" },
  { href: "/settings", label: "Settings" },
];

export default function HeaderClient({
  isAuthenticated,
  greeting,
  canSeeAdmin,
  isSuperadmin,
}: HeaderClientProps) {
  const pathname = usePathname();
  const isHome = pathname === "/home";
  
  // Hide header on agents page for fullscreen GigaAI experience
  if (pathname && pathname.startsWith("/agents")) {
    return null;
  }

  // Hide header on auth page
  if (pathname && pathname.startsWith("/auth")) {
    return null;
  }

  const headerClasses = clsx(
    "w-full sticky top-0 z-50 border-b border-[var(--rule)] bg-[var(--canvas)] transition-colors duration-300"
  );

  const containerClasses =
    "mx-auto flex max-w-6xl items-center justify-between px-4 py-4 text-[var(--ink)]";

  const navWrapperClasses = clsx(
    "hidden md:flex items-center gap-2 rounded-full border border-[var(--rule)] bg-[var(--canvas-muted)] px-3 py-1.5 text-sm font-medium text-[var(--ink)] md:mr-6",
    isHome && "pointer-events-none opacity-0"
  );

  const renderLink = (href: string, label: string) => {
    const active = pathname === href || (pathname && pathname.startsWith(`${href}/`));
    return (
      <Link
        key={href}
        href={href}
        className={clsx(
          "relative rounded-full px-3 py-1 transition-all whitespace-nowrap",
          active
            ? "bg-[var(--accent)] text-white shadow-sm"
            : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
        )}
      >
        {label}
      </Link>
    );
  };

  return (
    <header className={headerClasses}>
      <div className={containerClasses}>
        <div className="flex items-center gap-6">
      <Link
        href={isAuthenticated ? "/home" : "/"}
        aria-label="Go to homepage"
        className="flex shrink-0 items-center justify-center"
      >
            <img
              src="/brand/logo-new.png"
              alt="Dante"
              className="h-8 w-8 object-contain sm:h-9 sm:w-9"
              draggable={false}
            />
          </Link>

          <nav className={clsx(navWrapperClasses, "max-w-full overflow-x-auto md:max-w-[calc(100vw-18rem)]")}>
            <div className="flex items-center gap-2 px-1 pr-3">
              {navLinks.map((link) => renderLink(link.href, link.label))}
              {canSeeAdmin && renderLink("/admin", "Admin")}
              {isSuperadmin && renderLink("/superadmin", "Superadmin")}
            </div>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          {isAuthenticated ? (
            <>
              {!isHome && greeting && (
                <span className="hidden sm:inline text-sm text-[var(--ink-muted)]">Welcome, {greeting}</span>
              )}
              <SignOutButton />
            </>
          ) : (
            <Link
              href="/auth"
              className="btn-primary rounded-full px-4 py-2 text-sm font-medium"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

