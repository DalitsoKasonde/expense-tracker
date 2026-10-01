"use client";

import type { KeyboardEvent } from "react";
import { Button, Field, Input, Select, cardClass } from "@/components/ui";
import type { CategoryRow } from "@/lib/category-tree";
import { categoryGroupForCatchUpKind, localDate, type CatchUpKind, type CatchUpRow } from "@/lib/catch-up";
import { cn } from "@/lib/cn";

export type CatchUpAccountOption = {
  id: string;
  name: string;
  currency: string;
  accountType?: string;
  accountClass?: string;
  isSavingsGroupAccount?: boolean;
};

const kinds: { value: CatchUpKind; label: string }[] = [
  { value: "expense_living", label: "Spent" },
  { value: "income_earned", label: "Received" },
];

type CatchUpRowEditorProps = {
  row: CatchUpRow;
  position: number;
  accounts: CatchUpAccountOption[];
  categories: CategoryRow[];
  disabled: boolean;
  onChange: (patch: Partial<Omit<CatchUpRow, "id" | "error">>) => void;
  onRemove: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
};

export function CatchUpRowEditor({ row, position, accounts, categories, disabled, onChange, onRemove, onKeyDown }: CatchUpRowEditorProps) {
  const group = categoryGroupForCatchUpKind(row.kind);
  const currency = accounts.find((account) => account.id === row.accountId)?.currency ?? "";

  return (
    // A native fieldset rather than <Card>, so `disabled` locks every control
    // in the row at once while a save is in flight.
    <fieldset className={cardClass({ className: "grid min-w-0 gap-3" })} onKeyDown={onKeyDown} disabled={disabled}>
      <legend className="sr-only">Entry {position}</legend>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2" role="group" aria-label={`Entry ${position} direction`}>
          {kinds.map((kind) => (
            <button
              key={kind.value}
              type="button"
              className={cn("choiceChip", row.kind === kind.value && "active")}
              aria-pressed={row.kind === kind.value}
              onClick={() => onChange({ kind: kind.value })}
            >
              {kind.label}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={onRemove} aria-label={`Remove entry ${position}`}>
          Remove
        </Button>
      </div>

      <div className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-[9rem_8rem_minmax(0,1fr)_minmax(0,1fr)_7rem]">
        <Field label="Date">
          {(props) => (
            <Input {...props} type="date" max={localDate()} value={row.transactionDate} onChange={(event) => onChange({ transactionDate: event.target.value })} required />
          )}
        </Field>
        <Field label={currency ? `Amount (${currency})` : "Amount"}>
          {(props) => (
            <Input
              {...props}
              data-catch-up-amount={row.id}
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={row.amount}
              onChange={(event) => onChange({ amount: event.target.value })}
            />
          )}
        </Field>
        <Field label={row.kind === "income_earned" ? "Received into" : "Paid from"}>
          {(props) => (
            <Select {...props} value={row.accountId} onChange={(event) => onChange({ accountId: event.target.value })}>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} · {account.currency}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Category">
          {(props) => (
            <Select {...props} value={row.categoryId} onChange={(event) => onChange({ categoryId: event.target.value })}>
              <option value="">No category</option>
              {categories
                .filter((category) => category.categoryGroup === group)
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {"  ".repeat(category.depth)}
                    {category.name}
                  </option>
                ))}
            </Select>
          )}
        </Field>
        <Field label="Fee">
          {(props) => (
            <Input
              {...props}
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={row.transactionFee}
              onChange={(event) => onChange({ transactionFee: event.target.value })}
            />
          )}
        </Field>
      </div>

      <Field label="Note" error={row.error}>
        {(props) => (
          <Input {...props} autoComplete="off" placeholder="What it was for" value={row.note} onChange={(event) => onChange({ note: event.target.value })} />
        )}
      </Field>
    </fieldset>
  );
}
