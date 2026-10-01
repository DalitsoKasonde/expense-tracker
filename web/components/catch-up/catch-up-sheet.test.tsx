import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CatchUpSheet } from "./catch-up-sheet";

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

describe("CatchUpSheet", () => {
  beforeEach(() => {
    installStorage();
    mocks.apiCall.mockReset();
    mocks.apiCall.mockImplementation((path: string) => {
      if (path === "/v1/accounts") {
        return Promise.resolve([
          { id: "airtel", name: "Airtel Money", accountClass: "asset", currency: "ZMW" },
          { id: "card", name: "Credit card", accountClass: "liability", currency: "ZMW" },
        ]);
      }
      if (path === "/v1/categories") return Promise.resolve([{ id: "food", name: "Food", categoryGroup: "expense", parentId: null }]);
      return Promise.resolve({ id: "saved" });
    });
  });

  it("offers only accounts money can be paid from", async () => {
    render(<CatchUpSheet />);
    const account = await screen.findByLabelText("Paid from");
    expect(Array.from((account as HTMLSelectElement).options).map((option) => option.value)).toEqual(["airtel"]);
  });

  it("starts the next row on the same date when Enter is pressed", async () => {
    render(<CatchUpSheet />);
    fireEvent.change(await screen.findByLabelText("Date"), { target: { value: "2026-09-12" } });
    fireEvent.change(screen.getByLabelText("Amount (ZMW)"), { target: { value: "85" } });
    fireEvent.keyDown(screen.getByLabelText("Amount (ZMW)"), { key: "Enter" });

    const dates = screen.getAllByLabelText("Date") as HTMLInputElement[];
    expect(dates.map((input) => input.value)).toEqual(["2026-09-12", "2026-09-12"]);
    await waitFor(() => expect(document.activeElement).toBe(screen.getAllByLabelText("Amount (ZMW)")[1]));
  });

  it("saves each row through the ordinary endpoint with its own idempotency key", async () => {
    render(<CatchUpSheet />);
    fireEvent.change(await screen.findByLabelText("Amount (ZMW)"), { target: { value: "85.50" } });
    fireEvent.change(screen.getByLabelText("Fee"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save 1 entry" }));

    await screen.findByText("Saved 1 entry.");
    expect(mocks.apiCall).toHaveBeenCalledWith("/v1/transactions", {
      method: "POST",
      body: expect.objectContaining({ entryKind: "expense_living", amount: 8550, transactionFee: 200, currency: "ZMW", accountId: "airtel" }),
      headers: { "X-Idempotency-Key": expect.stringMatching(/^catch-up:/) },
    });
    // The saved row leaves the sheet; a fresh one takes its place.
    expect((screen.getByLabelText("Amount (ZMW)") as HTMLInputElement).value).toBe("");
  });

  it("keeps a rejected row on the sheet with the reason, and saves the rest", async () => {
    let posts = 0;
    mocks.apiCall.mockImplementation((path: string, options?: { method?: string }) => {
      if (path === "/v1/accounts") return Promise.resolve([{ id: "airtel", name: "Airtel Money", accountClass: "asset", currency: "ZMW" }]);
      if (path === "/v1/categories") return Promise.resolve([]);
      if (options?.method === "POST") {
        posts += 1;
        return posts === 1 ? Promise.reject(new Error("account is archived")) : Promise.resolve({ id: "saved" });
      }
      return Promise.resolve([]);
    });

    render(<CatchUpSheet />);
    fireEvent.change(await screen.findByLabelText("Amount (ZMW)"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "+ Add row" }));
    fireEvent.change(screen.getAllByLabelText("Amount (ZMW)")[1], { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Save 2 entries" }));

    expect(await screen.findByText("Saved 1 entry. 1 needs attention below.")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("account is archived");
    expect((screen.getByLabelText("Amount (ZMW)") as HTMLInputElement).value).toBe("10");
  });

  const sms = [
    "Payment of ZMW 10.00 Till Number SOCHESCARE AIRTEL NETWORKS SELF CARE SOCHE. Airtel Money bal is ZMW 15.76. TID : MP260923.2136.G64740.",
    "You have received ZMW 100.00 from .Dial *115# to check your new Bal. TID: PP260924.0647.A19777.",
    "Get 5GB for K50! Dial *117#",
  ].join("\n");

  async function pasteSms() {
    fireEvent.click(await screen.findByRole("button", { name: "Paste Airtel Money SMS" }));
    fireEvent.change(screen.getByLabelText("Messages"), { target: { value: sms } });
    fireEvent.click(screen.getByRole("button", { name: "Add to sheet" }));
  }

  it("turns pasted SMS into rows on the Airtel wallet, replacing the empty starter row", async () => {
    mocks.apiCall.mockImplementation((path: string) => {
      if (path === "/v1/accounts") return Promise.resolve([
        { id: "bank", name: "Zanaco", accountClass: "asset", currency: "ZMW" },
        { id: "airtel", name: "Airtel Money", accountClass: "asset", currency: "ZMW" },
      ]);
      return Promise.resolve([]);
    });
    render(<CatchUpSheet />);
    await pasteSms();

    expect(await screen.findByText(/Added 2 entries to the sheet/)).toBeInTheDocument();
    expect(screen.getByText("1 line not recognised as a transaction")).toBeInTheDocument();
    const amounts = screen.getAllByLabelText("Amount (ZMW)") as HTMLInputElement[];
    expect(amounts.map((input) => input.value)).toEqual(["10.00", "100.00"]);
    const wallets = screen.getAllByLabelText(/Paid from|Received into/) as HTMLSelectElement[];
    expect(wallets.map((select) => select.value)).toEqual(["airtel", "airtel"]);
  });

  it("does not add the same SMS to the sheet twice", async () => {
    render(<CatchUpSheet />);
    await pasteSms();
    await screen.findByText(/Added 2 entries/);
    fireEvent.change(screen.getByLabelText("Messages"), { target: { value: sms } });
    fireEvent.click(screen.getByRole("button", { name: "Add to sheet" }));

    expect(await screen.findByText(/Added 0 entries to the sheet; 2 were already on it/)).toBeInTheDocument();
    expect(screen.getAllByLabelText("Amount (ZMW)")).toHaveLength(2);
  });

  it("treats an SMS saved on an earlier evening as already recorded, not as a failure", async () => {
    mocks.apiCall.mockImplementation((path: string, options?: { method?: string }) => {
      if (path === "/v1/accounts") return Promise.resolve([{ id: "airtel", name: "Airtel Money", accountClass: "asset", currency: "ZMW" }]);
      if (options?.method === "POST") {
        return Promise.reject(new Error("idempotency key validation failed: idempotency key reused with different request"));
      }
      return Promise.resolve([]);
    });
    render(<CatchUpSheet />);
    await pasteSms();
    fireEvent.click(await screen.findByRole("button", { name: "Save 2 entries" }));

    expect(await screen.findByText("2 were already recorded from an earlier paste.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
