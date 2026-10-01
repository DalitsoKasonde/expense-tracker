"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/format-money";
import { cn } from "@/lib/cn";
import type { StockMonth } from "@/lib/stock-insights";

function monthName(month: string, style: "short" | "long") {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString(undefined, style === "long" ? { month: "long", year: "numeric" } : { month: "narrow" });
}

/**
 * New money into stocks, month by month, for the last year.
 *
 * One series, so no legend: the card's title names it. Every month is drawn,
 * an empty one as a baseline stub, so a gap reads as a gap rather than as the
 * chart starting late. Each column is its own hover and focus target and
 * feeds a single readout line, which keeps values off the bars themselves.
 */
export function ContributionBars({ months, currency, targetMinor }: { months: StockMonth[]; currency: string; targetMinor?: number }) {
  const [active, setActive] = useState(months.length - 1);
  const scale = Math.max(targetMinor ?? 0, ...months.map((month) => month.investedMinor), 1);
  const current = months[active];

  return (
    <figure className="grid gap-2">
      <p className="text-sm text-on-surface" aria-live="polite">
        {current ? (
          <>
            <span className="text-on-surface-soft">{monthName(current.month, "long")}:</span>{" "}
            <span className="tabular-nums font-semibold">{formatMoney(current.investedMinor, currency)}</span>
          </>
        ) : null}
      </p>
      <div className="relative h-28" aria-hidden="true">
        {targetMinor ? (
          <div
            className="pointer-events-none absolute inset-x-0 border-t border-on-surface-soft"
            style={{ bottom: `${(targetMinor / scale) * 100}%` }}
          >
            <span className="absolute -top-5 right-0 text-[11px] text-on-surface-soft">Target</span>
          </div>
        ) : null}
        <div className="flex h-full items-end gap-0.5">
          {months.map((month, index) => (
            <div
              key={month.month}
              className="flex h-full flex-1 cursor-default items-end justify-center"
              onPointerEnter={() => setActive(index)}
            >
              {month.investedMinor > 0 ? (
                <span
                  className={cn(
                    "block w-full max-w-6 rounded-t-[4px] transition-colors",
                    index === active ? "bg-primary-strong" : "bg-primary",
                  )}
                  style={{ height: `${Math.max((month.investedMinor / scale) * 100, 2)}%` }}
                />
              ) : (
                <span className="block h-0.5 w-full max-w-6 bg-outline" />
              )}
            </div>
          ))}
        </div>
      </div>
      {/* The focusable row mirrors the bars for keyboard readers, so the
          readout works without a pointer. */}
      <div className="flex gap-0.5">
        {months.map((month, index) => (
          <button
            key={month.month}
            type="button"
            className={cn(
              "flex-1 rounded-sm text-center text-[11px] leading-5 text-on-surface-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
              index === active && "font-bold text-on-surface",
            )}
            aria-label={`${monthName(month.month, "long")}: ${formatMoney(month.investedMinor, currency)}`}
            onFocus={() => setActive(index)}
            onPointerEnter={() => setActive(index)}
            onClick={() => setActive(index)}
          >
            {monthName(month.month, "short")}
          </button>
        ))}
      </div>
      <figcaption className="sr-only">New money put into stocks each month, last 12 months</figcaption>
      <table className="sr-only">
        <thead>
          <tr><th scope="col">Month</th><th scope="col">Invested</th></tr>
        </thead>
        <tbody>
          {months.map((month) => (
            <tr key={month.month}><td>{monthName(month.month, "long")}</td><td>{formatMoney(month.investedMinor, currency)}</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
