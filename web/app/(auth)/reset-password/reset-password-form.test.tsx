import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResetPasswordForm } from "./reset-password-form";

const mocks = vi.hoisted(() => ({
  postPublicJson: vi.fn(),
  push: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock("@/lib/public-api", () => ({
  postPublicJson: mocks.postPublicJson,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => mocks.searchParams,
}));

function fillPasswords(password: string, confirmation = password) {
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: password } });
  fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: confirmation } });
}

describe("ResetPasswordForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.postPublicJson.mockResolvedValue(null);
    mocks.searchParams = new URLSearchParams("token=reset-token");
  });

  it("sends the token from the link with the new password", async () => {
    render(<ResetPasswordForm />);

    fillPasswords("correcthorse1");
    fireEvent.click(screen.getByRole("button", { name: "Set new password" }));

    await waitFor(() => {
      expect(mocks.postPublicJson).toHaveBeenCalledWith("/v1/auth/reset-password", {
        token: "reset-token",
        password: "correcthorse1",
      });
    });
  });

  // The token is single use, so a mismatch caught in the browser saves the
  // person from having to request a whole new email.
  it("refuses to spend the token when the passwords do not match", async () => {
    render(<ResetPasswordForm />);

    fillPasswords("correcthorse1", "correcthorse2");
    fireEvent.click(screen.getByRole("button", { name: "Set new password" }));

    expect(await screen.findAllByRole("alert")).not.toHaveLength(0);
    expect(mocks.postPublicJson).not.toHaveBeenCalled();
  });

  it("refuses to spend the token on a password the API would reject", async () => {
    render(<ResetPasswordForm />);

    fillPasswords("short1");
    fireEvent.click(screen.getByRole("button", { name: "Set new password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("at least 8 characters");
    expect(mocks.postPublicJson).not.toHaveBeenCalled();
  });

  it("explains what to do when the link carries no token", () => {
    mocks.searchParams = new URLSearchParams();
    render(<ResetPasswordForm />);

    expect(screen.getByRole("alert")).toHaveTextContent("missing its code");
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ask for a new link" })).toBeInTheDocument();
  });

  // A spent link cannot be retried, so leaving the form on screen only invites
  // the same failure a second time.
  it("offers a new link instead of the form when the token is already spent", async () => {
    mocks.postPublicJson.mockRejectedValue(new Error("this reset link is invalid or has expired"));
    render(<ResetPasswordForm />);

    fillPasswords("correcthorse1");
    fireEvent.click(screen.getByRole("button", { name: "Set new password" }));

    expect(await screen.findByRole("link", { name: "Ask for a new link" })).toBeInTheDocument();
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
  });

  // Any other failure is retryable, so the typed password must survive it.
  it("keeps the form up when the failure is not the link", async () => {
    mocks.postPublicJson.mockRejectedValue(new Error("password reset is temporarily unavailable"));
    render(<ResetPasswordForm />);

    fillPasswords("correcthorse1");
    fireEvent.click(screen.getByRole("button", { name: "Set new password" }));

    expect(await screen.findByText("password reset is temporarily unavailable")).toBeInTheDocument();
    expect(screen.getByLabelText("New password")).toBeInTheDocument();
  });

  // The rules were already evaluated on every keystroke and then collapsed
  // into one boolean, so the only way to find out was to submit.
  it("shows which password rules are met while typing", () => {
    render(<ResetPasswordForm />);

    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "short" } });

    expect(screen.getByText("At least 8 characters")).toBeInTheDocument();
    expect(screen.getByText("Contains a letter and a number")).toBeInTheDocument();
  });

  it("points the person at sign in once the password is set", async () => {
    render(<ResetPasswordForm />);

    fillPasswords("correcthorse1");
    fireEvent.click(screen.getByRole("button", { name: "Set new password" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Your password is set");
  });
});
