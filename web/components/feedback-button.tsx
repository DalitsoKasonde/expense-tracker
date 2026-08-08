"use client";

import { usePathname } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { useApiCall } from "@/lib/client-api";
import { FormDialog } from "@/components/ui/dialogs";

type FeedbackButtonProps = {
  className: string;
  children: ReactNode;
  // Lets a caller close its own UI (e.g. an open dropdown menu) the moment
  // this trigger is clicked, before the dialog takes over.
  onTriggerClick?: () => void;
};

/**
 * A beta-testing escape hatch: any signed-in user can send a note straight to
 * the operations console (see /admin) without leaving the page they are on.
 */
export function FeedbackButton({ className, children, onTriggerClick }: FeedbackButtonProps) {
  const apiCall = useApiCall();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  function close() {
    setOpen(false);
    setError("");
    if (!pending) {
      // Give the closing animation a moment before wiping the draft, so a
      // reopen right after an accidental close does not lose what was typed.
      setTimeout(() => setSent(false), 200);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) {
      setError("Enter what you'd like to tell us.");
      return;
    }
    setPending(true);
    setError("");
    try {
      await apiCall("/v1/feedback", {
        method: "POST",
        body: { message: trimmed, pagePath: pathname || undefined },
      });
      setMessage("");
      setSent(true);
      setOpen(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not send feedback");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => {
          onTriggerClick?.();
          setOpen(true);
        }}
      >
        {children}
      </button>
      <FormDialog
        open={open}
        title="Send feedback"
        description="Tell us what's confusing, broken, or missing. This goes straight to the team building this with you."
        submitLabel="Send"
        pending={pending}
        error={error}
        onSubmit={(event) => void submit(event)}
        onClose={close}
      >
        <div className="field">
          <label htmlFor="feedback-message" className="srOnlyLabel">Feedback</label>
          <textarea
            id="feedback-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="What's on your mind?"
            rows={5}
            autoFocus
            maxLength={4000}
            required
          />
        </div>
      </FormDialog>
      {sent ? <p role="status" className="sr-only">Feedback sent. Thank you.</p> : null}
    </>
  );
}
