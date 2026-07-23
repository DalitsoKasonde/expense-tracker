import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RegisterForm } from "./register-form";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  signIn: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  signIn: mocks.signIn,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mocks.push,
    refresh: mocks.refresh,
  }),
}));

vi.mock("@/lib/client-api", () => ({
  getApiBaseUrl: () => "/api",
}));

function completeRegistrationForm(password: string, confirmation = password) {
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Test User" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "test@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
  fireEvent.change(screen.getByLabelText("Confirm Password"), { target: { value: confirmation } });
}

describe("RegisterForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mocks.fetch);
  });

  it("shows password requirements as the user types", () => {
    render(<RegisterForm />);

    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "onlyletters" } });

    expect(screen.getByText("Includes a letter and a number").closest("li")).not.toHaveClass("text-income");
    expect(screen.getByLabelText("Password")).toHaveAttribute("aria-invalid", "true");
  });

  it("shows a mismatch before submission", () => {
    render(<RegisterForm />);

    completeRegistrationForm("chuma2026", "chuma2027");

    expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm Password")).toHaveAttribute("aria-invalid", "true");
  });

  it("creates the user through the same-origin API and signs in", async () => {
    mocks.fetch.mockResolvedValue(new Response(null, { status: 201 }));
    mocks.signIn.mockResolvedValue({ ok: true });
    render(<RegisterForm />);

    completeRegistrationForm("chuma2026");
    fireEvent.submit(screen.getByRole("button", { name: "Create account" }).closest("form")!);

    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalledWith(
        "/api/v1/auth/register",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            email: "test@example.com",
            password: "chuma2026",
            displayName: "Test User",
          }),
        }),
      );
    });
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/today"));
  });

  it("shows the API error when registration is rejected", async () => {
    mocks.fetch.mockResolvedValue(new Response("email already registered", { status: 409 }));
    render(<RegisterForm />);

    completeRegistrationForm("chuma2026");
    fireEvent.submit(screen.getByRole("button", { name: "Create account" }).closest("form")!);

    expect(await screen.findByRole("alert")).toHaveTextContent("email already registered");
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
});
