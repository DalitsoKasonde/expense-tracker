import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { stockHighlights } from "@/lib/stock-insights";
import { StockHighlightsCard } from "./stock-highlights";

describe("StockHighlightsCard", () => {
  it("lists the best and weakest holdings, linked to their pages", () => {
    const highlights = stockHighlights(
      [
        { assetId: "a", name: "Alpha", symbol: "ALP", currency: "ZMW", quantity: 10, investedMinor: 10000, valueMinor: 12000 },
        { assetId: "b", name: "Beta", symbol: "BET", currency: "ZMW", quantity: 500, investedMinor: 10000, valueMinor: 8000 },
      ],
      new Map(),
      "2026-10-01",
    );
    render(<StockHighlightsCard highlights={highlights} />);
    expect(screen.getByText("Best performer").nextSibling).toHaveTextContent("ALP +20.0%");
    expect(screen.getByText("Weakest").nextSibling).toHaveTextContent("BET -20.0%");
    // ALP is also the largest holding and has the fewest shares, so it is linked more than once.
    expect(screen.getAllByRole("link", { name: "ALP" })[0]).toHaveAttribute("href", "/investments/a");
  });

  it("renders nothing when there is nothing to compare", () => {
    const { container } = render(<StockHighlightsCard highlights={{}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
