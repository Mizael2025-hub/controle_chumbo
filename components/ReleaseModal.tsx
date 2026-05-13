"use client";

import { useEffect, useMemo, useState } from "react";
import type { LeadPile } from "@/lib/types";
import { roundKg1 } from "@/lib/formatPtBr";
import { releasePilesDetailed } from "@/lib/releasePilesDetailed";

type Props = {
  open: boolean;
  piles: LeadPile[];
  onClose: () => void;
  onError: (message: string) => void;
  onSuccess: () => void;
};

function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  // yyyy-MM-ddThh:mm para input[type=datetime-local]
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(local: string): string {
  // Interpreta como horário local do dispositivo
  const d = new Date(local);
  return d.toISOString();
}

/** Modal de liberação em lote (visual): seleciona montes e libera de uma vez. */
export function ReleaseModal({ open, piles, onClose, onError, onSuccess }: Props) {
  const [recipient, setRecipient] = useState("");
  const [dateLocal, setDateLocal] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [modeByPile, setModeByPile] = useState<Record<string, "FULL" | "PARTIAL">>({});
  const [partialKg, setPartialKg] = useState<Record<string, string>>({});
  const [partialBars, setPartialBars] = useState<Record<string, string>>({});
  const [kgTouched, setKgTouched] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open) return;
    const nowIso = new Date().toISOString();
    setDateLocal(isoToLocalInput(nowIso));
    setModeByPile({});
    setPartialKg({});
    setPartialBars({});
    setKgTouched({});
    const rf = piles[0]?.reserved_for ?? null;
    const allSameReserved =
      rf != null &&
      piles.length > 0 &&
      piles.every((p) => p.reserved_for === rf);
    setRecipient(allSameReserved ? rf : "");
  }, [open, piles]);

  const activePiles = useMemo(() => piles.filter((p) => p.status !== "CONSUMED"), [piles]);

  const totals = useMemo(() => {
    const active = activePiles;
    return {
      count: active.length,
      bars: active.reduce((s, p) => s + p.current_bars, 0),
      weight: active.reduce((s, p) => s + p.current_weight, 0),
    };
  }, [activePiles]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const iso = localInputToIso(dateLocal);
      const actions = activePiles.map((p) => {
        const mode = modeByPile[p.id] ?? "FULL";
        if (mode === "FULL") return { pileId: p.id, kind: "FULL" as const };
        const kgStr = (partialKg[p.id] ?? "").trim();
        const brStr = (partialBars[p.id] ?? "").trim();
        const kg = Number.parseFloat(kgStr.replace(",", "."));
        const br = Number.parseInt(brStr, 10);
        return {
          pileId: p.id,
          kind: "PARTIAL" as const,
          deducted_weight: kg,
          deducted_bars: br,
        };
      });

      await releasePilesDetailed({
        actions,
        recipient,
        transactionDateIso: iso,
        releaseGroupId:
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      });
      onSuccess();
      onClose();
      setRecipient("");
    } catch (err) {
      console.error("[ReleaseModal] Erro ao liberar montes:", err);
      onError(err instanceof Error ? err.message : "Falha ao liberar montes.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="release-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
        <h2 id="release-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Liberação visual (selecionados)
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Selecionados: <strong>{totals.count}</strong> montes ·{" "}
          <strong>{totals.bars}</strong> barras · <strong>{totals.weight}</strong> kg
        </p>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Para quem foi liberado
            <input
              type="text"
              required
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="Ex.: João / Produção / Setor X"
              className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
            />
          </label>

          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Data/hora da liberação (pode editar)
            <input
              type="datetime-local"
              required
              value={dateLocal}
              onChange={(e) => setDateLocal(e.target.value)}
              className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
            />
          </label>

          <div className="mt-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-950/40">
            <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Montes selecionados
            </div>
            <div className="mt-2 max-h-[40vh] space-y-2 overflow-y-auto pr-1">
              {activePiles.map((p) => {
                const mode = modeByPile[p.id] ?? "FULL";
                const isPartial = mode === "PARTIAL";
                const barsStr = partialBars[p.id] ?? "";
                const barsN = Number.parseInt(barsStr || "0", 10);
                const canAuto =
                  Number.isFinite(p.current_weight) &&
                  Number.isFinite(p.current_bars) &&
                  p.current_bars > 0 &&
                  Number.isInteger(barsN) &&
                  barsN > 0;
                const autoKg = canAuto
                  ? roundKg1((p.current_weight / p.current_bars) * barsN)
                  : null;
                const autoKgStr = autoKg != null ? String(autoKg).replace(".", ",") : "";
                return (
                  <div
                    key={p.id}
                    className="rounded-lg border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-medium text-zinc-900 dark:text-zinc-50">
                        {p.current_weight} kg · {p.current_bars} br
                      </div>
                      <label className="flex items-center gap-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        <input
                          type="checkbox"
                          checked={isPartial}
                          onChange={(e) =>
                            setModeByPile((prev) => ({
                              ...prev,
                              [p.id]: e.target.checked ? "PARTIAL" : "FULL",
                            }))
                          }
                        />
                        parcial
                      </label>
                    </div>

                    {isPartial && (
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                          Barras a liberar
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            required
                            value={partialBars[p.id] ?? ""}
                            onChange={(e) =>
                              setPartialBars((prev) => {
                                const next = { ...prev, [p.id]: e.target.value };
                                const n = Number.parseInt(e.target.value || "0", 10);
                                const ok =
                                  Number.isInteger(n) &&
                                  n > 0 &&
                                  p.current_bars > 0 &&
                                  Number.isFinite(p.current_weight);
                                if (ok && !kgTouched[p.id]) {
                                  const kgAuto = roundKg1((p.current_weight / p.current_bars) * n);
                                  setPartialKg((prevKg) => ({
                                    ...prevKg,
                                    [p.id]: String(kgAuto).replace(".", ","),
                                  }));
                                }
                                return next;
                              })
                            }
                            className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                          />
                        </label>
                        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                          Kg a liberar (auto, pode ajustar)
                          <input
                            type="text"
                            inputMode="decimal"
                            required
                            value={partialKg[p.id] ?? autoKgStr}
                            onChange={(e) => {
                              setKgTouched((prev) => ({ ...prev, [p.id]: true }));
                              setPartialKg((prev) => ({ ...prev, [p.id]: e.target.value }));
                            }}
                            className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                          />
                        </label>
                      </div>
                    )}
                  </div>
                );
              })}
              {activePiles.length === 0 && (
                <div className="text-xs text-zinc-500">Nenhum monte ativo selecionado.</div>
              )}
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50 dark:bg-red-600 dark:hover:bg-red-500"
            >
              {submitting ? "Liberando…" : "Confirmar liberação"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

