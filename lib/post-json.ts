export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) {
    const message = data && typeof data.error === "string" ? data.error : `Request failed (${response.status})`;
    throw new Error(message);
  }
  if (!data) throw new Error("Empty response");
  return data;
}
