"use client";

import { useEffect, useState } from "react";
import ParcelDetail from "@/components/site-scan/ParcelDetail";

interface Props {
  parcelId: string;
}

export default function ParcelDetailClient({ parcelId }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-8">
        <p className="text-sm text-[var(--ink-muted)]">
          Loading parcel intelligence...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          {error}
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="px-6 py-8">
      <ParcelDetail data={data} />
    </div>
  );
}
