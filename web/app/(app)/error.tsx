"use client";

import { useEffect } from "react";

/**
 * Route-level error boundary for the authenticated app.
 *
 * Without this, any thrown render error (e.g. an unexpected null in an API
 * payload on a lossy link) bubbles to the Next.js root and replaces the entire
 * page with the framework default ("This page couldn't load"), which offers no
 * in-app recovery. This boundary keeps the chrome intact and gives the user a
 * working retry via `reset()`.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the real error in the console/observability instead of losing it
    // behind the boundary.
    console.error("App route error boundary caught:", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-app flex-col items-center justify-center gap-4 px-4 py-12 text-center sm:px-8">
      <div className="grid gap-2">
        <h1 className="text-xl font-semibold text-on-surface">Something went wrong loading this page</h1>
        <p className="max-w-md text-sm text-on-surface-soft">
          This is usually a temporary connection hiccup. Your data is safe — try again in a moment.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button className="btn btn-primary" type="button" onClick={() => reset()}>
          Try again
        </button>
        <button
          className="btn btn-ghost"
          type="button"
          onClick={() => {
            window.location.href = "/today";
          }}
        >
          Go to dashboard
        </button>
      </div>
    </main>
  );
}
