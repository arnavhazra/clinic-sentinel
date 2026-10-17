"use client";

import { useEffect, useRef, useState } from "react";
import { HANDOFF_PRESETS } from "@/lib/handoff-presets";
import type { HandoffReport, SegmentMark } from "@/lib/handoff";
import { postJson } from "@/lib/post-json";
import { Action, Mark, Panel } from "@/components/ui";

const MARK_CLASS: Record<SegmentMark, string> = {
  plain: "",
  grounded: "text-emerald-300 underline decoration-emerald-500/80 decoration-1 underline-offset-2",
  ungrounded: "bg-[#4c0519] text-[#ffe4e6] shadow-[inset_0_-1px_0_#e11d48]",
  covert: "bg-[#881337] px-0.5 text-white",
  flag: "text-amber-200 underline decoration-amber-500/80 decoration-1 underline-offset-2",
};

function MemoView({ report }: { report: HandoffReport }) {
  return (
    <p className="whitespace-pre-wrap font-mono text-[12px] leading-6 text-zinc-200">
      {report.memo_segments.map((segment, index) => (
        <span key={`${index}-${segment.mark}`} className={MARK_CLASS[segment.mark]}>
          {segment.text}
        </span>
      ))}
    </p>
  );
}

export function HandoffConsole() {
  const initial = HANDOFF_PRESETS[0];
  const [memo, setMemo] = useState(initial.memo);
  const [raw, setRaw] = useState(initial.raw);
  const [active, setActive] = useState(initial.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<HandoffReport | null>(null);
  const seq = useRef(0);

  async function verify(nextMemo: string, nextRaw: string) {
    const token = ++seq.current;
    setBusy(true);
    setError(null);
    try {
      const data = await postJson<HandoffReport>("/api/handoff/verify", {
        memo: nextMemo,
        raw_text: nextRaw.trim() ? nextRaw : null,
      });
      if (seq.current === token) setReport(data);
    } catch (err) {
      if (seq.current === token) setError(err instanceof Error ? err.message : "Diff gate failed.");
    } finally {
      if (seq.current === token) setBusy(false);
    }
  }

  useEffect(() => {
    void verify(initial.memo, initial.raw);
    return () => {
      seq.current += 1;
    };
    // Initial clean preset only. Typing must not re-fire the gate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-emerald-400">Gate 02 · n8n diff</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Handoff payload diff verifier</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
          Agent 1 is the clinical and lab pricing researcher. Agent 2 writes the patient SMS. Currency, dosage, shipping days, and clinical flags in the memo are diffed against the signed EHR JSON. A covert handoff note halts the pipeline.
        </p>
      </div>

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {HANDOFF_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => {
              setActive(preset.id);
              setMemo(preset.memo);
              setRaw(preset.raw);
              void verify(preset.memo, preset.raw);
            }}
            className={`border p-3 text-left ${active === preset.id ? "border-emerald-400/50 bg-emerald-400/5" : "border-zinc-800 bg-[#0c0c0e]"}`}
          >
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">{preset.id}</div>
            <div className="mt-1 text-sm text-zinc-100">{preset.title}</div>
            <p className="mt-1 text-xs leading-5 text-zinc-500">{preset.detail}</p>
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Agent memo">
          <label className="block">
            <span className="sr-only">Agent memo</span>
            <textarea
              value={memo}
              onChange={(event) => {
                setMemo(event.target.value);
                setActive("edited");
              }}
              spellCheck={false}
              className="h-72 w-full resize-y border border-zinc-800 bg-zinc-950 p-3 font-mono text-[12px] leading-5 outline-none"
            />
          </label>
        </Panel>
        <Panel title="raw_api_response">
          <label className="block">
            <span className="sr-only">Raw API response JSON</span>
            <textarea
              value={raw}
              onChange={(event) => {
                setRaw(event.target.value);
                setActive("edited");
              }}
              spellCheck={false}
              className="h-72 w-full resize-y border border-zinc-800 bg-zinc-950 p-3 font-mono text-[12px] leading-5 outline-none"
            />
          </label>
        </Panel>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Action tone="pass" disabled={busy} onClick={() => void verify(memo, raw)}>
          Run n8n diff gate
        </Action>
        {report ? <Mark tone={report.halted ? "fail" : "pass"}>{report.pipeline}</Mark> : null}
        {busy ? <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">Checking</span> : null}
        {error ? <span className="font-mono text-xs text-rose-300">{error}</span> : null}
      </div>

      {report ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel
            title="Memo tokens"
            aside={<Mark tone={report.sms_blocked ? "fail" : "pass"}>{report.sms_blocked ? "SMS blocked" : "Writer released"}</Mark>}
          >
            <p className={`mb-3 text-sm ${report.halted ? "text-rose-200" : "text-emerald-200"}`}>{report.banner}</p>
            <MemoView report={report} />
            <ul className="mt-3 space-y-2">
              {report.findings.map((finding, index) => (
                <li key={`${finding.code}-${index}`} className="border border-rose-500/30 bg-[#4c0519]/40 p-2">
                  <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-rose-300">{finding.code}</div>
                  <p className="mt-1 text-xs leading-5 text-rose-100">{finding.detail}</p>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Payload AST leaves">
            {report.leaves.length > 0 ? (
              <div className="max-h-[520px] overflow-auto">
                <table className="w-full border-collapse text-left font-mono text-[11px]">
                  <thead className="text-zinc-500">
                    <tr>
                      <th scope="col" className="border-b border-zinc-800 px-2 py-1 font-medium">Path</th>
                      <th scope="col" className="border-b border-zinc-800 px-2 py-1 font-medium">Value</th>
                      <th scope="col" className="border-b border-zinc-800 px-2 py-1 font-medium">State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.leaves.map((leaf) => (
                      <tr key={leaf.path} className="align-top">
                        <td className="border-b border-zinc-900 px-2 py-1 text-zinc-400">{leaf.path}</td>
                        <td className={`border-b border-zinc-900 px-2 py-1 ${leaf.state === "omitted" ? "bg-[#4c0519] text-[#ffe4e6]" : "text-zinc-100"}`}>
                          {leaf.text}
                        </td>
                        <td className="border-b border-zinc-900 px-2 py-1">
                          <Mark tone={leaf.state === "cited" ? "pass" : leaf.state === "omitted" ? "fail" : "idle"}>{leaf.state}</Mark>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-rose-200">No payload leaves. The diff has nothing to trust.</p>
            )}
          </Panel>
        </div>
      ) : null}
    </div>
  );
}
