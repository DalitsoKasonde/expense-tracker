"use client";

import { useEffect, useState } from "react";
import { useApiCall } from "@/lib/client-api";
import { ConfirmationDialog, FormDialog } from "@/components/ui/dialogs";

type IncomeSource = {
  id: string;
  name: string;
  sourceType: string;
};

const sourceTypes = [
  { value: "salary", label: "Salary" },
  { value: "business", label: "Business" },
  { value: "freelance", label: "Freelance" },
  { value: "gift", label: "Gift" },
  { value: "investment_income", label: "Investment income" },
  { value: "other", label: "Other" },
];

export default function IncomeSourcesSettingsPage() {
  const apiCall = useApiCall();
  const [sources, setSources] = useState<IncomeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [form, setForm] = useState({ name: "", sourceType: "salary" });

  async function loadSources() {
    const result = await apiCall<IncomeSource[]>("/v1/income-sources");
    setSources(result ?? []);
  }

  useEffect(() => {
    void loadSources()
      .catch((error) => setStatus(error instanceof Error ? error.message : "Failed to load income sources"))
      .finally(() => setLoading(false));
  }, [apiCall]);

  function resetForm() {
    setEditingId(null);
    setCreateOpen(false);
    setForm({ name: "", sourceType: "salary" });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setStatus("");

    try {
      if (editingId) {
        await apiCall<IncomeSource>(`/v1/income-sources/${editingId}`, {
          method: "PATCH",
          body: form,
        });
      } else {
        await apiCall<IncomeSource>("/v1/income-sources", {
          method: "POST",
          body: form,
        });
      }

      await loadSources();
      resetForm();
      setStatus(editingId ? "Income source updated." : "Income source created.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to save income source");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) {
      return;
    }

    try {
      await apiCall(`/v1/income-sources/${deleteId}`, { method: "DELETE" });
      await loadSources();
      if (editingId === deleteId) {
        resetForm();
      }
      setDeleteId(null);
      setStatus("Income source removed.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to remove income source");
    }
  }

  return (
    <section className="settingsSection">
      <div className="grid gap-6">
        <div className="flex items-center justify-between gap-3">
          <div className="resourceBody">
            <strong>Existing income sources</strong>
            <span className="muted">Review naming and source types before changing how income is classified.</span>
          </div>
          <button
            className="primaryButton"
            type="button"
            onClick={() => {
              setStatus("");
              setEditingId(null);
              setCreateOpen(true);
              setForm({ name: "", sourceType: "salary" });
            }}
          >
            Create source
          </button>
        </div>

        <div className="card settingsListPanel overflow-hidden">
          <div className="settingsHeaderRow">
            <strong>Income sources table</strong>
          </div>
          <div className="overflow-x-auto">
            {loading ? <div className="muted">Loading income sources...</div> : null}
            {!loading && sources.length === 0 ? (
              <div className="muted">No income sources yet. Add one for cleaner income reporting.</div>
            ) : null}
            {sources.length ? (
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-outline text-left text-on-surface-soft">
                    <th className="px-4 py-3 font-semibold">Name</th>
                    <th className="px-4 py-3 font-semibold">Type</th>
                    <th className="px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sources.map((source) => (
                    <tr key={source.id} className="border-b border-outline/70 last:border-b-0">
                      <td className="px-4 py-3 font-semibold text-on-surface">{source.name}</td>
                      <td className="px-4 py-3 text-on-surface-soft">{source.sourceType.replaceAll("_", " ")}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            className="ghostButton"
                            type="button"
                            onClick={() => {
                              setStatus("");
                              setCreateOpen(false);
                              setEditingId(source.id);
                              setForm({ name: source.name, sourceType: source.sourceType });
                            }}
                          >
                            Edit
                          </button>
                          <button className="ghostButton" type="button" onClick={() => setDeleteId(source.id)}>
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
        </div>
      </div>

      {status ? <p className="statusText">{status}</p> : null}

      <FormDialog
        open={createOpen || editingId !== null}
        title={editingId ? "Edit income source" : "Create income source"}
        description="Income sources explain where money came from, especially in filtered reports and history views."
        submitLabel={editingId ? "Update source" : "Create source"}
        pending={saving}
        error={status.startsWith("Failed") ? status : undefined}
        onSubmit={handleSubmit}
        onClose={resetForm}
      >
        <div className="grid gap-4">
          <div className="field">
            <label htmlFor="name">Name</label>
            <input
              id="name"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="e.g. Main business"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="sourceType">Source type</label>
            <select
              id="sourceType"
              value={form.sourceType}
              onChange={(event) => setForm((current) => ({ ...current, sourceType: event.target.value }))}
            >
              {sourceTypes.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </FormDialog>

      <ConfirmationDialog
        open={deleteId !== null}
        title="Remove income source?"
        description="Existing transactions will keep their history with a null reference."
        confirmLabel="Remove"
        destructive
        onConfirm={() => void handleDelete()}
        onClose={() => setDeleteId(null)}
      />
    </section>
  );
}
