import { canCall } from "@/lib/firewall";
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

  const url = (body as { url?: unknown }).url;
  if (typeof url !== "string") return json({ error: "url must be a string" }, 400);

  const result = canCall(url);
  return json({ ...result, logged: true });
}
