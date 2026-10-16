import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SignInForm } from "@/components/sign-in/sign-in-form";
import type { SignInResult } from "@/lib/auth/sign-in";
import { renderWithFluent } from "../support/render";

const email = () => screen.getByRole("textbox", { name: /email/i });
const password = () => screen.getByLabelText(/^password/i, { selector: "input" });
const submit = () => screen.getByRole("button", { name: /sign in|signing in/i });

describe("SignInForm", () => {
  it("shows field errors on submit, marks the fields invalid and focuses the first one", async () => {
    const onSignIn = vi.fn();
    const { user } = renderWithFluent(<SignInForm onSignIn={onSignIn} />);

    await user.click(submit());

    expect(screen.getByText("Enter your email address")).toBeVisible();
    expect(screen.getByText("Enter your password")).toBeVisible();
    expect(email()).toHaveAttribute("aria-invalid", "true");
    expect(email()).toHaveAccessibleDescription("Enter your email address");
    expect(email()).toHaveFocus();
    expect(onSignIn).not.toHaveBeenCalled();
  });

  it("re-validates as you type once errors are showing", async () => {
    const { user } = renderWithFluent(<SignInForm onSignIn={vi.fn()} />);

    await user.click(submit());
    await user.type(email(), "dispatcher@");
    expect(screen.getByText("Enter an email address like name@example.com")).toBeVisible();

    await user.type(email(), "example.test");
    expect(screen.queryByText(/enter an email address/i)).not.toBeInTheDocument();
    expect(email()).not.toHaveAttribute("aria-invalid", "true");
  });

  it("toggles password visibility with a labelled, pressed-state button", async () => {
    const { user } = renderWithFluent(<SignInForm onSignIn={vi.fn()} />);
    const toggle = screen.getByRole("button", { name: "Show password" });

    expect(password()).toHaveAttribute("type", "password");
    await user.click(toggle);
    expect(password()).toHaveAttribute("type", "text");
    expect(toggle).toHaveAttribute("aria-pressed", "true");
  });

  it("shows a loading state while signing in and ignores repeat submits", async () => {
    let finish!: (result: SignInResult) => void;
    const onSignIn = vi.fn(() => new Promise<SignInResult>((resolve) => (finish = resolve)));
    const { user } = renderWithFluent(<SignInForm onSignIn={onSignIn} />);

    await user.type(email(), "dispatcher@example.test");
    await user.type(password(), "test-password");
    await user.click(submit());

    expect(submit()).toHaveTextContent("Signing in…");
    expect(submit()).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("form", { name: "Sign in" })).toHaveAttribute("aria-busy", "true");
    await user.click(submit());
    expect(onSignIn).toHaveBeenCalledTimes(1);
    expect(onSignIn).toHaveBeenCalledWith({ email: "dispatcher@example.test", password: "test-password" });

    finish({ ok: false, message: "Sign-in isn't connected yet." });
    expect(await screen.findByText("Sign-in isn't connected yet.")).toBeVisible();
    expect(submit()).toHaveTextContent("Sign in");
  });

  it("reports an unexpected failure without losing what was typed", async () => {
    const { user } = renderWithFluent(<SignInForm onSignIn={() => Promise.reject(new Error("offline"))} />);

    await user.type(email(), "dispatcher@example.test");
    await user.type(password(), "test-password");
    await user.click(submit());

    expect(await screen.findByText("Something went wrong while signing in. Try again.")).toBeVisible();
    expect(email()).toHaveValue("dispatcher@example.test");
  });

  it("calls onSignedIn only when the handler reports success", async () => {
    const onSignedIn = vi.fn();
    const { user } = renderWithFluent(<SignInForm onSignIn={async () => ({ ok: true })} onSignedIn={onSignedIn} />);

    await user.type(email(), "dispatcher@example.test");
    await user.type(password(), "test-password{Enter}");

    await vi.waitFor(() => expect(onSignedIn).toHaveBeenCalledTimes(1));
  });
});
