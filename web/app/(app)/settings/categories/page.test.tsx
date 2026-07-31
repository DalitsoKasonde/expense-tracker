import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CategoriesSettingsPage from "./page";

const mocks = vi.hoisted(() => ({ apiCall: vi.fn() }));

vi.mock("@/lib/client-api", () => ({
  useApiCall: () => mocks.apiCall,
}));

describe("CategoriesSettingsPage", () => {
  beforeEach(() => {
    mocks.apiCall.mockReset();
    mocks.apiCall.mockImplementation((path: string) => {
      if (path === "/v1/categories") {
        return Promise.resolve([
          { id: "food", name: "Food", categoryGroup: "expense", parentId: null },
          { id: "groceries", name: "Groceries", categoryGroup: "expense", parentId: "food" },
          { id: "salary", name: "Salary", categoryGroup: "income", parentId: null },
        ]);
      }
      return Promise.reject(new Error(`unexpected path ${path}`));
    });
  });

  it("groups categories by purpose and explains their hierarchy", async () => {
    render(<CategoriesSettingsPage />);

    expect(await screen.findByRole("heading", { name: "Expense" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Income" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Saving" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Investment" })).toBeInTheDocument();
    expect(screen.getByText("1 direct subcategory")).toBeInTheDocument();
    expect(screen.getByText("Subcategory of Food")).toBeInTheDocument();
    expect(screen.getByText("No saving categories yet.")).toBeInTheDocument();
  });
});
