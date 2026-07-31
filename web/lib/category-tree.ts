export type Category = {
  id: string;
  name: string;
  categoryGroup: string;
  parentId: string | null;
};

export type CategoryRow = Category & {
  childCount: number;
  depth: number;
  path: string;
};

export const categoryGroups = [
  { value: "expense", label: "Expense", symbol: "−" },
  { value: "income", label: "Income", symbol: "+" },
  { value: "saving", label: "Saving", symbol: "↔" },
  { value: "investment", label: "Investment", symbol: "↗" },
] as const;

export function buildCategoryRows(categories: Category[]): CategoryRow[] {
  const ids = new Set(categories.map((category) => category.id));
  const byParent = new Map<string | null, Category[]>();

  for (const category of categories) {
    const parentId = category.parentId && ids.has(category.parentId) ? category.parentId : null;
    const bucket = byParent.get(parentId) ?? [];
    bucket.push(category);
    byParent.set(parentId, bucket);
  }

  for (const bucket of byParent.values()) {
    bucket.sort((left, right) => left.name.localeCompare(right.name));
  }

  const rows: CategoryRow[] = [];
  const visited = new Set<string>();

  function visit(parentId: string | null, depth: number, parentPath: string) {
    for (const category of byParent.get(parentId) ?? []) {
      if (visited.has(category.id)) continue;
      visited.add(category.id);
      const path = parentPath ? `${parentPath} › ${category.name}` : category.name;
      rows.push({
        ...category,
        childCount: (byParent.get(category.id) ?? []).length,
        depth,
        path,
      });
      visit(category.id, depth + 1, path);
    }
  }

  visit(null, 0, "");
  return rows;
}
