import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForgotPasswordForm } from "./forgot-password-form";

const mocks = vi.hoisted(() => ({
  postPublicJson: vi.fn(),
}));

vi.mock("@/lib/public-api", () => ({
  postPublicJson: mocks.postPublicJson,
}));

describe("ForgotPasswordForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.postPublicJson.mockResolvedValue(null);
  });

  it("normalises the address before asking for a link", async () => {
    render(<ForgotPasswordForm />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "  Person@Example.COM " } });
    fireEvent.click(screen.getByRole("button", { name: "Email me a reset link" }));

    await waitFor(() => {
      expect(mocks.postPublicJson).toHaveBeenCalledWith("/v1/auth/forgot-password", {
        email: "person@example.com",
      });
    });
  });

  // Confirming "we sent it" for an unknown address is the point: saying
  // otherwise would turn this form into a way to find out who has an account.
  it("gives the same answer whether or not the address is registered", async () => {
    render(<ForgotPasswordForm />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "stranger@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Email me a reset link" }));

    const confirmation = await screen.findByRole("status");
    expect(confirmation).toHaveTextContent("If that address has an account");
  });

  it("surfaces a server failure instead of claiming the link was sent", async () => {
    mocks.postPublicJson.mockRejectedValue(new Error("password reset is temporarily unavailable"));
    render(<ForgotPasswordForm />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "person@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Email me a reset link" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("password reset is temporarily unavailable");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
