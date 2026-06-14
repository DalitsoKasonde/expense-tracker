"use client";

import { useEffect, useState } from "react";
import { useApiCall } from "@/lib/client-api";

type Business = {
  id: string;
  name: string;
};

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
    setBusinesses(result ?? []);
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
        await apiCall<Business>(`/v1/businesses/${editingId}`, {
          method: "PATCH",
          body: { name },
        });
      } else {
        await apiCall<Business>("/v1/businesses", {
          method: "POST",
          body: { name },
        });
      }

      await loadBusinesses();
      resetForm();
      setStatus(editingId ? "Business updated." : "Business created.");
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
      await loadBusinesses();
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
      <form className="card settingsGrid" onSubmit={handleSubmit}>
        <div className="resourceBody">
          <strong>{editingId ? "Edit business" : "Create business"}</strong>
          <span className="muted">Businesses let you separate personal and business-linked spending without a full accounting system.</span>
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

      <div className="resourceList">
        {loading ? <div className="card muted">Loading businesses...</div> : null}
        {!loading && businesses.length === 0 ? (
          <div className="card muted">No businesses yet. Add one if you want separate business-linked reporting.</div>
        ) : null}
        {businesses.map((business) => (
          <div key={business.id} className="card resourceRow">
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
    </section>
  );
}
