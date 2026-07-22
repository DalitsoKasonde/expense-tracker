import type { ReactNode } from "react";

export function EmptyState({ title, description, action, icon }: { title: string; description: string; action?: ReactNode; icon?: ReactNode }) {
  return <div className="grid justify-items-center rounded-lg border border-dashed border-outline-strong bg-surface-soft p-8 text-center">{icon ? <div className="mb-3 text-primary">{icon}</div> : null}<h3 className="font-semibold text-on-surface">{title}</h3><p className="mt-1 max-w-md text-sm text-on-surface-soft">{description}</p>{action ? <div className="mt-4">{action}</div> : null}</div>;
}
