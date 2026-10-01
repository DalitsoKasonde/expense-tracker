"use client";

import { useEffect } from "react";
import { cardClass } from "@/components/ui";

/** How long the confirmation stays before getting out of the way. */
const VISIBLE_MS = 6000;

/**
 * A brief confirmation after an entry is saved.
 *
 * Sits above the mobile bottom navigation and the iOS safe area, and never
 * takes focus: it confirms, it does not ask for anything.
 */
export function SavedToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(onDismiss, VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [message, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-3 bottom-[calc(6.5rem+env(safe-area-inset-bottom,0px))] z-50 flex justify-center lg:bottom-6"
    >
      {message ? (
        <div className={cardClass({ className: "pointer-events-auto flex max-w-md items-center gap-3 py-3 text-sm text-on-surface shadow-md" })}>
          <span className="min-w-0">{message}</span>
          <button type="button" className="btn btn-ghost btn-sm shrink-0" onClick={onDismiss} aria-label="Dismiss">
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}
