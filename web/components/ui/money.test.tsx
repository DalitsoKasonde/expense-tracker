import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Money } from "./money";

describe("Money", () => {
  it("always asks for tabular figures", () => {
    // Quicksand has no tabular numerals, so this class is what switches the
    // numeric face; without it columns of amounts do not line up.
    render(<Money amountMinor={123_45} currency="ZMW" />);
    expect(screen.getByText(/123/)).toHaveClass("tabular-nums");
  });

  it("adds a plus only to non-negative values when signed", () => {
    const { container } = render(<Money amountMinor={5_00} currency="ZMW" signed />);
    expect(container.textContent).toMatch(/^\+/);
  });

  it("leaves the formatter to render a negative sign", () => {
    const { container } = render(<Money amountMinor={-5_00} currency="ZMW" signed />);
    expect(container.textContent).not.toMatch(/^\+/);
    expect(container.textContent).toMatch(/-|−|\(/);
  });

  it("colours by sign when the tone is automatic", () => {
    const { container: gain } = render(<Money amountMinor={1} currency="ZMW" tone="auto" />);
    const { container: loss } = render(<Money amountMinor={-1} currency="ZMW" tone="auto" />);

    expect(gain.firstElementChild).toHaveClass("text-positive");
    expect(loss.firstElementChild).toHaveClass("text-negative");
  });

  it("renders an explicit sign unsigned, for rows where direction is semantic", () => {
    // A repayment is money in whatever sign the stored record carries.
    const { container } = render(
      <Money amountMinor={-250_00} currency="ZMW" sign="+" tone="positive" />,
    );

    expect(container.textContent).toMatch(/^\+/);
    expect(container.textContent).not.toMatch(/-250|−250/);
    expect(container.firstElementChild).toHaveClass("text-positive");
  });

  it("stays uncoloured by default", () => {
    const { container } = render(<Money amountMinor={-1} currency="ZMW" />);
    expect(container.firstElementChild).not.toHaveClass("text-negative");
  });
});
