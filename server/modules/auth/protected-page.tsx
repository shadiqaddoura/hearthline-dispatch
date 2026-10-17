import "server-only";
import type { ReactNode } from "react";
import { requirePageUser } from "./request";

/** Rechecks each page navigation, even when the shared layout is retained by the router. */
export async function ProtectedPage({ children }: { children: ReactNode }) {
  await requirePageUser();
  return children;
}
