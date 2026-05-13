"use client";

import type { LeadAlloy } from "@/lib/types";
import { formatIntPtBr, formatKgPtBr } from "@/lib/formatPtBr";

export type AlloyDashboardRow = {
  alloy: LeadAlloy;
  available_weight: number;
  available_bars: number;
  stock_weight: number;
  stock_bars: number;
};

type Props = {
  rows: AlloyDashboardRow[];
  selectedAlloyId: string | null;
  onSelectAlloy: (id: string) => void;
};

export function AlloyDashboard({ rows, selectedAlloyId, onSelectAlloy }: Props) {
  const pastel = [
    "bg-amber-50/90 border-amber-200/80 dark:bg-amber-950/35 dark:border-amber-900/50",
    "bg-rose-50/90 border-rose-200/80 dark:bg-rose-950/35 dark:border-rose-900/50",
    "bg-sky-50/90 border-sky-200/80 dark:bg-sky-950/35 dark:border-sky-900/50",
    "bg-violet-50/90 border-violet-200/80 dark:bg-violet-950/35 dark:border-violet-900/50",
    "bg-teal-50/90 border-teal-200/80 dark:bg-teal-950/35 dark:border-teal-900/50",
    "bg-orange-50/90 border-orange-200/80 dark:bg-orange-950/35 dark:border-orange-900/50",
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Visão geral
        </h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Disponível para consumo (disponível no estoque). Toque na liga para ir ao estoque.
        </p>
      </div>
      <div className="grid min-h-0 grid-cols-2 gap-2 sm:gap-3 md:max-h-[min(60vh,520px)] md:grid-cols-3 md:content-start">
        {rows.slice(0, 6).map((r, i) => {
          const active = selectedAlloyId === r.alloy.id;
          return (
            <button
              key={r.alloy.id}
              type="button"
              onClick={() => onSelectAlloy(r.alloy.id)}
              className={`flex min-h-[100px] flex-col rounded-2xl border p-3 text-left shadow-sm transition-transform active:scale-[0.98] md:min-h-[120px] ${
                pastel[i % pastel.length]
              } ${active ? "ring-2 ring-[var(--ios-blue)] ring-offset-2 ring-offset-[var(--background)] dark:ring-offset-zinc-950" : ""}`}
            >
              <span className="line-clamp-2 text-sm font-bold leading-tight text-zinc-900 dark:text-zinc-50">
                {r.alloy.name}
              </span>
              <span className="mt-2 text-[11px] font-medium uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
                Disponível
              </span>
              <span className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                {formatKgPtBr(r.available_weight)} kg
              </span>
              <span className="text-xs tabular-nums text-zinc-600 dark:text-zinc-300">
                {formatIntPtBr(r.available_bars)} barras
              </span>
              <span className="mt-auto pt-2 text-[10px] text-zinc-500">
                Total estoque {formatKgPtBr(r.stock_weight)} kg
              </span>
            </button>
          );
        })}
      </div>
      {rows.length > 6 && (
        <p className="text-center text-xs text-zinc-500">+ {rows.length - 6} liga(s) — use Estoque para ver todas.</p>
      )}
      {rows.length === 0 && (
        <p className="text-sm text-zinc-500">Cadastre ligas em Cadastros para aparecer aqui.</p>
      )}
    </div>
  );
}
