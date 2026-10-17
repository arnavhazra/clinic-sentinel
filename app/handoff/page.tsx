import type { Metadata } from "next";
import { HandoffConsole } from "@/components/HandoffConsole";

export const metadata: Metadata = { title: "Payload Diff" };

export default function HandoffPage() {
  return <HandoffConsole />;
}
