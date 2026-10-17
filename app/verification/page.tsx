import type { Metadata } from "next";
import { VerificationConsole } from "@/components/VerificationConsole";

export const metadata: Metadata = { title: "External State" };

export default function VerificationPage() {
  return <VerificationConsole />;
}
