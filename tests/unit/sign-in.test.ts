import { describe, expect, it } from "vitest";
import { validateSignIn } from "@/lib/auth/sign-in";

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
