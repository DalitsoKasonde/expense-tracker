type BrandProps = {
  centered?: boolean;
  compact?: boolean;
  priority?: boolean;
};

/**
 * The wordmark is drawn as a CSS mask (see the BRAND block in globals.css),
 * so the artwork supplies the silhouette and a token supplies the colour.
 * `/inscribed-logo.png` remains the Open Graph image; this is the UI asset.
 */
const WORDMARK_SRC = "/inscribed-wordmark.png";

/** Intrinsic size of the mask asset, used to derive height from width. */
const WORDMARK_RATIO = 1024 / 360;

export function Brand({ centered = false, compact = false, priority = false }: BrandProps) {
  const width = compact ? 136 : 168;

  return (
    <div className={[
      compact ? "grid gap-1.5" : "grid gap-2",
      centered ? "justify-items-center text-center" : "justify-items-start",
    ].join(" ")}
    >
      {/* Hoisted to <head> by React. The wordmark is above the fold on the
          login, onboarding and sidebar surfaces that pass `priority`. */}
      {priority ? <link rel="preload" as="image" href={WORDMARK_SRC} /> : null}
      <span
        role="img"
        aria-label="Inscribed"
        className="wordmark"
        style={{ width, height: Math.round(width / WORDMARK_RATIO) }}
      />
      <span className={compact
        ? "text-sm font-bold uppercase tracking-[0.18em] text-primary"
        : "text-base font-bold uppercase tracking-[0.2em] text-primary"}
      >
        Expenses
      </span>
    </div>
  );
}
