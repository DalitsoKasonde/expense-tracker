import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FeedbackButton } from "./feedback-button";

const mocks = vi.hoisted(() => ({ apiCall: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/today",
}));
vi.mock("@/lib/client-api", () => ({
  useApiCall: () => mocks.apiCall,
}));

describe("FeedbackButton", () => {
  beforeEach(() => {
    mocks.apiCall.mockReset();
    mocks.apiCall.mockResolvedValue({ id: "feedback-1" });
  });

  it("opens the dialog, submits the message and current page, then closes", async () => {
    render(<FeedbackButton className="btn">Send feedback</FeedbackButton>);

    fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));
    expect(await screen.findByRole("heading", { name: "Send feedback" })).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("What's on your mind?"), {
      target: { value: "The dashboard whitespace looks great now!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(mocks.apiCall).toHaveBeenCalledWith("/v1/feedback", {
        method: "POST",
        body: { message: "The dashboard whitespace looks great now!", pagePath: "/today" },
      }),
    );
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Send feedback" })).not.toBeInTheDocument());
  });

  it("blocks an empty submission", async () => {
    render(<FeedbackButton className="btn">Send feedback</FeedbackButton>);
    fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));
    await screen.findByRole("heading", { name: "Send feedback" });

    // The textarea is `required`, so the browser itself refuses to submit an
    // empty message; the trimmed-whitespace check in handleSubmit is the
    // fallback for a message that is nothing but spaces.
    fireEvent.change(screen.getByPlaceholderText("What's on your mind?"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Enter what you'd like to tell us.")).toBeInTheDocument();
    expect(mocks.apiCall).not.toHaveBeenCalled();
  });
});
