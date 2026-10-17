import type { Metadata } from "next";
import Link from "next/link";
import { Mark } from "@/components/ui";

export const metadata: Metadata = { title: { absolute: "Sentinel" } };

const GATES = [
  {
    href: "/budget",
    index: "01",
    name: "Cent-budget circuit breaker",
    check: "call_budget_cents",
    invariant:
      "Before every model call, cumulative cents plus the next turn must fit the clinic column. If it doesn't, the turn finishes on the floor model and the reason is written down.",
    stop: "Retry loops on a price objection",
  },
  {
    href: "/handoff",
    index: "02",
    name: "Researcher → writer diff",
    check: "raw_api_response",
    invariant:
      "Any number in the handoff memo has to sit next to the raw API payload. An n8n diff runs before the writer can text the patient. No payload, the run fails.",
    stop: "Invented discounts and dropped contraindications",
  },
  {
    href: "/verification",
    index: "03",
    name: "External state gate",
    check: "ignore self_report",
    invariant:
      "The agent cannot mark its own task done. Status flips only when a separate check finds the Supabase row or the GHL calendar id.",
    stop: "Hallucinated bookings and silent webhook drops",
  },
  {
    href: "/firewall",
    index: "04",
    name: "Hostname allowlist",
    check: "can_call(host)",
    invariant:
      "The model never sees the list. It asks, a plain function answers yes or no, and the hostnames are hand-typed. No wildcards.",
    stop: "Webhook exfiltration and suffix tricks",
  },
];

export default function HomePage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-400">Sentinel</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">Voice and GHL agent governance kernel</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            Four production gates for Apex Longevity & Peptide Clinic. The model speaks. These checks decide whether the turn, the memo, the booking, or the outbound call is allowed to continue.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Mark tone="pass">Outcome priced</Mark>
          <Mark tone="idle">Zero login</Mark>
        </div>
      </div>

      <ol className="grid gap-3 md:grid-cols-2">
        {GATES.map((gate) => (
          <li key={gate.href} className="border border-zinc-800 bg-[#0c0c0e]">
            <Link href={gate.href} className="block p-4 hover:bg-zinc-900/50">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-[10px] tracking-[0.16em] text-zinc-500">{gate.index}</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-emerald-400">{gate.check}</span>
              </div>
              <h2 className="mt-3 text-base font-medium text-zinc-100">{gate.name}</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">{gate.invariant}</p>
              <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">Stops · {gate.stop}</div>
            </Link>
          </li>
        ))}
      </ol>

      <section className="border border-zinc-800 bg-[#0c0c0e] p-4">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Call path</h2>
        <ol className="mt-3 grid gap-2 font-mono text-[11px] leading-5 text-zinc-300 md:grid-cols-2">
          <li>1. Read clinic_apex_longevity.call_budget_cents</li>
          <li>2. Pre-call predicate, then frontier or floor model</li>
          <li>3. Researcher returns numbers only with raw EHR JSON</li>
          <li>4. Diff gate halts the writer on ungrounded figures</li>
          <li>5. Ignore agent “done”. Require evt id or appointments row</li>
          <li>6. can_call(hostname) against the hand-typed list</li>
        </ol>
        <div className="mt-4">
          <a
            href="/sentinel-n8n-guardrails.json"
            download
            className="font-mono text-[11px] uppercase tracking-[0.14em] text-emerald-300 underline decoration-emerald-400/40 underline-offset-4"
          >
            Download n8n workflow JSON
          </a>
        </div>
      </section>
    </div>
  );
}
