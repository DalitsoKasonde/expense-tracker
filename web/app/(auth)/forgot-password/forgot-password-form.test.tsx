import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForgotPasswordForm } from "./forgot-password-form";

const mocks = vi.hoisted(() => ({
  postPublicJson: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock("@/lib/public-api", () => ({
  postPublicJson: mocks.postPublicJson,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => mocks.searchParams,
}));

describe("ForgotPasswordForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.postPublicJson.mockResolvedValue(null);
    mocks.searchParams = new URLSearchParams();
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

  // Carried from the sign-in page, so a forgotten password does not also cost
  // retyping the address that was already on screen.
  it("prefills the address handed over by the sign-in page", () => {
    mocks.searchParams = new URLSearchParams("email=Person%40Example.COM");
    render(<ForgotPasswordForm />);

    expect(screen.getByLabelText("Email")).toHaveValue("person@example.com");
  });

  // Confirming "we sent it" for an unknown address is the point: saying
  // otherwise would turn this form into a way to find out who has an account.
  it("gives the same answer whether or not the address is registered", async () => {
    render(<ForgotPasswordForm />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "stranger@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Email me a reset link" }));

    const confirmation = await screen.findByRole("status");
    expect(confirmation).toHaveTextContent("has an account");
    expect(confirmation).not.toHaveTextContent(/we (have )?sent/i);
  });

  // Naming the address is what lets a typo be caught before spending ten
  // minutes waiting for mail that was never addressed to you.
  it("names the address it used so a typo is visible", async () => {
    render(<ForgotPasswordForm />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "persen@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Email me a reset link" }));

    expect(await screen.findByRole("status")).toHaveTextContent("persen@example.com");
  });

  it("lets a mistyped address be corrected without reloading the page", async () => {
    render(<ForgotPasswordForm />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "persen@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Email me a reset link" }));

    fireEvent.click(await screen.findByRole("button", { name: "Use a different address" }));

    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
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
