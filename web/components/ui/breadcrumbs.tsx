import type { Route } from "next";
import Link from "next/link";

export type Crumb = {
  label: string;
  /** Omitted on the current page, which is rendered as text rather than a link. */
  href?: Route;
};

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="print:hidden">
      <ol className="flex flex-wrap items-center gap-x-1 text-sm">
        {items.map((item, index) => {
          const isCurrent = index === items.length - 1;
          return (
            <li key={`${item.href ?? ""}-${item.label}`} className="flex items-center gap-1">
              {index > 0 ? (
                <span aria-hidden="true" className="text-on-surface-soft">
                  /
                </span>
              ) : null}
              {item.href && !isCurrent ? (
                <Link
                  href={item.href}
                  className="inline-flex min-h-11 items-center rounded-sm px-1 font-medium text-on-surface-soft hover:text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={isCurrent ? "page" : undefined}
                  className="inline-flex min-h-11 items-center px-1 font-semibold text-on-surface"
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
