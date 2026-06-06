"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import SiteScanSearch from "@/components/site-scan/SiteScanSearch";
import { usePageContext } from "@/components/dante/PageContext";

export default function SiteScanClient() {
  usePageContext({ title: "Site Scan", subtitle: "Parcel search" });

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <div className="sticky top-0 z-10 border-b border-[var(--rule)] bg-[var(--canvas)]/95 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 md:px-10 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm text-[var(--ink-muted)]">
            <Link href="/home" className="hover:text-[var(--ink)] transition">
              Drift
            </Link>
            <span className="text-[var(--ink-subtle)]">/</span>
            <span className="text-[var(--ink)]">Site Scan</span>
          </div>
          <Link
            href="/home"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
            Dashboard
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 md:px-10 py-8 md:py-10">
        <div className="mb-8">
          <div className="label-section mb-1.5">Commercial real estate</div>
          <h1 className="heading-display text-3xl md:text-4xl text-[var(--ink)] leading-[1.1]">
            Site Scan
          </h1>
          <p className="text-sm text-[var(--ink-muted)] mt-1.5 max-w-xl">
            Search parcels by location, zoning, and size. All data from
            county public records.
          </p>
        </div>
        <SiteScanSearch />
      </div>
    </div>
  );
}
