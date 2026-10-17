import { runCall } from "@/lib/breaker";
import { json, options } from "@/lib/http";

export function OPTIONS() {
  return options();
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (!body || typeof body !== "object") return json({ error: "invalid_body" }, 400);

  const record = body as Record<string, unknown>;
  const budget = record.budget_cents;
  if (typeof budget !== "number" || !Number.isFinite(budget) || budget < 0 || budget > 500) {
    return json({ error: "budget_cents must be a number from 0 to 500" }, 400);
  }

  const through = record.through_turn;
  if (
    through !== undefined &&
    (typeof through !== "number" || !Number.isInteger(through) || through < 1 || through > 6)
  ) {
    return json({ error: "through_turn must be an integer from 1 to 6" }, 400);
  }

  return json(
    runCall({
      budget_cents: budget,
      inject_spike: Boolean(record.inject_spike),
      through_turn: typeof through === "number" ? through : 6,
      call_id: typeof record.call_id === "string" ? record.call_id : undefined,
      started_at_ms: typeof record.started_at_ms === "number" ? record.started_at_ms : undefined,
    }),
  );
}
