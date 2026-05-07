"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GRID_COLS, GRID_ROWS } from "@/lib/gridLayout";
import { formatIntPtBr, formatKgPtBr } from "@/lib/formatPtBr";

const CELL_W_MOBILE = 90;
const CELL_MIN_H = 48;
const CARD_MIN_H = 40;

export type DraftPile = {
  x: number;
  y: number;
  weightKg: number;
  bars: number;
};

type Props = {
  value: DraftPile[];
  onChange: (next: DraftPile[]) => void;
};

function keyOf(x: number, y: number) {
  return `${x},${y}`;
}

export function BatchEntryGrid({ value, onChange }: Props) {
  const byPos = useMemo(() => {
    const m = new Map<string, DraftPile>();
    for (const p of value) m.set(keyOf(p.x, p.y), p);
    return m;
  }, [value]);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editX, setEditX] = useState(0);
  const [editY, setEditY] = useState(0);
  const [kg, setKg] = useState("");
  const [bars, setBars] = useState("");
  const kgRef = useRef<HTMLInputElement | null>(null);

  const openEditor = (x: number, y: number) => {
    setEditX(x);
    setEditY(y);
    const existing = byPos.get(keyOf(x, y));
    setKg(existing ? String(existing.weightKg).replace(".", ",") : "");
    setBars(existing ? String(existing.bars) : "");
    setEditorOpen(true);
  };

  const closeEditor = () => setEditorOpen(false);

  useEffect(() => {
    if (!editorOpen) return;
    const raf = window.requestAnimationFrame(() => {
      kgRef.current?.focus();
      kgRef.current?.select?.();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [editorOpen]);

  const upsert = () => {
    const w = Number.parseFloat(kg.replace(",", "."));
    const b = Number.parseInt(bars, 10);
    if (!Number.isFinite(w) || w <= 0) return;
    if (!Number.isInteger(b) || b <= 0) return;

    const next = value.filter((p) => !(p.x === editX && p.y === editY));
    next.push({ x: editX, y: editY, weightKg: w, bars: b });
    onChange(next);
    setEditorOpen(false);
  };

  const clearCell = () => {
    onChange(value.filter((p) => !(p.x === editX && p.y === editY)));
    setEditorOpen(false);
  };

  const cells: React.ReactNode[] = [];
  for (let y = 0; y < GRID_ROWS; y++) {
    for (let x = 0; x < GRID_COLS; x++) {
      const existing = byPos.get(keyOf(x, y));
      cells.push(
        <button
          key={keyOf(x, y)}
          type="button"
          onClick={() => openEditor(x, y)}
          className={`min-h-[${CELL_MIN_H}px] rounded-lg border-2 border-dashed p-1 text-left transition-colors ${
            existing
              ? "border-emerald-300 bg-white hover:bg-emerald-50 dark:border-emerald-800 dark:bg-zinc-950 dark:hover:bg-emerald-950/30"
              : "border-zinc-200 bg-zinc-50/50 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900/40 dark:hover:bg-zinc-800/60"
          }`}
        >
          {existing ? (
            <div className={`relative flex h-full min-h-[${CARD_MIN_H}px] flex-col rounded-md border border-emerald-200 p-2 pt-2 shadow-sm dark:border-emerald-900/70`}>
              <span className="w-full whitespace-nowrap overflow-hidden text-[14px] font-bold tabular-nums leading-tight sm:text-base">
                {formatKgPtBr(existing.weightKg)}
                <span className="text-xs font-normal text-zinc-500"> kg</span>
              </span>
              <span className="mt-auto self-end text-xs tabular-nums text-zinc-600 dark:text-zinc-400">
                {formatIntPtBr(existing.bars)} br
              </span>
            </div>
          ) : (
            <div className={`flex h-full min-h-[${CARD_MIN_H}px] items-center justify-center text-[11px] text-zinc-400`}>
              vazio
            </div>
          )}
        </button>,
      );
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-zinc-500">
        Toque em uma célula para informar <strong>kg</strong> e <strong>barras</strong> do monte
        naquela posição.
      </p>
      <div className="-mx-1 px-1 pb-1 [scrollbar-gutter:stable]">
        <div
          className={`grid min-w-max gap-2 [grid-template-columns:repeat(7,${CELL_W_MOBILE}px)] sm:[grid-template-columns:repeat(7,minmax(0,1fr))]`}
        >
          {cells}
        </div>
      </div>

      {editorOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              Monte na célula {editX + 1},{editY + 1}
            </h3>
            <p className="mt-1 text-xs text-zinc-500">Informe kg e barras (obrigatórios).</p>

            <div className="mt-4 grid gap-3">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Peso (kg)
                <input
                  type="number"
                  inputMode="decimal"
                  min={0.001}
                  step="0.1"
                  ref={kgRef}
                  value={kg}
                  onChange={(e) => setKg(e.target.value)}
                  className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
                />
              </label>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Barras (br)
                <input
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  min={1}
                  step={1}
                  value={bars}
                  onChange={(e) => setBars(e.target.value)}
                  className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
                />
              </label>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closeEditor}
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={clearCell}
                className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
              >
                Limpar célula
              </button>
              <button
                type="button"
                onClick={upsert}
                className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

