"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Activity, BadgeCheck, GitCompare, Shield, Waypoints } from "lucide-react";

const NAV = [
  { href: "/", label: "Kernel", kicker: "00", icon: Shield },
  { href: "/budget", label: "Cent Budget", kicker: "01", icon: Activity },
  { href: "/handoff", label: "Payload Diff", kicker: "02", icon: GitCompare },
  { href: "/verification", label: "External State", kicker: "03", icon: BadgeCheck },
  { href: "/firewall", label: "Allowlist", kicker: "04", icon: Waypoints },
];

function HealthPill() {
  const [state, setState] = useState<"wait" | "up" | "down">("wait");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health")
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("down"))))
      .then((data: { status?: string; gates?: number }) => {
        if (cancelled) return;
        setState(data.status === "ok" && data.gates === 4 ? "up" : "down");
      })
      .catch(() => {
        if (!cancelled) setState("down");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const tone = state === "up" ? "text-emerald-300" : state === "down" ? "text-rose-300" : "text-zinc-500";
  const label = state === "up" ? "API UP · 4 GATES" : state === "down" ? "API DOWN" : "API …";

  return <span className={`font-mono text-[10px] tracking-[0.16em] ${tone}`}>{label}</span>;
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-100 md:grid md:grid-cols-[224px_minmax(0,1fr)]">
      <aside className="border-b border-zinc-800 md:sticky md:top-0 md:h-dvh md:border-b-0 md:border-r">
        <div className="flex items-center justify-between gap-3 px-4 py-4 md:block">
          <Link href="/" className="block">
            <div className="font-mono text-[10px] tracking-[0.22em] text-emerald-400">REGENIX</div>
            <div className="text-lg font-semibold tracking-tight">Sentinel</div>
            <div className="mt-1 hidden font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500 md:block">
              Governance kernel
            </div>
          </Link>
          <div className="md:mt-4">
            <HealthPill />
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-3 md:block md:px-2" aria-label="Gates">
          {NAV.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-w-fit items-center gap-2 px-2 py-2 font-mono text-[11px] uppercase tracking-[0.14em] ${
                  active ? "bg-zinc-900 text-emerald-300" : "text-zinc-400 hover:bg-zinc-900/70 hover:text-zinc-100"
                }`}
              >
                <Icon size={14} aria-hidden />
                <span className="text-zinc-600">{item.kicker}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="hidden border-t border-zinc-800 px-4 py-4 md:block">
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Clinic</div>
          <div className="mt-1 text-sm text-zinc-200">Apex Longevity</div>
          <div className="mt-1 font-mono text-[10px] text-zinc-500">clinic_apex_longevity</div>
          <div className="mt-3 font-mono text-[10px] text-zinc-600">No login · operator console</div>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-4 py-2 md:px-6">
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
            Peptide telehealth · voice intake · GHL calendar
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
            BPC-157 · TB-500 · NAD+ · TRT labs
          </div>
        </header>
        <main className="px-4 py-5 md:px-6">{children}</main>
      </div>
    </div>
  );
}
