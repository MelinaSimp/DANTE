"use client";

interface SkeletonProps {
  className?: string;
  variant?: "text" | "circular" | "rectangular";
  width?: string | number;
  height?: string | number;
  lines?: number;
}

export function Skeleton({ 
  className = "", 
  variant = "rectangular",
  width,
  height,
  lines = 1 
}: SkeletonProps) {
  const baseClasses = "animate-pulse bg-white/10 rounded";
  
  if (variant === "text" && lines > 1) {
    return (
      <div className={className}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={`${baseClasses} mb-2 ${i === lines - 1 ? "w-3/4" : "w-full"}`}
            style={{ height: height || "1rem" }}
          />
        ))}
      </div>
    );
  }

  const style: React.CSSProperties = {};
  if (width) style.width = typeof width === "number" ? `${width}px` : width;
  if (height) style.height = typeof height === "number" ? `${height}px` : height;

  const shapeClasses = {
    circular: "rounded-full",
    rectangular: "rounded",
    text: "rounded",
  };

  return (
    <div
      className={`${baseClasses} ${shapeClasses[variant]} ${className}`}
      style={style}
    />
  );
}

// Pre-built skeleton components
export function ChatListSkeleton() {
  return (
    <div className="space-y-2 p-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 px-3 py-2">
          <Skeleton variant="circular" width={40} height={40} />
          <Skeleton variant="text" width="70%" height={16} />
        </div>
      ))}
    </div>
  );
}

export function MessageSkeleton() {
  return (
    <div className="flex gap-4 justify-start">
      <Skeleton variant="circular" width={32} height={32} />
      <div className="max-w-[80%] space-y-2">
        <Skeleton variant="rectangular" width={200} height={60} className="rounded-2xl" />
      </div>
    </div>
  );
}

export function AgentListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="p-3 border border-white/10 rounded-2xl">
          <Skeleton variant="text" width="60%" height={20} className="mb-2" />
          <Skeleton variant="text" width="40%" height={14} />
        </div>
      ))}
    </div>
  );
}



