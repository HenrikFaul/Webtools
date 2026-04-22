import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "VibeCoding toolset",
  description: "Modular diagnostics workbench for API troubleshooting"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
