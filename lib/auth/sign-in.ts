// Sign-in form rules and the handler the form calls. Independent of any UI library.
import { z } from "zod";

export const signInSchema = z.object({
  email: z.string().trim().min(1, "Enter your email address").pipe(z.email("Enter an email address like name@example.com")),
  password: z.string().min(1, "Enter your password").max(1024),
});

export type SignInCredentials = z.input<typeof signInSchema>;
export type SignInFieldErrors = Partial<Record<keyof SignInCredentials, string>>;

/** The first message for each invalid field, or an empty object when the form is valid. */
export function validateSignIn(values: SignInCredentials): SignInFieldErrors {
  const result = signInSchema.safeParse(values);
  if (result.success) return {};
  const errors: SignInFieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof SignInCredentials;
    errors[field] ??= issue.message;
  }
  return errors;
}

export type SignInResult = { ok: true } | { ok: false; message: string };
export type SignInHandler = (credentials: SignInCredentials) => Promise<SignInResult>;

/** Calls the server; the session token is only ever delivered in an HttpOnly cookie. */
export const signIn: SignInHandler = async (credentials) => {
  const response = await fetch("/api/auth/sign-in", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(credentials),
  });
  if (response.ok) return { ok: true };
  const result = await response.json();
  return { ok: false, message: result.error?.message ?? "Unable to sign in. Please try again." };
};
