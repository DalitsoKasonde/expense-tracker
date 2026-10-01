"use client";

import { cn } from "@/lib/cn";

type CategoryOption = { id: string; name: string };

/**
 * The categories this kind of entry was last filed under, one tap each.
 *
 * Offered, never preselected: see rememberCategoryForEntryKind. Ids that no
 * longer name a selectable category are dropped silently.
 */
export function RecentCategoryChips({
  recentIds,
  categories,
  value,
  onPick,
}: {
  recentIds: string[];
  categories: CategoryOption[];
  value: string;
  onPick: (categoryId: string) => void;
}) {
  const recent = recentIds
    .map((id) => categories.find((category) => category.id === id))
    .filter((category): category is CategoryOption => Boolean(category));
  if (!recent.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Recent categories">
      <span className="text-xs text-on-surface-soft">Recent</span>
      {recent.map((category) => (
        <button
          key={category.id}
          type="button"
          className={cn("choiceChip", value === category.id && "active")}
          aria-pressed={value === category.id}
          onClick={() => onPick(category.id)}
        >
          {category.name}
        </button>
      ))}
    </div>
  );
}
