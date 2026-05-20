"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Menu, X } from "lucide-react";

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
}

interface MobileNavProps {
  items: NavItem[];
  backHref?: string;
  backLabel?: string;
}

export default function MobileNav({ items, backHref = "/select", backLabel = "Back" }: MobileNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden bg-white border-b border-gray-200">
      <div className="flex items-center justify-between px-4 py-3">
        <Link href={backHref} className="flex items-center gap-2 text-gray-500 hover:text-gray-800 transition">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-medium">{backLabel}</span>
        </Link>
        <Link href="/frontend" className="flex items-center gap-2">
          <img src="/brand/logo-circle.png" alt="Drift" className="w-6 h-6 rounded-full object-cover" />
          <span className="text-sm font-semibold text-gray-900">Drift</span>
        </Link>
        <button onClick={() => setOpen(!open)} className="text-gray-500 hover:text-gray-800 transition">
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>
      {open && (
        <nav className="px-3 pb-3 space-y-1">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                  item.active ? "bg-gray-100 text-black" : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
