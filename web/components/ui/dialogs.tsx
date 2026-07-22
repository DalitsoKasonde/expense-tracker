"use client";

import { useEffect, useId, useRef, type FormEvent, type ReactNode } from "react";

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
    <dialog ref={dialogRef} aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} onCancel={(event) => { event.preventDefault(); onClose(); }} onClose={onClose} className="w-[min(92vw,520px)] rounded-lg border border-outline bg-surface p-0 text-on-surface shadow-md backdrop:bg-[#071225]/55">
      <div className="p-6"><h2 id={titleId} className="text-xl font-semibold">{title}</h2>{description ? <p id={descriptionId} className="mt-2 text-sm text-on-surface-soft">{description}</p> : null}<div className="mt-6">{children}</div></div>
    </dialog>
  );
}

export function ConfirmationDialog({ open, title, description, confirmLabel = "Confirm", destructive = false, onConfirm, onClose }: Omit<DialogBaseProps, "children"> & { confirmLabel?: string; destructive?: boolean; onConfirm: () => void }) {
  return <DialogBase open={open} title={title} description={description} onClose={onClose}><div className="flex justify-end gap-2"><button className="ghostButton" type="button" onClick={onClose}>Cancel</button><button className={destructive ? "dangerButton" : "primaryButton"} type="button" onClick={onConfirm}>{confirmLabel}</button></div></DialogBase>;
}

export function FormDialog({ open, title, description, submitLabel = "Save", pending = false, error, onSubmit, onClose, children }: Omit<DialogBaseProps, "children"> & { submitLabel?: string; pending?: boolean; error?: string; onSubmit: (event: FormEvent<HTMLFormElement>) => void; children: ReactNode }) {
  return <DialogBase open={open} title={title} description={description} onClose={onClose}><form onSubmit={onSubmit}>{children}{error ? <p role="alert" className="mt-4 text-sm text-negative">{error}</p> : null}<div className="mt-6 flex justify-end gap-2"><button className="ghostButton" type="button" onClick={onClose}>Cancel</button><button className="primaryButton" type="submit" disabled={pending}>{pending ? "Saving..." : submitLabel}</button></div></form></DialogBase>;
}
