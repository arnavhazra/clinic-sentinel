import { json, options } from "@/lib/http";

export function GET() {
  return json({ status: "ok", service: "regenix-sentinel", gates: 4 });
}

export function OPTIONS() {
  return options();
}
