"use client";

import { useState, type FormEvent } from "react";
import { Button, Card, Field, Input, Money } from "@/components/ui";
import { parseAmountMinor } from "@/lib/catch-up";
import { useApiCall } from "@/lib/client-api";
import { describeDuration, type InvestingHabit } from "@/lib/stock-insights";
import { ContributionBars } from "./contribution-bars";

type Preferences = Record<string, unknown> & { monthlyInvestingTargetMinor?: number | null };

/**
 * The part of investing the investor controls: how much, how often, how long.
 *
 * It sits beside the market figures rather than under them, because a
 * portfolio that is down 4% after five months says little, and a run of
 * months with a purchase in each says a lot.
 */
export function InvestingHabitCard({
  habit,
  currency,
  onTargetChanged,
}: {
  habit: InvestingHabit;
  currency: string;
  onTargetChanged: (targetMinor: number | null) => void;
}) {
  const apiCall = useApiCall();
  const [editing, setEditing] = useState(false);
  const [targetText, setTargetText] = useState(habit.target ? (habit.target.targetMinor / 100).toFixed(2) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function saveTarget(event: FormEvent) {
    event.preventDefault();
    const minor = targetText.trim() ? parseAmountMinor(targetText) : 0;
    if (minor === null) {
      setError("Enter the target as a number, like 500.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      // The preferences PATCH writes every field, so it is sent the stored
      // settings with only the target changed.
      const current = await apiCall<Preferences>("/v1/user/preferences");
      const saved = await apiCall<Preferences>("/v1/user/preferences", {
        method: "PATCH",
        body: { ...(current as Record<string, never>), monthlyInvestingTargetMinor: minor },
      });
      onTargetChanged(saved?.monthlyInvestingTargetMinor ?? null);
      setEditing(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the target");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="grid gap-5" aria-labelledby="investing-habit-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="investing-habit-heading" className="text-lg font-semibold text-on-surface">Your investing habit</h2>
          <p className="mt-1 text-sm text-on-surface-soft">New money you put into stocks. Reinvested dividends are return, so they are not counted here.</p>
        </div>
        {!editing ? (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            {habit.target ? "Change target" : "Set a monthly target"}
          </Button>
        ) : null}
      </div>

      {editing ? (
        <form className="grid gap-3 sm:grid-cols-[minmax(0,16rem)_auto] sm:items-end" onSubmit={(event) => void saveTarget(event)}>
          <Field label={`Monthly target (${currency})`} hint="Leave empty to remove the target." error={error || undefined}>
            {(props) => <Input {...props} inputMode="decimal" autoComplete="off" placeholder="500.00" value={targetText} onChange={(event) => setTargetText(event.target.value)} />}
          </Field>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save target"}</Button>
          </div>
        </form>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-on-surface-soft">This month</p>
          <p className="mt-2 font-display text-2xl font-semibold"><Money amountMinor={habit.thisMonthMinor} currency={currency} /></p>
          <p className="mt-1 text-sm text-on-surface-soft">
            {habit.target
              ? habit.target.reached
                ? "Target reached"
                : <><Money amountMinor={habit.target.remainingMinor} currency={currency} /> to go of <Money amountMinor={habit.target.targetMinor} currency={currency} /></>
              : habit.thisMonthMinor > 0
                ? "Added this month"
                : "Nothing added yet this month"}
          </p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-on-surface-soft">Months in a row</p>
          <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-on-surface">{habit.monthsInARow}</p>
          <p className="mt-1 text-sm text-on-surface-soft">
            {habit.monthsInARow > 0
              ? "with a purchase every month"
              : "Any amount this month starts a run"}
          </p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-on-surface-soft">Held for</p>
          <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-on-surface">
            {habit.averageHoldingDays === null ? "—" : describeDuration(habit.averageHoldingDays)}
          </p>
          <p className="mt-1 text-sm text-on-surface-soft">on average, weighted by what each purchase cost</p>
        </div>
      </div>

      <ContributionBars months={habit.months} currency={currency} targetMinor={habit.target?.targetMinor} />
    </Card>
  );
}
