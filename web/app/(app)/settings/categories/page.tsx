"use client";

import { useEffect, useMemo, useState } from "react";
import { useApiCall } from "@/lib/client-api";
import { ConfirmationDialog, FormDialog } from "@/components/ui/dialogs";

type Category = {
  id: string;
  name: string;
  categoryGroup: string;
  parentId: string | null;
};

const categoryGroups = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "saving", label: "Saving" },
  { value: "investment", label: "Investment" },
];

function buildOrderedCategories(categories: Category[]) {
  const byParent = new Map<string | null, Category[]>();
  for (const category of categories) {
    const key = category.parentId ?? null;
    const bucket = byParent.get(key) ?? [];
    bucket.push(category);
    byParent.set(key, bucket);
  }

  for (const group of byParent.values()) {
    group.sort((left, right) => left.name.localeCompare(right.name));
  }

  const ordered: Array<Category & { depth: number }> = [];
  const visit = (parentId: string | null, depth: number) => {
    for (const category of byParent.get(parentId) ?? []) {
      ordered.push({ ...category, depth });
      visit(category.id, depth + 1);
    }
  };
  visit(null, 0);
  return ordered;
}

export default function CategoriesSettingsPage() {
  const apiCall = useApiCall();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [form, setForm] = useState({
    name: "",
    categoryGroup: "expense",
    parentId: "",
  });

  const orderedCategories = useMemo(() => buildOrderedCategories(categories), [categories]);
  const parentOptions = useMemo(
    () =>
      orderedCategories.filter(
        (category) => category.id !== editingId && category.categoryGroup === form.categoryGroup
      ),
    [editingId, form.categoryGroup, orderedCategories]
  );

  async function loadCategories() {
    const result = await apiCall<Category[]>("/v1/categories");
    setCategories(result ?? []);
  }

  useEffect(() => {
    void loadCategories()
      .catch((error) => setStatus(error instanceof Error ? error.message : "Failed to load categories"))
      .finally(() => setLoading(false));
  }, [apiCall]);

  function resetForm() {
    setEditingId(null);
    setCreateOpen(false);
    setForm({ name: "", categoryGroup: "expense", parentId: "" });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setStatus("");

    const payload = {
      name: form.name,
      categoryGroup: form.categoryGroup,
      parentId: form.parentId || undefined,
    };

    try {
      if (editingId) {
        await apiCall<Category>(`/v1/categories/${editingId}`, {
          method: "PATCH",
          body: payload,
        });
      } else {
        await apiCall<Category>("/v1/categories", {
          method: "POST",
          body: payload,
        });
      }

      await loadCategories();
      resetForm();
      setStatus(editingId ? "Category updated." : "Category created.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to save category");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) {
      return;
    }

    try {
      await apiCall(`/v1/categories/${deleteId}`, { method: "DELETE" });
      await loadCategories();
      if (editingId === deleteId) {
        resetForm();
      }
      setDeleteId(null);
      setStatus("Category removed.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to remove category");
    }
  }

  return (
    <section className="settingsSection">
      <div className="grid gap-6">
        <div className="flex items-center justify-between gap-3">
          <div className="resourceBody">
            <strong>Existing categories</strong>
            <span className="muted">Parent-child structure is shown directly in the table for easier editing.</span>
          </div>
          <button
            className="primaryButton"
            type="button"
            onClick={() => {
              setStatus("");
              setEditingId(null);
              setCreateOpen(true);
              setForm({ name: "", categoryGroup: "expense", parentId: "" });
            }}
          >
            Create category
          </button>
        </div>

        <div className="card settingsListPanel overflow-hidden">
          <div className="settingsHeaderRow">
            <strong>Categories table</strong>
          </div>
          <div className="overflow-x-auto">
            {loading ? <div className="muted">Loading categories...</div> : null}
            {!loading && orderedCategories.length === 0 ? (
              <div className="muted">No categories yet. Create your first category.</div>
            ) : null}
            {orderedCategories.length ? (
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-outline text-left text-on-surface-soft">
                    <th className="px-4 py-3 font-semibold">Name</th>
                    <th className="px-4 py-3 font-semibold">Group</th>
                    <th className="px-4 py-3 font-semibold">Level</th>
                    <th className="px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orderedCategories.map((category) => (
                    <tr key={category.id} className="border-b border-outline/70 last:border-b-0">
                      <td
                        className="px-4 py-3 font-semibold text-on-surface"
                        style={{ paddingLeft: `${1 + category.depth * 1.25}rem` }}
                      >
                        {category.name}
                      </td>
                      <td className="px-4 py-3 text-on-surface-soft">{category.categoryGroup}</td>
                      <td className="px-4 py-3 text-on-surface-soft">{category.parentId ? "Subcategory" : "Top level"}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            className="ghostButton"
                            type="button"
                            onClick={() => {
                              setStatus("");
                              setCreateOpen(false);
                              setEditingId(category.id);
                              setForm({
                                name: category.name,
                                categoryGroup: category.categoryGroup,
                                parentId: category.parentId ?? "",
                              });
                            }}
                          >
                            Edit
                          </button>
                          <button className="ghostButton" type="button" onClick={() => setDeleteId(category.id)}>
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
        title={editingId ? "Edit category" : "Create category"}
        description="Categories can be grouped and nested without making the ledger feel noisy."
        submitLabel={editingId ? "Update category" : "Create category"}
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
              placeholder="e.g. Groceries"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="categoryGroup">Category group</label>
            <select
              id="categoryGroup"
              value={form.categoryGroup}
              onChange={(event) =>
                setForm((current) => ({ ...current, categoryGroup: event.target.value, parentId: "" }))
              }
            >
              {categoryGroups.map((group) => (
                <option key={group.value} value={group.value}>
                  {group.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="parentId">Parent category</label>
            <select
              id="parentId"
              value={form.parentId}
              onChange={(event) => setForm((current) => ({ ...current, parentId: event.target.value }))}
            >
              <option value="">No parent</option>
              {parentOptions.map((category) => (
                <option key={category.id} value={category.id}>
                  {`${"  ".repeat(category.depth)}${category.name}`}
                </option>
              ))}
            </select>
          </div>
        </div>
      </FormDialog>

      <ConfirmationDialog
        open={deleteId !== null}
        title="Remove category?"
        description="Transactions will keep their history, and child categories will be detached."
        confirmLabel="Remove"
        destructive
        onConfirm={() => void handleDelete()}
        onClose={() => setDeleteId(null)}
      />
    </section>
  );
}
