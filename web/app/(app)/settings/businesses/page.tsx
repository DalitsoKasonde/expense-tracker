"use client";

import { useEffect, useState } from "react";
import { useApiCall } from "@/lib/client-api";

type Business = {
  id: string;
  name: string;
};

function sortBusinesses(items: Business[]) {
  return [...items].sort((left, right) => left.name.localeCompare(right.name));
}

export default function BusinessesSettingsPage() {
  const apiCall = useApiCall();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [name, setName] = useState("");

  async function loadBusinesses() {
    const result = await apiCall<Business[]>("/v1/businesses");
    setBusinesses(sortBusinesses(result ?? []));
  }

  useEffect(() => {
    void loadBusinesses()
      .catch((error) => setStatus(error instanceof Error ? error.message : "Failed to load businesses"))
      .finally(() => setLoading(false));
  }, [apiCall]);

  function resetForm() {
    setEditingId(null);
    setName("");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setStatus("");

    try {
      if (editingId) {
        const updated = await apiCall<Business>(`/v1/businesses/${editingId}`, {
          method: "PATCH",
          body: { name },
        });
        setBusinesses((current) =>
          sortBusinesses(current.map((business) => (business.id === updated.id ? updated : business)))
        );
        setStatus("Business updated.");
      } else {
        const created = await apiCall<Business>("/v1/businesses", {
          method: "POST",
          body: { name },
        });
        setBusinesses((current) => sortBusinesses([...current, created]));
        setStatus("Business created.");
      }

      resetForm();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to save business");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this business? Existing linked transactions will keep their history with a null reference.")) {
      return;
    }

    try {
      await apiCall(`/v1/businesses/${id}`, { method: "DELETE" });
      setBusinesses((current) => current.filter((business) => business.id !== id));
      if (editingId === id) {
        resetForm();
      }
      setStatus("Business removed.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to remove business");
    }
  }

  return (
    <section className="settingsSection">
      <div className="card settingsLeadCard">
        <p className="sectionKicker">Businesses</p>
        <h2 className="sectionHeading">Business context</h2>
        <p className="muted">Tag business-linked movement without turning the ledger into a full accounting suite.</p>
      </div>

      <div className="settingsDetailGrid">
      <form className="card settingsFormPanel" onSubmit={handleSubmit}>
        <div className="resourceBody">
          <strong>{editingId ? "Edit business" : "Create business"}</strong>
          <span className="muted">Businesses help separate personal and business-linked spending, income, and reporting context.</span>
        </div>

        <div className="field">
          <label htmlFor="businessName">Name</label>
          <input
            id="businessName"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Side Hustle"
            required
          />
        </div>

        <div className="formActions">
          <button className="primaryButton" type="submit" disabled={saving}>
            {saving ? "Saving..." : editingId ? "Update business" : "Create business"}
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
            <strong>Existing businesses</strong>
            <span className="muted">Use short, stable names that will remain clear inside history and reports.</span>
          </div>
        </div>
        <div className="resourceList">
          {loading ? <div className="muted">Loading businesses...</div> : null}
          {!loading && businesses.length === 0 ? (
            <div className="muted">No businesses yet. Add one if you want separate business-linked reporting.</div>
          ) : null}
          {businesses.map((business) => (
            <div key={business.id} className="resourceRow">
              <div className="resourceBody">
                <strong>{business.name}</strong>
              </div>
              <div className="formActions">
                <button
                  className="ghostButton"
                  type="button"
                  onClick={() => {
                    setEditingId(business.id);
                    setName(business.name);
                  }}
                >
                  Edit
                </button>
                <button className="ghostButton" type="button" onClick={() => void handleDelete(business.id)}>
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
