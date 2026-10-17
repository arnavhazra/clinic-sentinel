import { json, options } from "@/lib/http";
import { verifyState, type VerifyMode } from "@/lib/verification";

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

  const mode = (body as { mode?: unknown }).mode;
  if (mode !== "A" && mode !== "B" && mode !== "C") {
    return json({ error: "mode must be A, B, or C" }, 400);
  }

  return json(verifyState(mode as VerifyMode));
}
