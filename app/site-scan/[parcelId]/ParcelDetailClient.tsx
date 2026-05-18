"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, AlertCircle } from "lucide-react";
import ParcelDetail from "@/components/site-scan/ParcelDetail";
import { usePageContext } from "@/components/dante/PageContext";

interface Props {
  parcelId: string;
}

export default function ParcelDetailClient({ parcelId }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  usePageContext({ title: "Site Scan", subtitle: "Parcel detail" });

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/site-scan/parcel/${parcelId}`);
        const json = await res.json();
        if (json.error) {
          setError(json.error);
        } else {
          setData(json);
        }
      } catch {
        setError("Failed to load parcel data.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [parcelId]);

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <div className="sticky top-0 z-10 border-b border-[var(--rule)] bg-[var(--canvas)]/95 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 md:px-10 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm text-[var(--ink-muted)]">
            <Link href="/dashboard" className="hover:text-[var(--ink)] transition">
              Drift
            </Link>
            <span className="text-[var(--ink-subtle)]">/</span>
            <Link href="/site-scan" className="hover:text-[var(--ink)] transition">
              Site Scan
            </Link>
            <span className="text-[var(--ink-subtle)]">/</span>
            <span className="text-[var(--ink)]">Parcel</span>
          </div>
          <Link
            href="/site-scan"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
            Back to search
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 md:px-10 py-8 md:py-10">
        {loading ? (
          <div className="flex items-center justify-center py-32">
            <Loader2
              className="w-6 h-6 animate-spin text-[var(--ink-subtle)]"
              strokeWidth={1.5}
            />
          </div>
        ) : error ? (
          <div className="px-3 py-2 text-sm text-[var(--danger)] bg-[var(--danger-soft)] border border-[var(--danger)]/30 rounded-[4px] flex items-center gap-2">
            <AlertCircle className="w-4 h-4" strokeWidth={1.5} /> {error}
          </div>
        ) : data ? (
          <ParcelDetail data={data} />
        ) : null}
      </div>
    </div>
  );
}
