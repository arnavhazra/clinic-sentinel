"use client";

import { useRef, useState } from "react";
import { centLabel, dollars, type AuditRow, type CallRun } from "@/lib/breaker";
import { postJson } from "@/lib/post-json";
import { Action, Mark, Panel } from "@/components/ui";

type Session = {
  call_id: string;
  started_at_ms: number;
  budget_cents: number;
  inject_spike: boolean;
  through: number;
};

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function BurnBar({ run }: { run: CallRun }) {
  const refused = run.turns.reduce((sum, turn) => {
    if (turn.decision !== "TRIP") return sum;
    return sum + Math.max(0, turn.projected_turn_cents - turn.actual_turn_cents);
  }, 0);
  const scale = Math.max(run.budget_cents, run.cumulative_cost_cents + refused, run.unmanaged_cost_cents, 1);
  const marker = Math.min(100, (run.budget_cents / scale) * 100);

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1 flex justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
          <span>Governed burn</span>
          <span>{centLabel(run.cumulative_cost_cents)}</span>
        </div>
        <div className="relative h-8 bg-zinc-900">
          <div className="absolute inset-y-0 left-0 flex">
            {run.turns.map((turn) => (
              <div
                key={turn.turn_index}
                title={`T${turn.turn_index} ${turn.model} ${centLabel(turn.actual_turn_cents)}`}
                className={`h-full border-r border-zinc-950 ${turn.price_class === "floor" ? "bg-amber-400" : "bg-emerald-400"}`}
                style={{ width: `${(turn.actual_turn_cents / scale) * 100}%` }}
              />
            ))}
            {refused > 0 ? (
              <div
                title="Refused projection"
                className="h-full bg-rose-500/70"
                style={{ width: `${(refused / scale) * 100}%` }}
              />
            ) : null}
          </div>
          <div className="absolute inset-y-0 w-px bg-zinc-100" style={{ left: `${marker}%` }} />
        </div>
        <div className="mt-1 font-mono text-[10px] text-zinc-500">White tick is the clinic budget. Rose is spend the breaker refused.</div>
      </div>
      <div>
        <div className="mb-1 flex justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
          <span>Unmanaged counterfactual</span>
          <span>{centLabel(run.unmanaged_cost_cents)}</span>
        </div>
        <div className="h-3 bg-zinc-900">
          <div className="h-full bg-rose-400/80" style={{ width: `${(run.unmanaged_cost_cents / scale) * 100}%` }} />
        </div>
      </div>
    </div>
  );
}

function decisionTone(decision: CallRun["turns"][number]["decision"]): "pass" | "warn" | "fail" {
  if (decision === "PASS") return "pass";
  if (decision === "LATCHED") return "warn";
  return "fail";
}

export function BudgetConsole({
  reference,
}: {
  reference: { governed_cost_cents: number; unmanaged_cost_cents: number; budget_cents: number };
}) {
  const [budget, setBudget] = useState(35);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<CallRun | null>(null);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const seq = useRef(0);

  function mergeAudit(data: CallRun) {
    setRows((prev) => {
      const rest = prev.filter((row) => row.call_id !== data.call_id);
      return data.audit_rows.length > 0 ? [...data.audit_rows, ...rest] : rest;
    });
  }

  async function runLive(spike: boolean) {
    const token = ++seq.current;
    setBusy(true);
    setError(null);
    setArmed(spike);
    const call_id = `call_${Date.now().toString(36)}`;
    const started_at_ms = Date.now();
    const budget_cents = budget;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    try {
      let latest: CallRun | null = null;
      for (let through_turn = 1; through_turn <= 6; through_turn += 1) {
        const data = await postJson<CallRun>("/api/breaker/run", {
          budget_cents,
          inject_spike: spike,
          through_turn,
          call_id,
          started_at_ms,
        });
        if (seq.current !== token) return;
        latest = data;
        setRun(data);
        mergeAudit(data);
        if (through_turn < 6 && !reduce) await wait(380);
      }
      if (latest && seq.current === token) {
        setSession({
          call_id,
          started_at_ms,
          budget_cents,
          inject_spike: spike,
          through: 6,
        });
      }
    } catch (err) {
      if (seq.current === token) setError(err instanceof Error ? err.message : "Breaker API failed.");
    } finally {
      if (seq.current === token) setBusy(false);
    }
  }

  async function step() {
    const token = ++seq.current;
    setBusy(true);
    setError(null);
    const continuing = session !== null && session.through < 6;
    const next: Session = continuing
      ? { ...session, through: session.through + 1 }
      : {
          call_id: `call_${Date.now().toString(36)}`,
          started_at_ms: Date.now(),
          budget_cents: budget,
          inject_spike: armed,
          through: 1,
        };
    try {
      const data = await postJson<CallRun>("/api/breaker/run", {
        budget_cents: next.budget_cents,
        inject_spike: next.inject_spike,
        through_turn: next.through,
        call_id: next.call_id,
        started_at_ms: next.started_at_ms,
      });
      if (seq.current !== token) return;
      setSession(next);
      setRun(data);
      mergeAudit(data);
    } catch (err) {
      if (seq.current === token) setError(err instanceof Error ? err.message : "Breaker API failed.");
    } finally {
      if (seq.current === token) setBusy(false);
    }
  }

  const latest = run?.audit_rows[0] ?? rows[0] ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-emerald-400">Gate 01 · Supabase column</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Cent-budget call circuit breaker</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
          Live intake for Jordan Hale at Apex Longevity. Frontier turns bill at 6.20¢ on claude-opus-4-6, priced with gpt-5. The floor model is gemini-2.5-flash-lite at 0.18¢. Predicate: cumulative_cost_cents + projected_turn_cents &gt; call_budget_cents.
        </p>
      </div>

      <Panel
        title="call_budget_cents"
        aside={<Mark tone={armed ? "warn" : "idle"}>{armed ? "Spike armed" : "Spike clear"}</Mark>}
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
          <label className="block">
            <span className="flex items-baseline justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">Clinic budget</span>
              <span className="font-mono text-2xl tabular-nums text-zinc-50">{budget}¢</span>
            </span>
            <input
              type="range"
              min={8}
              max={160}
              step={1}
              value={budget}
              aria-valuemin={8}
              aria-valuemax={160}
              aria-valuenow={budget}
              aria-label="Clinic call budget in cents"
              onChange={(event) => setBudget(Number(event.target.value))}
              className="mt-3"
            />
            <span className="mt-1 block font-mono text-[10px] text-zinc-500">8¢ to 160¢ · checked before every turn · new runs pick up the slider</span>
          </label>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Action tone="pass" disabled={busy} onClick={() => void runLive(armed)}>
              Run live 6-turn patient call
            </Action>
            <Action disabled={busy} onClick={() => void step()}>
              Step turn
            </Action>
            <Action tone="warn" disabled={busy} onClick={() => void runLive(true)}>
              Inject retry loop / price objection
            </Action>
            <Action disabled={busy || !armed} onClick={() => setArmed(false)}>
              Clear spike
            </Action>
          </div>
        </div>
        {error ? <p className="mt-3 font-mono text-xs text-rose-300">{error}</p> : null}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.8fr)]">
        <Panel
          title="Voice transcript"
          aside={
            run ? (
              <Mark tone={run.outcome === "APPOINTMENT_BOOKED" ? "pass" : "idle"}>{run.outcome}</Mark>
            ) : (
              <Mark tone="idle">Idle</Mark>
            )
          }
        >
          {run ? (
            <ol className="space-y-3" aria-busy={busy}>
              {run.turns.map((turn) => (
                <li key={turn.turn_index} className="border border-zinc-800 bg-zinc-950 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px] text-zinc-500">T{turn.turn_index}</span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400">{turn.phase}</span>
                    <Mark tone={decisionTone(turn.decision)}>{turn.decision}</Mark>
                    <span className="font-mono text-[10px] text-zinc-400">
                      {turn.model}
                      {turn.peer ? ` / ${turn.peer}` : ""} · {centLabel(turn.actual_turn_cents)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-zinc-300">
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">Patient · </span>
                    {turn.patient}
                  </p>
                  <p className="mt-1 text-sm text-zinc-100">
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">Agent · </span>
                    {turn.agent}
                  </p>
                  <p className="mt-2 font-mono text-[11px] text-zinc-400">
                    CHECK {turn.predicate}
                    {turn.tripped_at ? ` · tripped_at ${turn.tripped_at}` : ""}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm leading-6 text-zinc-400">
              Six turns: greet, chart, thyroid screen, price objection, Thursday 2:00 PM, commit. The booking stays up when the breaker trips. Run the call, or arm the retry loop first.
            </p>
          )}
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel title="Cost per booked appointment">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">This call</div>
                <div className="mt-1 font-mono text-3xl tabular-nums text-emerald-300">
                  {run ? dollars(run.governed_cost_cents) : "—"}
                </div>
                <div className="font-mono text-[11px] text-zinc-500">{run ? centLabel(run.governed_cost_cents) : "Waiting"}</div>
              </div>
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">Unmanaged</div>
                <div className="mt-1 font-mono text-3xl tabular-nums text-rose-300">
                  {run ? dollars(run.unmanaged_cost_cents) : dollars(reference.unmanaged_cost_cents)}
                </div>
                <div className="font-mono text-[11px] text-zinc-500">
                  {run ? centLabel(run.unmanaged_cost_cents) : `${centLabel(reference.unmanaged_cost_cents)} at ${reference.budget_cents}¢ + spike`}
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs leading-5 text-zinc-400">
              Reference at a {reference.budget_cents}¢ budget with the price-objection loop: governed {dollars(reference.governed_cost_cents)} versus unmanaged {dollars(reference.unmanaged_cost_cents)}. The loop projects 109.00¢ on the frontier model. The breaker refuses that projection and finishes the turn at 0.18¢.
            </p>
            {run ? <div className="mt-3"><BurnBar run={run} /></div> : null}
          </Panel>
          <Panel title="Downgrade reason">
            {latest ? (
              <p className="font-mono text-[11px] leading-5 text-amber-100">{latest.downgrade_reason}</p>
            ) : (
              <p className="text-sm text-zinc-500">No trip yet. The audit log stays empty until a pre-call check fails.</p>
            )}
          </Panel>
        </div>
      </div>

      <Panel title="Supabase downgrade audit log" aside={<Mark tone="idle">clinic_budget_downgrade_log</Mark>}>
        {rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left font-mono text-[11px]">
              <thead className="text-zinc-500">
                <tr>
                  {["clinic_id", "call_id", "turn", "budget", "spent_before", "from_model", "to_model", "outcome", "tripped_at"].map((column) => (
                    <th key={column} scope="col" className="border-b border-zinc-800 px-2 py-1 font-medium uppercase tracking-[0.12em]">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.call_id}-${row.turn_index}`} className="align-top text-zinc-200">
                    <td className="border-b border-zinc-900 px-2 py-2">{row.clinic_id}</td>
                    <td className="border-b border-zinc-900 px-2 py-2">{row.call_id}</td>
                    <td className="border-b border-zinc-900 px-2 py-2 tabular-nums">{row.turn_index}</td>
                    <td className="border-b border-zinc-900 px-2 py-2 tabular-nums">{centLabel(row.budget_cents)}</td>
                    <td className="border-b border-zinc-900 px-2 py-2 tabular-nums">{centLabel(row.spent_before_cents)}</td>
                    <td className="border-b border-zinc-900 px-2 py-2">{row.from_model}</td>
                    <td className="border-b border-zinc-900 px-2 py-2 text-amber-200">{row.to_model}</td>
                    <td className="border-b border-zinc-900 px-2 py-2 text-emerald-300">{row.outcome}</td>
                    <td className="border-b border-zinc-900 px-2 py-2">{row.tripped_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">Session log is empty. A tripped call appends one structured row.</p>
        )}
        {run?.sql ? (
          <pre className="mt-3 overflow-x-auto border border-zinc-800 bg-zinc-950 p-3 font-mono text-[11px] leading-5 text-zinc-300">{run.sql}</pre>
        ) : null}
      </Panel>
    </div>
  );
}
