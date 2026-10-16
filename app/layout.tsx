import type { Metadata, Viewport } from "next";
import { FluentProviders } from "@/components/theme/fluent-providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Hearthline Dispatch", template: "%s · Hearthline Dispatch" },
  description: "Van stock and dispatch for Hearthline field technicians",
};

export const viewport: Viewport = {
  themeColor: "#0A7976",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <FluentProviders>{children}</FluentProviders>
      </body>
    </html>
  );
}
