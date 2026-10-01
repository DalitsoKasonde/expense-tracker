import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { localDateDaysAgo } from "@/lib/date-terms";
import { LoggingGapBanner } from "./logging-gap-banner";

describe("LoggingGapBanner", () => {
  it("points to the catch-up sheet once the record is days behind", () => {
    render(<LoggingGapBanner lastEntryDate={localDateDaysAgo(20)} />);
    expect(screen.getByText(/20 days ago/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Catch up" })).toHaveAttribute("href", "/add/catch-up");
  });

  it("stays out of the way while the record is current", () => {
    const { container } = render(<LoggingGapBanner lastEntryDate={localDateDaysAgo(1)} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("says nothing before the first entry", () => {
    const { container } = render(<LoggingGapBanner lastEntryDate={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
