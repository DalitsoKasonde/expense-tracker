"use client";

import { useState, type ReactNode } from "react";
import { AddEntryDialog } from "@/components/add-entry-dialog";

type AddEntryButtonProps = {
  children: ReactNode;
  className: string;
};

export function AddEntryButton({ children, className }: AddEntryButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      <AddEntryDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
