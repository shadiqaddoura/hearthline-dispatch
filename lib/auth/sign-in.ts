// Sign-in form rules and the handler the form calls. Independent of any UI library.
import { z } from "zod";

export const signInSchema = z.object({
  email: z.string().trim().min(1, "Enter your email address").pipe(z.email("Enter an email address like name@example.com")),
  password: z.string().min(1, "Enter your password"),
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

export const AUTH_NOT_CONNECTED_MESSAGE =
  "Sign-in isn't connected yet. This preview doesn't check or send your credentials. Use the demo entry below to look around.";

/**
 * Hearthline has no authentication yet. This stands where a real sign-in call
 * will go: it never checks the credentials, never sends them anywhere, and
 * always reports that sign-in is unavailable.
 */
export const previewSignIn: SignInHandler = async () => ({ ok: false, message: AUTH_NOT_CONNECTED_MESSAGE });
