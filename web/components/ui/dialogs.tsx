"use client";

import { useEffect, useId, useRef, type FormEvent, type ReactNode } from "react";
import { Button } from "./button";
import { cardClass } from "./card";

type DialogBaseProps = { open: boolean; title: string; description?: string; onClose: () => void; children: ReactNode };

function DialogBase({ open, title, description, onClose, children }: DialogBaseProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClose={onClose}
      className={cardClass({ padding: "none", className: "card-raised w-[min(92vw,520px)] text-on-surface backdrop:bg-[#071225]/55" })}
    >
      <div className="p-6"><h2 id={titleId} className="text-xl font-semibold">{title}</h2>{description ? <p id={descriptionId} className="mt-2 text-sm text-on-surface-soft">{description}</p> : null}<div className="mt-6">{children}</div></div>
    </dialog>
  );
}

export function ConfirmationDialog({ open, title, description, confirmLabel = "Confirm", destructive = false, onConfirm, onClose }: Omit<DialogBaseProps, "children"> & { confirmLabel?: string; destructive?: boolean; onConfirm: () => void }) {
  return (
    <DialogBase open={open} title={title} description={description} onClose={onClose}>
      <div className="formActions justify-end">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant={destructive ? "danger" : "primary"} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </DialogBase>
  );
}

export function FormDialog({ open, title, description, submitLabel = "Save", pending = false, error, onSubmit, onClose, children }: Omit<DialogBaseProps, "children"> & { submitLabel?: string; pending?: boolean; error?: string; onSubmit: (event: FormEvent<HTMLFormElement>) => void; children: ReactNode }) {
  return (
    <DialogBase open={open} title={title} description={description} onClose={onClose}>
      <form onSubmit={onSubmit}>
        {children}
        {error ? <p role="alert" className="mt-4 text-sm text-negative">{error}</p> : null}
        <div className="formActions mt-6 justify-end">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={pending}>{pending ? "Saving..." : submitLabel}</Button>
        </div>
      </form>
    </DialogBase>
  );
}
