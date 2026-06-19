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
      <div className="card settingsLeadCard">
        <p className="sectionKicker">Categories</p>
        <h2 className="sectionHeading">Ledger language</h2>
        <p className="muted">Keep income, spending, saving, and investing clear enough for history and reports to stay readable.</p>
      </div>

      <div className="settingsDetailGrid">
      <form className="card settingsFormPanel" onSubmit={handleSubmit}>
        <div className="resourceBody">
          <strong>{editingId ? "Edit category" : "Create category"}</strong>
          <span className="muted">Categories can be grouped and nested without making the ledger feel noisy.</span>
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

      <div className="card settingsListPanel">
        <div className="settingsHeaderRow">
          <div className="resourceBody">
            <strong>Existing categories</strong>
            <span className="muted">Parent-child structure is shown directly in the list for easier editing.</span>
          </div>
        </div>
        <div className="resourceList">
          {loading ? <div className="muted">Loading categories...</div> : null}
          {!loading && orderedCategories.length === 0 ? (
            <div className="muted">No categories yet. Create your first category above.</div>
          ) : null}
          {orderedCategories.map((category) => (
            <div key={category.id} className="resourceRow">
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
      </div>
      </div>
    </section>
  );
}
