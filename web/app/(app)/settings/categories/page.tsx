"use client";

import { useEffect, useMemo, useState } from "react";
import { useApiCall } from "@/lib/client-api";

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [form, setForm] = useState({
    name: "",
    categoryGroup: "expense",
    parentId: "",
  });

  const orderedCategories = useMemo(() => buildOrderedCategories(categories), [categories]);

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

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this category? Transactions will keep their history, and child categories will be detached.")) {
      return;
    }

    try {
      await apiCall(`/v1/categories/${id}`, { method: "DELETE" });
      await loadCategories();
      if (editingId === id) {
        resetForm();
      }
      setStatus("Category removed.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to remove category");
    }
  }

  return (
    <section className="settingsSection">
      <form className="card settingsGrid" onSubmit={handleSubmit}>
        <div className="resourceBody">
          <strong>{editingId ? "Edit category" : "Create category"}</strong>
          <span className="muted">Categories stay grouped while supporting optional parent-child structure.</span>
        </div>

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
            onChange={(event) => setForm((current) => ({ ...current, categoryGroup: event.target.value }))}
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
            {orderedCategories
              .filter((category) => category.id !== editingId)
              .map((category) => (
                <option key={category.id} value={category.id}>
                  {`${"  ".repeat(category.depth)}${category.name}`}
                </option>
              ))}
          </select>
        </div>

        <div className="formActions">
          <button className="primaryButton" type="submit" disabled={saving}>
            {saving ? "Saving..." : editingId ? "Update category" : "Create category"}
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
        {loading ? <div className="card muted">Loading categories...</div> : null}
        {!loading && orderedCategories.length === 0 ? (
          <div className="card muted">No categories yet. Create your first category above.</div>
        ) : null}
        {orderedCategories.map((category) => (
          <div key={category.id} className="card resourceRow">
            <div className="resourceBody">
              <strong>{`${"— ".repeat(category.depth)}${category.name}`}</strong>
              <div className="resourceMeta">
                <span className="metaBadge">{category.categoryGroup}</span>
                {category.parentId ? <span className="metaBadge">Subcategory</span> : null}
              </div>
            </div>
            <div className="formActions">
              <button
                className="ghostButton"
                type="button"
                onClick={() => {
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
              <button className="ghostButton" type="button" onClick={() => void handleDelete(category.id)}>
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

