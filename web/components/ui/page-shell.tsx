import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * The single page scaffold for signed-in routes.
 *
 * It owns max width, gutters, vertical rhythm and the clearance the fixed
 * bottom navigation needs (including the iOS safe area). Pages must not set
 * their own full-viewport height: the app layout already fills the viewport, and
 * repeating it per page adds a viewport of empty scroll below short content.
 */
export function PageShell({
  children,
  className,
  width = "app",
}: {
  children: ReactNode;
  className?: string;
  width?: "app" | "narrow";
}) {
  return (
    <main className={cn("page-shell", width === "narrow" && "page-shell-narrow", className)}>
      {children}
    </main>
  );
}
