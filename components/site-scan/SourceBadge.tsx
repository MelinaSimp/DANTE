interface SourceBadgeProps {
  source: string;
  accessedAt: string;
  confidence?: "public_record" | "listing_unverified" | "user_upload";
}

export default function SourceBadge({
  source,
  accessedAt,
}: SourceBadgeProps) {
  const date = new Date(accessedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] text-[10px] font-mono text-[var(--ink-subtle)] bg-[var(--canvas-subtle)] border border-[var(--rule)]">
      {source} &middot; {date}
    </span>
  );
}
