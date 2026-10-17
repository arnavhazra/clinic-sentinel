import type { Metadata } from "next";
import { Shell } from "@/components/Shell";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Regenix Sentinel",
    template: "%s · Regenix Sentinel",
  },
  description:
    "Per-clinic cent budget, handoff payload diff, external state verification, and hostname allowlist for peptide-clinic voice and GHL agents.",
};

export const viewport = {
  themeColor: "#09090b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
