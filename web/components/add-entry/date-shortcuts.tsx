"use client";

import { localDateDaysAgo } from "@/lib/date-terms";
import { cn } from "@/lib/cn";

const shortcuts = [
  { days: 0, label: "Today" },
  { days: 1, label: "Yesterday" },
  { days: 2, label: "2 days ago" },
];

/**
 * One-tap dates for the days most entries are about.
 *
 * Most spending is recorded the same evening or a day or two late, and a date
 * picker is the slowest control on a phone for reaching yesterday.
 */
export function DateShortcuts({ value, onPick }: { value: string; onPick: (date: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Quick dates">
      {shortcuts.map(({ days, label }) => {
        const date = localDateDaysAgo(days);
        return (
          <button
            key={days}
            type="button"
            className={cn("choiceChip", value === date && "active")}
            aria-pressed={value === date}
            onClick={() => onPick(date)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
