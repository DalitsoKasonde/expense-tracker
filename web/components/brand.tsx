import Image from "next/image";

type BrandProps = {
  compact?: boolean;
  priority?: boolean;
};

export function Brand({ compact = false, priority = false }: BrandProps) {
  return (
    <div className={compact ? "grid gap-1.5" : "grid justify-items-start gap-2"}>
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
