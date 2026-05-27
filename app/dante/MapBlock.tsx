"use client";

// app/dante/MapBlock.tsx
//
// Renders an interactive Google Maps embed inside a glass-pane
// container with a grayscale filter. The model emits ```map fenced
// blocks containing a JSON payload:
//
//   ```map
//   {"address":"38000 Euclid Ave, Willoughby, OH","zoom":15}
//   ```
//
// The iframe uses the keyless embed endpoint — no API key required.
// The grayscale filter + glass styling gives the map a neutral,
// print-like feel that blends with the rest of the Drift design
// language rather than clashing with Google's default colour palette.

import { MapPin } from "lucide-react";

export interface MapBlockData {
  address: string;
  zoom?: number;
  /** Optional label rendered above the map. */
  label?: string;
}

export function parseMapBlock(raw: string): MapBlockData | null {
  try {
    const data = JSON.parse(raw);
    if (typeof data.address !== "string" || !data.address.trim()) return null;
    return {
      address: data.address.trim(),
      zoom: typeof data.zoom === "number" ? data.zoom : 15,
      label: typeof data.label === "string" ? data.label : undefined,
    };
  } catch {
    return null;
  }
}

export default function MapBlock({ data }: { data: MapBlockData }) {
  const q = encodeURIComponent(data.address);
  const z = data.zoom ?? 15;
  const src = `https://www.google.com/maps?q=${q}&z=${z}&output=embed`;

  return (
    <div className="my-2">
      {/* Label */}
      {data.label && (
        <div className="flex items-center gap-1.5 mb-2 text-xs font-medium text-[var(--ink-muted)]">
          <MapPin className="w-3 h-3" strokeWidth={1.5} />
          {data.label}
        </div>
      )}

      {/* Glass pane */}
      <div
        className="relative rounded-lg overflow-hidden border border-[var(--rule)]"
        style={{
          // Glass feel — subtle shadow and inset highlight
          boxShadow:
            "0 1px 3px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.1)",
        }}
      >
        {/* Address chip — floats on top of the map */}
        <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white/90 backdrop-blur-sm border border-black/[0.06] shadow-sm">
          <MapPin className="w-3 h-3 text-[var(--ink-muted)]" strokeWidth={1.5} />
          <span className="text-[11px] font-medium text-[var(--ink)] max-w-[260px] truncate">
            {data.address}
          </span>
        </div>

        {/* Grayscale + desaturated iframe */}
        <div
          className="w-full"
          style={{
            filter: "grayscale(1) contrast(1.05)",
            height: 260,
          }}
        >
          <iframe
            src={src}
            width="100%"
            height="100%"
            style={{ border: 0 }}
            allowFullScreen={false}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            title={`Map — ${data.address}`}
          />
        </div>

        {/* Bottom edge fade — softens the hard iframe edge */}
        <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-[var(--canvas)] to-transparent pointer-events-none" />
      </div>
    </div>
  );
}
