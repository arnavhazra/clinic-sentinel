"use client";

import { useEffect, useRef, useState } from "react";
import type { VerificationReport, VerifyMode } from "@/lib/verification";
import { postJson } from "@/lib/post-json";
import { Action, Mark, Panel } from "@/components/ui";

const MODES: { id: VerifyMode; title: string; detail: string }[] = [
  {
    id: "A",
    title: "Full end-to-end verified",
    detail: "GHL returns evt_99481a and the appointments row exists.",
  },
  {
    id: "B",
    title: "Silent webhook drop",
    detail: "Agent says done. Calendar check returns 404.",
  },
  {
    id: "C",
    title: "Revoked clinic API key",
    detail: "Owner revokes rk_clinic_live_88f2c1. No patient password exists.",
  },
];

function toneFor(status: string): "pass" | "warn" | "fail" {
  if (status === "VERIFIED_COMPLETE" || status === "FOUND" || status === "ROW_PRESENT" || status === "ACCEPTED") return "pass";
  if (status === "IGNORED") return "warn";
  return "fail";
}

export function VerificationConsole() {
  const [mode, setMode] = useState<VerifyMode>("A");
  const [report, setReport] = useState<VerificationReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  async function run(next: VerifyMode) {
    const token = ++seq.current;
    setBusy(true);
    setError(null);
    setMode(next);
    try {
      const data = await postJson<VerificationReport>("/api/verification/check", { mode: next });
      if (seq.current === token) setReport(data);
    } catch (err) {
      if (seq.current === token) setError(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      if (seq.current === token) setBusy(false);
    }
  }

  useEffect(() => {
    void run("A");
    return () => {
      seq.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-emerald-400">Gate 03 · External state</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">External state verification</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
          The voice agent tells Jordan Hale the Thursday 2:00 PM consult is booked. That sentence is not evidence. Status moves only after GHL or Supabase says so.
        </p>
      </div>

      <div className="grid gap-2 lg:grid-cols-3">
        {MODES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => void run(item.id)}
            className={`border p-3 text-left ${mode === item.id ? "border-emerald-400/50 bg-emerald-400/5" : "border-zinc-800 bg-[#0c0c0e]"}`}
          >
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">Mode {item.id}</div>
            <div className="mt-1 text-sm text-zinc-100">{item.title}</div>
            <p className="mt-1 text-xs leading-5 text-zinc-500">{item.detail}</p>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Action tone="fail" disabled={busy} onClick={() => void run("C")}>
          Revoke agent calendar key
        </Action>
        <Action disabled={busy} onClick={() => void run(mode)}>
          Re-check external state
        </Action>
        {busy ? <span className="self-center font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">Checking</span> : null}
        {error ? <span className="self-center font-mono text-xs text-rose-300">{error}</span> : null}
      </div>

      {report ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="flex flex-col gap-4">
            <Panel title="Agent utterance" aside={<Mark tone="warn">Ignored</Mark>}>
              <p className="text-lg leading-7 text-zinc-100">“{report.agent_utterance}”</p>
              <p className="mt-3 font-mono text-[11px] text-zinc-500">
                self_report = {report.self_report} · ignored = {String(report.self_report_ignored)}
              </p>
            </Panel>
            <Panel title="Task status" aside={<Mark tone={toneFor(report.task_status)}>{report.task_status}</Mark>}>
              <dl className="grid gap-2 font-mono text-[12px]">
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">Patient SMS</dt>
                  <dd className="text-right text-zinc-100">{report.patient_sms}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">Credentials held</dt>
                  <dd className="text-right text-zinc-100">{report.credentials_held.length > 0 ? report.credentials_held.join(", ") : "none"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">Patient passwords</dt>
                  <dd className="text-right text-emerald-300">{report.patient_passwords.length}</dd>
                </div>
              </dl>
              {report.escalation ? <p className="mt-3 text-sm leading-6 text-amber-100">{report.escalation}</p> : null}
              {report.retry ? (
                <p className="mt-2 font-mono text-[11px] text-zinc-400">
                  retry {report.retry.attempted ? "attempted" : "not attempted"} · {report.retry.result}
                </p>
              ) : null}
            </Panel>
            {report.appointment_row ? (
              <Panel title="appointments row">
                <pre className="overflow-x-auto font-mono text-[11px] leading-5 text-emerald-200">
                  {JSON.stringify(report.appointment_row, null, 2)}
                </pre>
              </Panel>
            ) : (
              <Panel title="appointments row">
                <p className="font-mono text-sm text-rose-200">0 rows. Status stays put.</p>
              </Panel>
            )}
          </div>
          <Panel title="External checks" aside={<span className="font-mono text-[10px] text-zinc-500">{busy ? "LIVE" : "SETTLED"}</span>}>
            <ol className="space-y-3">
              {report.checks.map((check, index) => (
                <li key={`${check.gate}-${index}`} className="border border-zinc-800 bg-zinc-950 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px] text-zinc-500">0{index + 1}</span>
                    <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-200">{check.gate}</span>
                    <Mark tone={toneFor(check.decision)}>{check.decision}</Mark>
                    {typeof check.http_status === "number" ? (
                      <span className="font-mono text-[10px] text-zinc-500">HTTP {check.http_status}</span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">{check.detail}</p>
                  {check.evidence ? (
                    <pre className="mt-2 overflow-x-auto font-mono text-[11px] leading-5 text-zinc-400">
                      {JSON.stringify(check.evidence, null, 2)}
                    </pre>
                  ) : null}
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      ) : null}
    </div>
  );
}
