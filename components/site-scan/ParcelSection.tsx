"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import SourceBadge from "./SourceBadge";

interface ParcelSectionProps {
  title: string;
  source: string;
  accessedAt: string;
  confidence?: "public_record" | "listing_unverified" | "user_upload";
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export default function ParcelSection({
  title,
  source,
  accessedAt,
  confidence = "public_record",
  defaultOpen = true,
  children,
}: ParcelSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-[var(--edge)] rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          {open ? (
            <ChevronDown className="w-4 h-4 text-[var(--ink-muted)]" />
          ) : (
            <ChevronRight className="w-4 h-4 text-[var(--ink-muted)]" />
          )}
          <span className="text-sm font-medium text-[var(--ink)]">
            {title}
          </span>
        </div>
        <SourceBadge
          source={source}
          accessedAt={accessedAt}
          confidence={confidence}
        />
      </button>
      {open && <div className="px-4 py-3">{children}</div>}
    </div>
  );
}
