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
    <div className="border border-[var(--edge)] rounded-lg p-4 hover:border-[var(--accent)] transition-colors bg-white">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium text-sm text-[var(--ink)] truncate">
            {parcel.address || "No address on record"}
          </p>
          <p className="text-xs text-[var(--ink-muted)] mt-0.5">
            Parcel {parcel.parcel_number}
          </p>
        </div>
        <SourceBadge source={source} accessedAt={accessedAt} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
        <div>
          <p className="text-[var(--ink-muted)]">Zoning</p>
          <p className="font-mono font-medium">{parcel.zoning || "--"}</p>
          {parcel.zoning_desc && (
            <p className="text-[var(--ink-muted)] truncate">
              {parcel.zoning_desc}
            </p>
          )}
        </div>
        <div>
          <p className="text-[var(--ink-muted)]">Acreage</p>
          <p className="font-mono font-medium">
            {parcel.acreage.toFixed(2)} ac
          </p>
        </div>
        <div>
          <p className="text-[var(--ink-muted)]">Assessed Value</p>
          <p className="font-mono font-medium">
            {parcel.assessed_value
              ? `$${parcel.assessed_value.toLocaleString()}`
              : "--"}
          </p>
        </div>
      </div>
      {parcel.land_use && (
        <p className="mt-2 text-xs text-[var(--ink-muted)]">
          Land use: {parcel.land_use}
        </p>
      )}
    </div>
  );

  if (clickable && parcel.id) {
    return <Link href={`/site-scan/${parcel.id}`}>{content}</Link>;
  }
  return content;
}
