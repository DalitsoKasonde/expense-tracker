"use client";

import { useEffect, useState } from "react";
import { useApiCall } from "@/lib/client-api";
import { ConfirmationDialog, FormDialog } from "@/components/ui/dialogs";

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
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
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
    setCreateOpen(false);
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

  async function handleDelete() {
    if (!deleteId) {
      return;
    }

    try {
      await apiCall(`/v1/businesses/${deleteId}`, { method: "DELETE" });
      setBusinesses((current) => current.filter((business) => business.id !== deleteId));
      if (editingId === deleteId) {
        resetForm();
      }
      setDeleteId(null);
      setStatus("Business removed.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to remove business");
    }
  }

  return (
    <section className="settingsSection">
      <div className="grid gap-6">
        <div className="flex items-center justify-between gap-3">
          <div className="resourceBody">
            <strong>Existing businesses</strong>
            <span className="muted">Use short, stable names that will remain clear inside history and reports.</span>
          </div>
          <button
            className="primaryButton"
            type="button"
            onClick={() => {
              setStatus("");
              setEditingId(null);
              setCreateOpen(true);
              setName("");
            }}
          >
            Create business
          </button>
        </div>

        <div className="card settingsListPanel overflow-hidden">
          <div className="settingsHeaderRow">
            <strong>Businesses table</strong>
          </div>
          <div className="overflow-x-auto">
            {loading ? <div className="muted">Loading businesses...</div> : null}
            {!loading && businesses.length === 0 ? (
              <div className="muted">No businesses yet. Add one if you want separate business-linked reporting.</div>
            ) : null}
            {businesses.length ? (
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-outline text-left text-on-surface-soft">
                    <th className="px-4 py-3 font-semibold">Name</th>
                    <th className="px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {businesses.map((business) => (
                    <tr key={business.id} className="border-b border-outline/70 last:border-b-0">
                      <td className="px-4 py-3 font-semibold text-on-surface">{business.name}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            className="ghostButton"
                            type="button"
                            onClick={() => {
                              setStatus("");
                              setCreateOpen(false);
                              setEditingId(business.id);
                              setName(business.name);
                            }}
                          >
                            Edit
                          </button>
                          <button className="ghostButton" type="button" onClick={() => setDeleteId(business.id)}>
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
        title={editingId ? "Edit business" : "Create business"}
        description="Businesses help separate personal and business-linked spending, income, and reporting context."
        submitLabel={editingId ? "Update business" : "Create business"}
        pending={saving}
        error={status.startsWith("Failed") ? status : undefined}
        onSubmit={handleSubmit}
        onClose={resetForm}
      >
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
      </FormDialog>

      <ConfirmationDialog
        open={deleteId !== null}
        title="Remove business?"
        description="Existing linked transactions will keep their history with a null reference."
        confirmLabel="Remove"
        destructive
        onConfirm={() => void handleDelete()}
        onClose={() => setDeleteId(null)}
      />
    </section>
  );
}
