import type { Metadata } from "next";
import { RestockingView } from "@/components/restocking/restocking-view";

export const metadata: Metadata = { title: "Restocking" };

export default function RestockingPage() {
  return <RestockingView />;
}
