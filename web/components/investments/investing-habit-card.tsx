"use client";

import { useId, useState, type FormEvent } from "react";
import { Button, Card, Field, Input, Money } from "@/components/ui";
import { parseAmountMinor } from "@/lib/catch-up";
import { useApiCall } from "@/lib/client-api";
import { describeDuration, scopeWording, type InvestingHabit, type InvestingScope } from "@/lib/investing-habit";
import { ContributionBars } from "./contribution-bars";

type Targets = Partial<Record<InvestingScope, number>>;

/**
 * The part of investing the investor controls: how much, how often, how long.
 *
 * It sits beside the market figures rather than under them, because a
 * portfolio that is down 4% after five months says little, and a run of
 * months with money going in each says a lot.
 */
export function InvestingHabitCard({
  scope,
  habit,
  currency,
  onTargetsChanged,
  holdingDetail = "on average, weighted by what each purchase cost",
}: {
  scope: InvestingScope;
  habit: InvestingHabit;
  currency: string;
  onTargetsChanged: (targets: Targets) => void;
  /** Under the holding period, saying how it was measured. */
  holdingDetail?: string;
}) {
  const apiCall = useApiCall();
  const headingId = useId();
  const wording = scopeWording[scope];
  const [editing, setEditing] = useState(false);
  const [targetText, setTargetText] = useState(habit.target ? (habit.target.targetMinor / 100).toFixed(2) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Savings have no lots, so no holding period; the column is left out
  // rather than shown empty.
  const showHeld = habit.averageHoldingDays !== null;

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
      const saved = await apiCall<{ targets?: Targets }>(`/v1/investments/targets/${scope}`, {
        method: "PUT",
        body: { targetMinor: minor },
      });
      onTargetsChanged(saved?.targets ?? {});
      setEditing(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the target");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="grid gap-5" aria-labelledby={headingId}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={headingId} className="text-lg font-semibold text-on-surface">{wording.title}</h2>
          <p className="mt-1 text-sm text-on-surface-soft">{wording.description}</p>
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

      <div className={showHeld ? "grid gap-4 sm:grid-cols-3" : "grid gap-4 sm:grid-cols-2"}>
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
              ? "with money added every month"
              : "Any amount this month starts a run"}
          </p>
        </div>
        {showHeld ? (
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-on-surface-soft">Held for</p>
            <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-on-surface">
              {describeDuration(habit.averageHoldingDays as number)}
            </p>
            <p className="mt-1 text-sm text-on-surface-soft">{holdingDetail}</p>
          </div>
        ) : null}
      </div>

      <ContributionBars months={habit.months} currency={currency} targetMinor={habit.target?.targetMinor} noun={wording.noun} />
    </Card>
  );
}
