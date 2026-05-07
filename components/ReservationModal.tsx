"use client";

import { useEffect, useMemo, useState } from "react";
import type { LeadPile } from "@/lib/types";
import { reservePiles } from "@/lib/reservePiles";

type Props = {
  open: boolean;
  piles: LeadPile[];
  onClose: () => void;
  onError: (message: string) => void;
  onSuccess: () => void;
};

function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(local: string): string {
  const d = new Date(local);
  return d.toISOString();
}

/** Modal para reservar montes inteiros (ainda no estoque). */
export function ReservationModal({ open, piles, onClose, onError, onSuccess }: Props) {
  const [recipient, setRecipient] = useState("");
  const [dateLocal, setDateLocal] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const eligible = useMemo(
    () => piles.filter((p) => p.status === "AVAILABLE"),
    [piles],
  );
  const skipped = useMemo(
    () => piles.filter((p) => p.status !== "AVAILABLE"),
    [piles],
  );

  useEffect(() => {
    if (!open) return;
    const nowIso = new Date().toISOString();
    setDateLocal(isoToLocalInput(nowIso));
    setRecipient("");
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (eligible.length === 0) {
      onError("Nenhum monte elegível para reserva (apenas totalmente disponíveis).");
      return;
    }
    setSubmitting(true);
    try {
      const iso = localInputToIso(dateLocal);
      await reservePiles({
        pileIds: eligible.map((p) => p.id),
        recipient,
        reservationDateIso: iso,
      });
      onSuccess();
      onClose();
      setRecipient("");
    } catch (err) {
      console.error("[ReservationModal] Erro ao reservar montes:", err);
      onError(err instanceof Error ? err.message : "Falha ao reservar montes.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reserve-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
        <h2 id="reserve-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Reservar montes (permanecem no estoque)
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Somente montes <strong>totalmente disponíveis</strong> entram na reserva. O consumo real
          continua em &quot;Liberar&quot;.
        </p>

        {skipped.length > 0 && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            {skipped.length} monte(s) ignorado(s) (parcial, já reservado ou consumido).
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-950/40">
            <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Montes a reservar ({eligible.length})
            </div>
            <ul className="mt-2 max-h-[30vh] space-y-1 overflow-y-auto text-xs text-zinc-600 dark:text-zinc-400">
              {eligible.map((p) => (
                <li key={p.id}>
                  Célula {p.grid_position_x + 1},{p.grid_position_y + 1}: {p.current_weight} kg ·{" "}
                  {p.current_bars} br
                </li>
              ))}
              {eligible.length === 0 && (
                <li className="text-amber-700 dark:text-amber-400">Nenhum monte elegível.</li>
              )}
            </ul>
          </div>

          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Para quem reservar
            <input
              type="text"
              required
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="Ex.: Produção / Setor X"
              className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
            />
          </label>

          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Data/hora da reserva
            <input
              type="datetime-local"
              required
              value={dateLocal}
              onChange={(e) => setDateLocal(e.target.value)}
              className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
            />
          </label>

          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || eligible.length === 0}
              className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              {submitting ? "Reservando…" : "Confirmar reserva"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
