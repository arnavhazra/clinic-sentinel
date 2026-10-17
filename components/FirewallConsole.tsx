"use client";

import { useState } from "react";
import { ATTACK_PRESETS, type GuardResult } from "@/lib/firewall";
import { postJson } from "@/lib/post-json";
import { Action, Mark, Panel } from "@/components/ui";

type Logged = GuardResult & { logged: boolean; at: string };

export function FirewallConsole({ allowlist }: { allowlist: readonly string[] }) {
  const [url, setUrl] = useState(ATTACK_PRESETS[0].url);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latest, setLatest] = useState<Logged | null>(null);
  const [log, setLog] = useState<Logged[]>([]);

  async function ask(nextUrl: string) {
    setBusy(true);
    setError(null);
    setUrl(nextUrl);
    try {
      const data = await postJson<GuardResult & { logged: boolean }>("/api/firewall/check", { url: nextUrl });
      const row: Logged = { ...data, at: new Date().toISOString() };
      setLatest(row);
      setLog((prev) => [row, ...prev].slice(0, 24));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Guard failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-emerald-400">Gate 04 · outbound</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Hostname allowlist and export guard</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
            The voice model asks can_call(hostname). The function answers yes or no. The list below is operator-only, hand-typed, and contains no wildcards.
          </p>
        </div>
        <a
          href="/sentinel-n8n-guardrails.json"
          download
          className="border border-emerald-400/40 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-emerald-200"
        >
          Download n8n JSON
        </a>
      </div>

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <Panel title="outbound.allow">
          <ol className="space-y-1 font-mono text-[12px]">
            {allowlist.map((host, index) => (
              <li key={host} className="flex gap-2">
                <span className="w-6 text-zinc-600">{String(index + 1).padStart(2, "0")}</span>
                <span className="text-emerald-200">{host}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs leading-5 text-zinc-500">Typed by the operator. Not interpolated into the prompt. Exact host match only.</p>
        </Panel>

        <Panel title="Ask the function">
          <label className="block">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">Outbound URL</span>
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              spellCheck={false}
              aria-label="Outbound URL"
              className="mt-2 w-full border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-[12px] outline-none"
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <Action tone="pass" disabled={busy} onClick={() => void ask(url)}>
              can_call
            </Action>
            {ATTACK_PRESETS.map((preset) => (
              <Action key={preset.id} disabled={busy} tone={preset.id === "book" || preset.id === "contacts" || preset.id === "stripe" || preset.id === "supabase" ? "idle" : "fail"} onClick={() => void ask(preset.url)}>
                {preset.label}
              </Action>
            ))}
          </div>
          {error ? <p className="mt-3 font-mono text-xs text-rose-300">{error}</p> : null}
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Model channel" aside={<span className="font-mono text-[10px] text-zinc-500">allowlist omitted</span>}>
          {latest ? (
            <pre className="overflow-x-auto font-mono text-[12px] leading-6 text-zinc-100">
{`> can_call(${JSON.stringify(latest.hostname || latest.argument)})
< ${JSON.stringify(latest.model_view)}`}
            </pre>
          ) : (
            <p className="text-sm text-zinc-500">The model receives a boolean. Nothing else.</p>
          )}
        </Panel>
        <Panel title="Operator decision">
          {latest ? (
            <div className="space-y-2 font-mono text-[12px]">
              <div className="flex items-center gap-2">
                <Mark tone={latest.allow ? "pass" : "fail"}>{latest.allow ? "ALLOW" : "DENY"}</Mark>
                <span className="text-zinc-400">{latest.reason}</span>
              </div>
              <p className="text-zinc-300">host {latest.hostname || "—"} · scheme {latest.scheme ?? "—"} · wildcard {String(latest.wildcard)} · logged {String(latest.logged)}</p>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">Run a preset. Denials are logged here.</p>
          )}
        </Panel>
      </div>

      <Panel title="Attempt log">
        {log.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-left font-mono text-[11px]">
              <thead className="text-zinc-500">
                <tr>
                  {["at", "host", "allow", "reason", "model_view"].map((column) => (
                    <th key={column} scope="col" className="border-b border-zinc-800 px-2 py-1 font-medium uppercase tracking-[0.12em]">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {log.map((row) => (
                  <tr key={`${row.at}-${row.argument}`}>
                    <td className="border-b border-zinc-900 px-2 py-2 text-zinc-500">{row.at}</td>
                    <td className="border-b border-zinc-900 px-2 py-2 text-zinc-200">{row.hostname || row.argument}</td>
                    <td className="border-b border-zinc-900 px-2 py-2">
                      <Mark tone={row.allow ? "pass" : "fail"}>{row.allow ? "yes" : "no"}</Mark>
                    </td>
                    <td className="border-b border-zinc-900 px-2 py-2 text-zinc-400">{row.reason}</td>
                    <td className="border-b border-zinc-900 px-2 py-2 text-zinc-300">{JSON.stringify(row.model_view)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">No attempts yet.</p>
        )}
      </Panel>
    </div>
  );
}
