import type { Metadata } from "next";
import { FirewallConsole } from "@/components/FirewallConsole";
import { ALLOWLIST } from "@/lib/firewall";

export const metadata: Metadata = { title: "Allowlist" };

export default function FirewallPage() {
  return <FirewallConsole allowlist={ALLOWLIST} />;
}
