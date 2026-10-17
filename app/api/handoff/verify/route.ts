import { verifyHandoff } from "@/lib/handoff";
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
  if (typeof record.memo !== "string" || record.memo.length > 20_000) {
    return json({ error: "memo must be a string under 20000 characters" }, 400);
  }
  if (record.raw_text !== null && typeof record.raw_text !== "string") {
    return json({ error: "raw_text must be a string or null" }, 400);
  }
  if (typeof record.raw_text === "string" && record.raw_text.length > 200_000) {
    return json({ error: "raw_text is too large" }, 400);
  }

  return json(verifyHandoff(record.memo, record.raw_text));
}
