"use client";

import { useEffect } from "react";

// The "Add entry" trigger lives in places (sidebar, bottom nav) that are
// outside the page whose data it should refresh, so a normal prop callback
// can't reach every listener. A window event lets any page that fetches
// money data reload itself the moment an entry is saved, regardless of
// which "Add entry" button opened the dialog.
const EVENT_NAME = "expense-tracker:entries-changed";

export function notifyEntriesChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(EVENT_NAME));
  }
}

export function useEntriesChanged(onChange: () => void) {
  useEffect(() => {
    window.addEventListener(EVENT_NAME, onChange);
    return () => window.removeEventListener(EVENT_NAME, onChange);
  }, [onChange]);
}
