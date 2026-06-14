"use client";

import { useEffect, useState } from "react";
import { useApiCall } from "@/lib/client-api";

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
  const [editingId, setEditingId] = useState<string | null>(null);
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

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this income source? Existing transactions will keep their history with a null reference.")) {
      return;
    }

    try {
      await apiCall(`/v1/income-sources/${id}`, { method: "DELETE" });
      await loadSources();
      if (editingId === id) {
        resetForm();
      }
      setStatus("Income source removed.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to remove income source");
    }
  }

  return (
    <section className="settingsSection">
      <form className="card settingsGrid" onSubmit={handleSubmit}>
        <div className="resourceBody">
          <strong>{editingId ? "Edit income source" : "Create income source"}</strong>
          <span className="muted">Income sources explain where money came from, especially for reporting.</span>
        </div>

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

        <div className="formActions">
          <button className="primaryButton" type="submit" disabled={saving}>
            {saving ? "Saving..." : editingId ? "Update source" : "Create source"}
          </button>
          {editingId ? (
            <button className="ghostButton" type="button" onClick={resetForm}>
              Cancel edit
            </button>
          ) : null}
        </div>

        {status ? <p className="statusText">{status}</p> : null}
      </form>

      <div className="resourceList">
        {loading ? <div className="card muted">Loading income sources...</div> : null}
        {!loading && sources.length === 0 ? (
          <div className="card muted">No income sources yet. Add one for cleaner income reporting.</div>
        ) : null}
        {sources.map((source) => (
          <div key={source.id} className="card resourceRow">
            <div className="resourceBody">
              <strong>{source.name}</strong>
              <div className="resourceMeta">
                <span className="metaBadge">{source.sourceType.replaceAll("_", " ")}</span>
              </div>
            </div>
            <div className="formActions">
              <button
                className="ghostButton"
                type="button"
                onClick={() => {
                  setEditingId(source.id);
                  setForm({ name: source.name, sourceType: source.sourceType });
                }}
              >
                Edit
              </button>
              <button className="ghostButton" type="button" onClick={() => void handleDelete(source.id)}>
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

