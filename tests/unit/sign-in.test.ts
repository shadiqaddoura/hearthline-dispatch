import { describe, expect, it } from "vitest";
import { AUTH_NOT_CONNECTED_MESSAGE, previewSignIn, validateSignIn } from "@/lib/auth/sign-in";

describe("validateSignIn", () => {
  it("asks for both fields when they are empty", () => {
    expect(validateSignIn({ email: " ", password: "" })).toEqual({
      email: "Enter your email address",
      password: "Enter your password",
    });
  });

  it("rejects a malformed email with one message", () => {
    expect(validateSignIn({ email: "dispatcher@", password: "x" })).toEqual({
      email: "Enter an email address like name@example.com",
    });
  });

  it("accepts a well-formed email with surrounding spaces", () => {
    expect(validateSignIn({ email: "  dispatcher@example.test ", password: "x" })).toEqual({});
  });
});

describe("previewSignIn", () => {
  it("never signs anyone in: there is no authentication to check against", async () => {
    await expect(previewSignIn({ email: "dispatcher@example.test", password: "anything" })).resolves.toEqual({
      ok: false,
      message: AUTH_NOT_CONNECTED_MESSAGE,
    });
  });
});
