interface SourceBadgeProps {
  source: string;
  accessedAt: string;
  confidence?: "public_record" | "listing_unverified" | "user_upload";
}

const BADGE_COLORS = {
  public_record: "bg-emerald-50 text-emerald-700 border-emerald-200",
  listing_unverified: "bg-amber-50 text-amber-700 border-amber-200",
  user_upload: "bg-blue-50 text-blue-700 border-blue-200",
};

export default function SourceBadge({
  source,
  accessedAt,
  confidence = "public_record",
}: SourceBadgeProps) {
  const date = new Date(accessedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${BADGE_COLORS[confidence]}`}
    >
      {source} &middot; {date}
    </span>
  );
}
