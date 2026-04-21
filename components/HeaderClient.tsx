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
  { href: "/contacts", label: "Contacts" },
  { href: "/client-details-overview", label: "Clients" },
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
    "w-full sticky top-0 z-50 border-b border-[#e5e7eb] bg-[#ffffff] transition-colors duration-300"
  );

  const containerClasses =
    "mx-auto flex max-w-6xl items-center justify-between px-4 py-4 text-[#151515]";

  const navWrapperClasses = clsx(
    "hidden md:flex items-center gap-2 rounded-full border border-[#e5e7eb] bg-[#f3f4f6] px-3 py-1.5 text-sm font-medium text-[#151515] md:mr-6",
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
            ? "bg-[#3166bf] text-white shadow-sm"
            : "text-[#151515]/70 hover:text-[#151515]"
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
                <span className="hidden sm:inline text-sm text-[#151515]/70">Welcome, {greeting}</span>
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

