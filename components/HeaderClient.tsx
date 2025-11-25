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
  { href: "/agents", label: "Agents" },
  { href: "/calls", label: "Calls" },
  { href: "/contacts", label: "Contacts" },
  { href: "/appointments", label: "Appointments" },
  { href: "/schedule", label: "Schedule" },
  { href: "/settings", label: "Settings" },
];

export default function HeaderClient({
  isAuthenticated,
  greeting,
  canSeeAdmin,
  isSuperadmin,
}: HeaderClientProps) {
  let pathname: string | null = null;
  try {
    if (typeof window !== 'undefined') {
      pathname = usePathname();
    }
  } catch (error) {
    console.error('Error getting pathname:', error);
    pathname = null;
  }
  
  const isHome = pathname === "/home";
  
  // Hide header on agents page for fullscreen GigaAI experience
  if (pathname?.startsWith("/agents")) {
    return null;
  }

  const headerClasses = clsx(
    "w-full sticky top-0 z-50 border-b border-white/5 bg-black/40 backdrop-blur-xl transition-colors duration-300"
  );

  const containerClasses =
    "mx-auto flex max-w-6xl items-center justify-between px-4 py-4 text-white";

  const navWrapperClasses = clsx(
    "hidden md:flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-white/65 backdrop-blur md:mr-6",
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
            ? "bg-white/20 text-white shadow-[0_8px_24px_rgba(51,81,255,0.35)]"
            : "text-white/70 hover:text-white"
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
              alt="Drift AI Receptionist"
              className="h-16 w-16 object-contain sm:h-20 sm:w-20"
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
                <span className="hidden sm:inline text-sm text-white/70">Welcome, {greeting}</span>
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

