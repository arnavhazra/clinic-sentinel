import type { Metadata } from "next";
import { BudgetConsole } from "@/components/BudgetConsole";
import { runCall } from "@/lib/breaker";

export const metadata: Metadata = { title: "Cent Budget" };

export default function BudgetPage() {
  const reference = runCall({
    budget_cents: 35,
    inject_spike: true,
    through_turn: 6,
    call_id: "call_reference35",
    started_at_ms: 0,
  });

  return (
    <BudgetConsole
      reference={{
        governed_cost_cents: reference.governed_cost_cents,
        unmanaged_cost_cents: reference.unmanaged_cost_cents,
        budget_cents: reference.budget_cents,
      }}
    />
  );
}
