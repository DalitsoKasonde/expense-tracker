import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddEntryButton } from "@/components/add-entry-button";
import { AddEntryDialog } from "@/components/add-entry-dialog";
import { localDateDaysAgo } from "@/lib/date-terms";
import { formatMoney } from "@/lib/format-money";

const mocks = vi.hoisted(() => ({
  apiCall: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { accessToken: "test-token" } }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@/lib/client-api", () => ({
  useApiCall: () => mocks.apiCall,
}));
vi.mock("@/lib/use-user-currency", () => ({
  useUserCurrency: () => ({ currency: "ZMW", loading: false }),
}));

function installStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  });
}

const septemberFood = Array.from({ length: 12 }, (_, index) => (index === new Date().getMonth() ? 34000 : 0));

describe("quick add", () => {
  beforeEach(() => {
    installStorage();
    mocks.apiCall.mockReset();
    mocks.apiCall.mockImplementation((path: string) => {
      if (path === "/v1/accounts") return Promise.resolve([{ id: "airtel", name: "Airtel Money", accountClass: "asset", currency: "ZMW" }]);
      if (path === "/v1/categories") {
        return Promise.resolve([
          { id: "food", name: "Food", categoryGroup: "expense", parentId: null },
          { id: "transport", name: "Transport", categoryGroup: "expense", parentId: null },
        ]);
      }
      if (path.startsWith("/v1/dashboard/categories")) {
        return Promise.resolve({ categories: [{ id: "food", months: septemberFood, children: [] }] });
      }
      return Promise.resolve([]);
    });
  });

  it("does not wait on investment or loan data to record a spend", async () => {
    render(<AddEntryDialog open onClose={vi.fn()} initialEntryKind="expense_living" />);
    await screen.findByLabelText("Paid from");

    const paths = mocks.apiCall.mock.calls.map(([path]) => path);
    expect(paths).not.toContain("/v1/market-data/luse");
    expect(paths).not.toContain("/v1/assets");
    expect(paths).not.toContain("/v1/bonds");
    expect(paths).not.toContain("/v1/loans");
  });

  it("sets yesterday's date in one tap", async () => {
    render(<AddEntryDialog open onClose={vi.fn()} initialEntryKind="expense_living" />);
    fireEvent.click(await screen.findByRole("button", { name: "Yesterday" }));

    expect(screen.getByLabelText("Date")).toHaveValue(localDateDaysAgo(1));
    expect(screen.getByRole("button", { name: "Yesterday" })).toHaveAttribute("aria-pressed", "true");
  });

  it("offers the category just used as a chip, without preselecting it", async () => {
    render(<AddEntryDialog open onClose={vi.fn()} initialEntryKind="expense_living" />);
    fireEvent.change(await screen.findByLabelText("Amount"), { target: { value: "85" } });
    fireEvent.change(screen.getByLabelText("Choose category"), { target: { value: "food" } });
    fireEvent.click(screen.getByRole("button", { name: "Save & add another" }));

    await screen.findByText(/Next one\?/);
    fireEvent.change(screen.getByLabelText("Choose category"), { target: { value: "" } });
    const chips = screen.getByRole("group", { name: "Recent categories" });
    expect(chips).toHaveTextContent("Food");
    expect(screen.getByLabelText("Choose category")).toHaveValue("");

    fireEvent.click(screen.getByRole("button", { name: "Food" }));
    expect(screen.getByLabelText("Choose category")).toHaveValue("food");
  });

  it("saves and stays open for the next entry, keeping the date, account and category", async () => {
    const onClose = vi.fn();
    render(<AddEntryDialog open onClose={onClose} initialEntryKind="expense_living" />);
    fireEvent.click(await screen.findByRole("button", { name: "Yesterday" }));
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "85" } });
    fireEvent.change(screen.getByLabelText("Choose category"), { target: { value: "food" } });
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "lunch" } });
    fireEvent.click(screen.getByRole("button", { name: "Save & add another" }));

    expect(await screen.findByText(plain(`Saved ${formatMoney(8500, "ZMW")} on Food. Next one?`))).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Amount")).toHaveValue(null);
    expect(screen.getByLabelText("Note")).toHaveValue("");
    expect(screen.getByLabelText("Date")).toHaveValue(localDateDaysAgo(1));
    expect(screen.getByLabelText("Paid from")).toHaveValue("airtel");
    expect(screen.getByLabelText("Choose category")).toHaveValue("food");
  });

  it("does not offer add-another for kinds that carry their own state", async () => {
    render(<AddEntryDialog open onClose={vi.fn()} initialEntryKind="saving_transfer" />);
    await screen.findByRole("button", { name: "Save entry" });
    expect(screen.queryByRole("button", { name: "Save & add another" })).not.toBeInTheDocument();
  });

  it("confirms a save with where the category stands this month", async () => {
    render(<AddEntryButton className="btn" initialEntryKind="expense_living">Add</AddEntryButton>);
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.change(await screen.findByLabelText("Amount"), { target: { value: "85" } });
    fireEvent.change(screen.getByLabelText("Choose category"), { target: { value: "food" } });
    fireEvent.click(screen.getByRole("button", { name: "Save entry" }));

    await waitFor(() =>
      expect(screen.getByText(new RegExp(`${escape(plain(formatMoney(34000, "ZMW")))} on Food in`))).toBeInTheDocument(),
    );
  });
});

/** Intl separates currency and amount with a no-break space; the DOM query normalises it. */
function plain(text: string) {
  return text.replace(/\s+/g, " ");
}

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
