import Image from "next/image";

type BrandProps = {
  centered?: boolean;
  compact?: boolean;
  priority?: boolean;
};

export function Brand({ centered = false, compact = false, priority = false }: BrandProps) {
  return (
    <div className={[
      compact ? "grid gap-1.5" : "grid gap-2",
      centered ? "justify-items-center text-center" : "justify-items-start",
    ].join(" ")}
    >
      <span className="inline-flex overflow-hidden rounded-md bg-white">
        <Image
          src="/inscribed-logo.png"
          alt="Inscribed"
          width={2174}
          height={964}
          priority={priority}
          sizes={compact ? "136px" : "168px"}
          className={compact ? "h-auto w-[136px]" : "h-auto w-[168px]"}
        />
      </span>
      <span className={compact
        ? "text-sm font-bold uppercase tracking-[0.18em] text-primary"
        : "text-base font-bold uppercase tracking-[0.2em] text-primary"}
      >
        Expenses
      </span>
    </div>
  );
}
