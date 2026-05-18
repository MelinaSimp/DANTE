import SourceBadge from "./SourceBadge";
import Link from "next/link";

interface ParcelCardProps {
  parcel: {
    id?: string;
    parcel_number: string;
    address: string;
    zoning: string;
    zoning_desc?: string;
    acreage: number;
    assessed_value?: number;
    land_use?: string;
  };
  source: string;
  accessedAt: string;
  clickable?: boolean;
}

export default function ParcelCard({
  parcel,
  source,
  accessedAt,
  clickable = true,
}: ParcelCardProps) {
  const content = (
    <div className="border border-[var(--rule)] rounded-[4px] p-4 hover:border-[var(--rule-strong)] transition-colors bg-[var(--canvas)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-semibold text-sm text-[var(--ink)] truncate">
            {parcel.address || "No address on record"}
          </p>
          <p className="text-xs text-[var(--ink-subtle)] font-mono mt-0.5">
            {parcel.parcel_number}
          </p>
        </div>
        <SourceBadge source={source} accessedAt={accessedAt} />
      </div>
      <div className="mt-3 pt-3 border-t border-[var(--rule)] grid grid-cols-3 gap-4 text-xs">
        <div>
          <p className="text-[var(--ink-subtle)] mb-0.5">Zoning</p>
          <p className="font-mono font-medium text-[var(--ink)]">{parcel.zoning || "--"}</p>
          {parcel.zoning_desc && (
            <p className="text-[var(--ink-muted)] truncate mt-0.5">
              {parcel.zoning_desc}
            </p>
          )}
        </div>
        <div>
          <p className="text-[var(--ink-subtle)] mb-0.5">Acreage</p>
          <p className="font-mono font-medium text-[var(--ink)]">
            {parcel.acreage.toFixed(2)} ac
          </p>
        </div>
        <div>
          <p className="text-[var(--ink-subtle)] mb-0.5">Assessed Value</p>
          <p className="font-mono font-medium text-[var(--ink)]">
            {parcel.assessed_value
              ? `$${parcel.assessed_value.toLocaleString()}`
              : "--"}
          </p>
        </div>
      </div>
      {parcel.land_use && (
        <p className="mt-2.5 pt-2 border-t border-[var(--rule)] text-xs text-[var(--ink-muted)]">
          {parcel.land_use}
        </p>
      )}
    </div>
  );

  if (clickable && parcel.id) {
    return <Link href={`/site-scan/${parcel.id}`}>{content}</Link>;
  }
  return content;
}
