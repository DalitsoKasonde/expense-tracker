import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "./login-form";

const mocks = vi.hoisted(() => ({
  establishApiSession: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  signIn: vi.fn(),
  getSession: vi.fn(),
  postPublicJson: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  signIn: mocks.signIn,
  getSession: mocks.getSession,
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

vi.mock("@/lib/public-api", () => ({
  postPublicJson: mocks.postPublicJson,
}));

describe("LoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { role: "member" } });
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

  it("sends system administrators to the isolated admin console", async () => {
    mocks.establishApiSession.mockResolvedValue(undefined);
    mocks.signIn.mockResolvedValue({ ok: true });
    mocks.getSession.mockResolvedValue({ user: { role: "system_admin" } });

    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ops@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "expenses2026" } });
    fireEvent.submit(screen.getByRole("button", { name: "Sign in" }).closest("form")!);

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/admin"));
  });

  it("requests and verifies a six-digit email code", async () => {
    mocks.postPublicJson.mockResolvedValue(null);
    mocks.signIn.mockResolvedValue({ ok: true });

    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "person@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Email me a sign-in code" }));

    await waitFor(() => expect(mocks.postPublicJson).toHaveBeenCalledWith("/v1/auth/pin/request", { email: "person@example.com" }));
    fireEvent.change(screen.getByLabelText("Six-digit code"), { target: { value: "123456" } });
    fireEvent.submit(screen.getByRole("button", { name: "Verify code" }).closest("form")!);

    await waitFor(() => expect(mocks.signIn).toHaveBeenCalledWith("email-pin", {
      email: "person@example.com",
      pin: "123456",
      redirect: false,
    }));
    expect(mocks.establishApiSession).not.toHaveBeenCalled();
  });

  it("starts Google sign-in when it is configured", async () => {
    mocks.signIn.mockResolvedValue(undefined);
    render(<LoginForm googleEnabled />);

    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    expect(mocks.signIn).toHaveBeenCalledWith("google", { callbackUrl: "/today" });
  });
});
