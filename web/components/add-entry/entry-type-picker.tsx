"use client";

import {
  entryToneClass,
  entryTypeGroups,
  type EntryTypeOption,
} from "./entry-types";

type EntryTypePickerProps = {
  /** The chosen kind, or undefined while the user is still picking. */
  selected?: EntryTypeOption;
  onSelect: (option: EntryTypeOption) => void;
  onClear: () => void;
};

/**
 * Step one of the add-entry flow: what happened, in plain language.
 *
 * Once a kind is chosen this collapses to a one-line summary with a Change
 * control, so the answer stays visible while the tailored fields below are
 * filled in.
 */
export function EntryTypePicker({ selected, onSelect, onClear }: EntryTypePickerProps) {
  if (selected) {
    return (
      <section className="flex items-center gap-3 rounded-xl border border-primary/25 bg-primary-softer p-3 sm:p-4">
        <span
          aria-hidden="true"
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg text-xl font-bold ${entryToneClass[selected.tone]}`}
        >
          {selected.symbol}
        </span>
        <span className="min-w-0 flex-1">
          <strong className="block text-sm text-on-surface">{selected.label}</strong>
          <span className="mt-0.5 block text-xs text-on-surface-soft">{selected.description}</span>
        </span>
        <button
          type="button"
          className="rounded-md border border-outline bg-surface px-3 py-2 text-xs font-bold text-primary transition hover:border-primary"
          onClick={onClear}
        >
          Change
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-outline bg-[linear-gradient(145deg,var(--surface-soft),var(--surface))] p-4 sm:p-5">
      <div className="mb-5 grid gap-1">
        <h2 className="text-xl font-semibold text-on-surface">What happened?</h2>
        <p className="text-sm text-on-surface-soft">
          Pick the closest action. Expenses will tailor the fields that follow.
        </p>
      </div>

      <div className="grid gap-5">
        {entryTypeGroups.map((group) => (
          <div key={group.label} className="grid gap-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.11em] text-on-surface-soft">
              {group.label}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {group.options.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  aria-label={item.label}
                  className="group flex min-h-[76px] items-center gap-3 rounded-lg border border-outline bg-surface p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary hover:shadow-md"
                  onClick={() => onSelect(item)}
                >
                  <span
                    aria-hidden="true"
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg text-xl font-bold ${entryToneClass[item.tone]}`}
                  >
                    {item.symbol}
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="block text-sm text-on-surface">{item.label}</strong>
                    <span className="mt-0.5 block text-xs leading-4 text-on-surface-soft">
                      {item.description}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className="text-lg text-outline-strong transition group-hover:translate-x-0.5 group-hover:text-primary"
                  >
                    ›
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
