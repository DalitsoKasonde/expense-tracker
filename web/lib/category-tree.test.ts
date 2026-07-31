import { describe, expect, it } from "vitest";
import { buildCategoryRows } from "./category-tree";

describe("buildCategoryRows", () => {
  it("orders categories as a tree and exposes readable paths", () => {
    const rows = buildCategoryRows([
      { id: "bundles", name: "Data Bundles", categoryGroup: "expense", parentId: null },
      { id: "weekly", name: "Weekly", categoryGroup: "expense", parentId: "bundles" },
      { id: "food", name: "Food", categoryGroup: "expense", parentId: null },
    ]);

    expect(rows.map(({ id, depth, path }) => ({ id, depth, path }))).toEqual([
      { id: "bundles", depth: 0, path: "Data Bundles" },
      { id: "weekly", depth: 1, path: "Data Bundles › Weekly" },
      { id: "food", depth: 0, path: "Food" },
    ]);
    expect(rows[0].childCount).toBe(1);
  });
});
