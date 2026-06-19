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
      <div className="card settingsLeadCard">
        <p className="sectionKicker">Income Sources</p>
        <h2 className="sectionHeading">Where revenue begins</h2>
        <p className="muted">Track salary, business revenue, freelance work, and investment income from one clean source library.</p>
      </div>

      <div className="settingsDetailGrid">
      <form className="card settingsFormPanel" onSubmit={handleSubmit}>
        <div className="resourceBody">
          <strong>{editingId ? "Edit income source" : "Create income source"}</strong>
          <span className="muted">Income sources explain where money came from, especially in filtered reports and history views.</span>
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

      <div className="card settingsListPanel">
        <div className="settingsHeaderRow">
          <div className="resourceBody">
            <strong>Existing income sources</strong>
            <span className="muted">Review naming and source types before changing how income is classified.</span>
          </div>
        </div>
        <div className="resourceList">
          {loading ? <div className="muted">Loading income sources...</div> : null}
          {!loading && sources.length === 0 ? (
            <div className="muted">No income sources yet. Add one for cleaner income reporting.</div>
          ) : null}
          {sources.map((source) => (
            <div key={source.id} className="resourceRow">
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
      </div>
      </div>
    </section>
  );
}
