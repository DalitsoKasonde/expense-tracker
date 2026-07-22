export function LoadingSkeleton({ className = "h-24" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-surface-soft motion-reduce:animate-none ${className}`}
      role="status"
      aria-label="Loading"
      suppressHydrationWarning
    >
      <span className="sr-only">Loading</span>
    </div>
  );
}
