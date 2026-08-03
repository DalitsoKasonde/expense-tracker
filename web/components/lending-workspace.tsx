"use client";

import { useState } from "react";
import { LoansWorkspace } from "@/components/loans-workspace";
import { ReceivablesWorkspace } from "@/components/receivables-workspace";

type View = "owe" | "owed";

const views: Array<{ id: View; label: string }> = [
  { id: "owe", label: "What you owe" },
  { id: "owed", label: "Owed to you" },
];

/** Both directions of lending in one place: debts you carry, and debts owed to you. */
export function LendingWorkspace() {
  const [view, setView] = useState<View>("owe");

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Lending views">
        {views.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`lending-tab-${item.id}`}
            aria-selected={view === item.id}
            aria-controls={`lending-panel-${item.id}`}
            className={view === item.id ? "btn btn-primary" : "btn btn-ghost"}
            onClick={() => setView(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`lending-panel-${view}`}
        aria-labelledby={`lending-tab-${view}`}
      >
        {view === "owe" ? <LoansWorkspace /> : <ReceivablesWorkspace />}
      </div>
    </div>
  );
}
