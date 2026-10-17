"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { AuthUser } from "@/lib/auth/user";
const AuthUserContext = createContext<AuthUser | null>(null);
export function AuthUserProvider({ user, children }: { user: AuthUser; children: ReactNode }) {
  return <AuthUserContext.Provider value={user}>{children}</AuthUserContext.Provider>;
}
export function useAuthUser() {
  const user = useContext(AuthUserContext);
  if (!user) throw new Error("Authenticated user provider is required");
  return user;
}
