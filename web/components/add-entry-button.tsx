"use client";

import { useCallback, useState, type ReactNode } from "react";
import { AddEntryDialog, type EntryKind, type SavedEntry } from "@/components/add-entry-dialog";
import { SavedToast } from "@/components/add-entry/saved-toast";
import { useApiCall } from "@/lib/client-api";
import { categoryMonthTotal, savedMessage, type CategorySpendingNode } from "@/lib/saved-feedback";

type AddEntryButtonProps = {
  children: ReactNode;
  className: string;
  /** Opens straight onto this kind, skipping the picker; "Change" still offers the rest. */
  initialEntryKind?: EntryKind;
};

export function AddEntryButton({ children, className, initialEntryKind }: AddEntryButtonProps) {
  const apiCall = useApiCall();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const dismiss = useCallback(() => setMessage(""), []);

  async function confirm(entry: SavedEntry) {
    // Shown at once; the category total follows if it can be had. A slow or
    // failed lookup must never hold back or replace the confirmation itself.
    setMessage(savedMessage(entry, null));
    if (entry.entryKind !== "expense_living" || !entry.categoryId) return;
    try {
      const report = await apiCall<{ categories?: CategorySpendingNode[] }>(
        `/v1/dashboard/categories?year=${entry.transactionDate.slice(0, 4)}&currency=${encodeURIComponent(entry.currency)}`,
      );
      const total = categoryMonthTotal(report?.categories ?? [], entry.categoryId, Number(entry.transactionDate.slice(5, 7)));
      setMessage(savedMessage(entry, total));
    } catch {
      // The plain confirmation stands.
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      <AddEntryDialog
        open={open}
        onClose={() => setOpen(false)}
        onSaved={(entry) => void confirm(entry)}
        initialEntryKind={initialEntryKind}
      />
      <SavedToast message={message} onDismiss={dismiss} />
    </>
  );
}
