import type { ReactNode } from "react";

const tones = {
  pass: "text-emerald-300 bg-emerald-400/10 ring-emerald-400/30",
  warn: "text-amber-300 bg-amber-400/10 ring-amber-400/30",
  fail: "text-rose-300 bg-rose-400/10 ring-rose-400/40",
  idle: "text-zinc-400 bg-zinc-400/10 ring-zinc-500/30",
} as const;

export function Mark({ tone, children }: { tone: keyof typeof tones; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] ring-1 ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Panel({
  title,
  aside,
  children,
  className = "",
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`border border-zinc-800 bg-[#0c0c0e] ${className}`}>
      <header className="flex items-center justify-between gap-3 border-b border-zinc-800 px-3 py-2">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">{title}</h2>
        {aside}
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}

export function Action({
  children,
  onClick,
  disabled,
  tone = "idle",
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "idle" | "pass" | "warn" | "fail";
}) {
  const styles = {
    idle: "border-zinc-700 bg-zinc-900 text-zinc-100 hover:border-zinc-500",
    pass: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200 hover:border-emerald-300",
    warn: "border-amber-400/40 bg-amber-400/10 text-amber-100 hover:border-amber-300",
    fail: "border-rose-400/50 bg-rose-500/10 text-rose-100 hover:border-rose-300",
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`border px-3 py-2 text-left font-mono text-[11px] uppercase tracking-[0.12em] disabled:cursor-not-allowed disabled:opacity-40 ${styles}`}
    >
      {children}
    </button>
  );
}
