import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "./login-form";

const mocks = vi.hoisted(() => ({
  establishApiSession: vi.fn(),
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

vi.mock("@/lib/browser-auth", () => ({
  establishApiSession: mocks.establishApiSession,
}));

describe("LoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps credentials visible and shows progress while signing in", async () => {
    let finishApiSession: (() => void) | undefined;
    mocks.establishApiSession.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishApiSession = resolve;
        }),
    );

    render(<LoginForm />);

    const email = screen.getByLabelText("Email");
    const password = screen.getByLabelText("Password");
    fireEvent.change(email, { target: { value: "test@example.com" } });
    fireEvent.change(password, { target: { value: "expenses2026" } });
    fireEvent.submit(screen.getByRole("button", { name: "Sign in" }).closest("form")!);

    expect(email).toHaveValue("test@example.com");
    expect(password).toHaveValue("expenses2026");
    expect(email).toBeDisabled();
    expect(password).toBeDisabled();
    expect(screen.getByRole("button", { name: /Signing you in/ })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Securing your session");

    finishApiSession?.();
    mocks.signIn.mockResolvedValue({ ok: true });

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/today"));
  });
});
