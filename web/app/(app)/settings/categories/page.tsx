"use client";

import { useEffect, useMemo, useState } from "react";
import { useApiCall } from "@/lib/client-api";
import { buildCategoryRows, categoryGroups, type Category } from "@/lib/category-tree";
import { ConfirmationDialog, FormDialog } from "@/components/ui/dialogs";

export default function CategoriesSettingsPage() {
  const apiCall = useApiCall();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    name: "",
    categoryGroup: "expense",
    parentId: "",
  });

  const orderedCategories = useMemo(() => buildCategoryRows(categories), [categories]);
  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );
  // A long flat list is unscannable, so searching matches a category's own name
  // or its parent's — typing "transport" should still surface "Fuel" beneath it.
  const visibleCategories = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return orderedCategories;
    return orderedCategories.filter((category) => {
      if (category.name.toLowerCase().includes(term)) return true;
      const parent = category.parentId ? categoriesById.get(category.parentId) : undefined;
      return parent ? parent.name.toLowerCase().includes(term) : false;
    });
  }, [categoriesById, orderedCategories, search]);
  const searching = search.trim().length > 0;

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
            <span className="muted">Categories are grouped by purpose, with parent and subcategory relationships kept visible.</span>
          </div>
          <button
            className="btn btn-primary"
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

        {!loading && categories.length > 15 ? (
          <div className="field">
            <label htmlFor="categorySearch">Search categories</label>
            <input
              id="categorySearch"
              type="search"
              value={search}
              placeholder="Filter by name"
              onChange={(event) => setSearch(event.target.value)}
            />
            <span className="muted" role="status">
              {searching
                ? `${visibleCategories.length} of ${orderedCategories.length} categories match`
                : `${orderedCategories.length} categories`}
            </span>
          </div>
        ) : null}

        {loading ? <div className="card settingsListPanel muted">Loading categories...</div> : null}
        {!loading ? (
          <div className="grid gap-4">
            {categoryGroups.map((group) => {
              const groupCategories = visibleCategories.filter(
                (category) => category.categoryGroup === group.value,
              );
              // While searching, a group with no matches is noise.
              if (searching && groupCategories.length === 0) return null;
              return (
                <section key={group.value} className="card overflow-hidden p-0" aria-labelledby={`category-group-${group.value}`}>
                  <div className="flex items-center justify-between gap-3 border-b border-outline bg-surface-soft p-4">
                    <div className="flex items-center gap-3">
                      <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary-softer text-lg font-bold text-primary" aria-hidden="true">
                        {group.symbol}
                      </span>
                      <div className="resourceBody">
                        <h2 id={`category-group-${group.value}`} className="text-[15px] font-bold text-on-surface">
                          {group.label}
                        </h2>
                        <span className="muted">
                          {groupCategories.length === 1 ? "1 category" : `${groupCategories.length} categories`}
                        </span>
                      </div>
                    </div>
                    <button
                      className="btn btn-ghost"
                      type="button"
                      onClick={() => {
                        setStatus("");
                        setEditingId(null);
                        setCreateOpen(true);
                        setForm({ name: "", categoryGroup: group.value, parentId: "" });
                      }}
                    >
                      Add
                    </button>
                  </div>

                  {groupCategories.length ? (
                    <div className="grid gap-2 p-3 sm:p-4">
                      {groupCategories.map((category) => {
                        const parent = category.parentId ? categoriesById.get(category.parentId) : undefined;
                        return (
                          <div
                            key={category.id}
                            className="grid gap-3 rounded-lg border border-outline bg-surface p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                            style={{ marginLeft: `${Math.min(category.depth, 3) * 1.25}rem` }}
                          >
                            <div className="flex min-w-0 items-start gap-3">
                              <span className="mt-1 text-primary" aria-hidden="true">{category.depth ? "└" : "●"}</span>
                              <div className="resourceBody min-w-0">
                                <strong>{category.name}</strong>
                                <span className="muted">
                                  {parent
                                    ? `Subcategory of ${parent.name}`
                                    : category.childCount
                                      ? `${category.childCount} direct ${category.childCount === 1 ? "subcategory" : "subcategories"}`
                                      : "Top-level category"}
                                </span>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                className="btn btn-ghost"
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
                              <button className="btn btn-ghost" type="button" onClick={() => setDeleteId(category.id)}>
                                Remove
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-4 text-sm text-on-surface-soft">No {group.label.toLowerCase()} categories yet.</div>
                  )}
                </section>
              );
            })}
          </div>
        ) : null}
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
                  {category.path}
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
