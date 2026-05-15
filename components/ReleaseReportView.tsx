"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import type { LeadAlloy, LeadBatch, LeadPile, LeadPileEvent, LeadTransaction } from "@/lib/types";
import { formatIntPtBr, formatKgPtBr } from "@/lib/formatPtBr";
import { groupReleaseTransactions } from "@/lib/groupReleases";
import { reverseReleaseTransaction } from "@/lib/reverseReleaseTransaction";

type ReportFilter = "saidas" | "entradas" | "todos";

type Props = {
  pileIdFilter?: string | null;
  onClearPileFilter?: () => void;
  onError: (message: string) => void;
};

function formatIsoToBrDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function formatIsoToBrDate(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate.trim());
  if (!m) return isoDate;
  const [, yyyy, mm, dd] = m;
  return `${dd}/${mm}/${yyyy}`;
}

export function ReleaseReportView({ pileIdFilter, onClearPileFilter, onError }: Props) {
  const [kind, setKind] = useState<ReportFilter>("saidas");
  const [alloyFilterId, setAlloyFilterId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const alloysRaw = useLiveQuery(() => db.leadAlloys.orderBy("name").toArray(), []);
  const batchesRaw = useLiveQuery(() => db.leadBatches.toArray(), []);
  const pilesRaw = useLiveQuery(() => db.leadPiles.toArray(), []);
  const txsRaw = useLiveQuery(() => db.leadTransactions.toArray(), []);
  const eventsRaw = useLiveQuery(() => db.leadPileEvents.toArray(), []);

  const alloys = alloysRaw ?? [];
  const batches = batchesRaw ?? [];
  const piles = pilesRaw ?? [];
  const txs = txsRaw ?? [];
  const events = eventsRaw ?? [];

  const alloyById = useMemo(() => new Map(alloys.map((a) => [a.id, a])), [alloys]);
  const batchById = useMemo(() => new Map(batches.map((b) => [b.id, b])), [batches]);
  const pileById = useMemo(() => new Map(piles.map((p) => [p.id, p])), [piles]);

  const q = search.trim().toLowerCase();

  const filteredTxs = useMemo(() => {
    let list = txs;
    if (pileIdFilter) {
      list = list.filter((t) => t.pile_id === pileIdFilter);
    }
    if (alloyFilterId) {
      list = list.filter((t) => {
        const pile = pileById.get(t.pile_id);
        const batch = pile ? batchById.get(pile.batch_id) : undefined;
        return batch?.alloy_id === alloyFilterId;
      });
    }
    if (!q) return list;
    return list.filter((t) => {
      const dest = t.destination.toLowerCase();
      const pile = pileById.get(t.pile_id);
      const batch = pile ? batchById.get(pile.batch_id) : undefined;
      const bn = batch?.batch_number?.toLowerCase() ?? "";
      return dest.includes(q) || bn.includes(q);
    });
  }, [txs, pileIdFilter, alloyFilterId, q, pileById, batchById]);

  const groups = useMemo(() => groupReleaseTransactions(filteredTxs), [filteredTxs]);

  const entriesList = useMemo(() => {
    const rows = batches.map((b) => ({
      batch: b,
      alloy: alloyById.get(b.alloy_id),
    }));
    rows.sort((a, b) => b.batch.arrival_date.localeCompare(a.batch.arrival_date));
    let out = rows;
    if (alloyFilterId) {
      out = out.filter(({ batch }) => batch.alloy_id === alloyFilterId);
    }
    if (q) {
      out = out.filter(({ batch }) => batch.batch_number.toLowerCase().includes(q));
    }
    return out;
  }, [batches, alloyById, alloyFilterId, q]);

  const reservationEvents = useMemo(() => {
    if (kind !== "saidas" && kind !== "todos") return [];
    let ev = events;
    if (pileIdFilter) ev = ev.filter((e) => e.pile_id === pileIdFilter);
    if (alloyFilterId) {
      ev = ev.filter((e) => {
        const pile = pileById.get(e.pile_id);
        const batch = pile ? batchById.get(pile.batch_id) : undefined;
        return batch?.alloy_id === alloyFilterId;
      });
    }
    if (!q) return ev.sort((a, b) => b.event_date.localeCompare(a.event_date)).slice(0, 80);
    return ev
      .filter((e) => {
        const pile = pileById.get(e.pile_id);
        const batch = pile ? batchById.get(pile.batch_id) : undefined;
        const bn = batch?.batch_number?.toLowerCase() ?? "";
        const rec = e.recipient.toLowerCase();
        return rec.includes(q) || bn.includes(q);
      })
      .sort((a, b) => b.event_date.localeCompare(a.event_date))
      .slice(0, 80);
  }, [events, kind, pileIdFilter, alloyFilterId, q, pileById, batchById]);

  const showSaidas = kind === "saidas" || kind === "todos";
  const showEntradas = kind === "entradas" || kind === "todos";
  const showReservaBlock = kind === "todos";

  const handleReverseTx = async (txId: string) => {
    if (!window.confirm("Estornar esta liberação e devolver peso/barras ao monte no estoque?")) return;
    setBusyId(txId);
    try {
      await reverseReleaseTransaction(txId);
    } catch (e) {
      console.error(e);
      onError(e instanceof Error ? e.message : "Falha ao estornar liberação.");
    } finally {
      setBusyId(null);
    }
  };

  const handleReverseGroup = async (row: (typeof groups)[0]) => {
    if (
      !window.confirm(
        `Estornar todas as ${row.txs.length} linha(s) desta liberação (${row.destination})?`,
      )
    ) {
      return;
    }
    setBusyId(row.key);
    try {
      const ordered = [...row.txs].sort((a, b) => b.transaction_date.localeCompare(a.transaction_date));
      for (const t of ordered) {
        await reverseReleaseTransaction(t.id);
      }
      setExpanded(null);
    } catch (e) {
      console.error(e);
      onError(e instanceof Error ? e.message : "Falha ao estornar grupo.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Relatório
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Saídas agrupadas por liberação; entradas por lote. Toque numa linha para ver detalhes e
          estornar, se necessário.
        </p>
      </div>

      {pileIdFilter && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-blue-200/80 bg-blue-50/90 px-3 py-2 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-100">
          <span>Filtrando por um monte (histórico do menu).</span>
          <button
            type="button"
            onClick={onClearPileFilter}
            className="rounded-full border border-blue-300 px-3 py-1 text-xs font-semibold hover:bg-blue-100 dark:border-blue-800 dark:hover:bg-blue-900/50"
          >
            Limpar
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(["saidas", "entradas", "todos"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              kind === k
                ? "bg-[var(--ios-blue)] text-white shadow-sm"
                : "bg-zinc-200/80 text-zinc-800 hover:bg-zinc-300/80 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
            }`}
          >
            {k === "saidas" ? "Saídas" : k === "entradas" ? "Entradas" : "Todos"}
          </button>
        ))}
        <select
          value={alloyFilterId}
          onChange={(e) => setAlloyFilterId(e.target.value)}
          className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 shadow-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
          aria-label="Filtrar por liga"
        >
          <option value="">Todas as ligas</option>
          {alloys.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="buscar destino"
        className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-zinc-900 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      />

      {showSaidas && (
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Liberações (saídas)
          </h3>
          <div className="space-y-2">
            {groups.map((g) => {
              const totalKg = g.txs.reduce((s, t) => s + t.deducted_weight, 0);
              const totalBr = g.txs.reduce((s, t) => s + t.deducted_bars, 0);
              const pileSet = new Set(g.txs.map((t) => t.pile_id));
              const open = expanded === g.key;
              return (
                <div
                  key={g.key}
                  className="overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-sm dark:border-zinc-700/90 dark:bg-zinc-900/60"
                >
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : g.key)}
                    className="flex w-full flex-col gap-1 px-4 py-3 text-left"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-semibold text-zinc-900 dark:text-zinc-50">
                        {g.destination}
                      </span>
                      <span className="text-xs text-zinc-500">{formatIsoToBrDateTime(g.transaction_date)}</span>
                    </div>
                    <div className="text-sm text-zinc-600 dark:text-zinc-300">
                      {formatKgPtBr(totalKg)} kg · {formatIntPtBr(totalBr)} br · {pileSet.size} monte(s)
                      {g.approximate ? (
                        <span className="ml-2 text-amber-700 dark:text-amber-400">· agrupamento aproximado</span>
                      ) : null}
                    </div>
                    <span className="text-xs text-[var(--ios-blue)]">{open ? "Recolher" : "Detalhes"}</span>
                  </button>
                  {open && (
                    <div className="border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">
                      <div className="mb-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busyId != null}
                          onClick={() => void handleReverseGroup(g)}
                          className="rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          Estornar grupo inteiro
                        </button>
                      </div>
                      <ul className="space-y-2 text-sm">
                        {g.txs.map((t) => {
                          const pile = pileById.get(t.pile_id);
                          const batch = pile ? batchById.get(pile.batch_id) : undefined;
                          const alloy = batch ? alloyById.get(batch.alloy_id) : undefined;
                          return (
                            <li
                              key={t.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-zinc-50 px-3 py-2 dark:bg-zinc-950/60"
                            >
                              <div>
                                <div className="font-medium text-zinc-800 dark:text-zinc-100">
                                  {formatKgPtBr(t.deducted_weight)} kg · {formatIntPtBr(t.deducted_bars)} br
                                </div>
                                <div className="text-xs text-zinc-500">
                                  {alloy?.name ?? "—"} · Lote {batch?.batch_number ?? "—"} · Pos.{" "}
                                  {pile ? `${pile.grid_position_x + 1},${pile.grid_position_y + 1}` : "—"}
                                </div>
                              </div>
                              <button
                                type="button"
                                disabled={busyId != null}
                                onClick={() => void handleReverseTx(t.id)}
                                className="shrink-0 rounded-full border border-red-300 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
                              >
                                Estornar
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
            {groups.length === 0 && (
              <p className="text-sm text-zinc-500">Nenhuma liberação encontrada com estes filtros.</p>
            )}
          </div>

          {(kind === "saidas" || kind === "todos") && showReservaBlock && reservationEvents.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Reservas (eventos)
              </h3>
              <ul className="space-y-2">
                {reservationEvents.map((e: LeadPileEvent) => {
                  const pile = pileById.get(e.pile_id);
                  const batch = pile ? batchById.get(pile.batch_id) : undefined;
                  return (
                    <li
                      key={e.id}
                      className="rounded-2xl border border-blue-200/80 bg-blue-50/50 px-3 py-2 text-sm dark:border-blue-900 dark:bg-blue-950/30"
                    >
                      <div className="font-medium text-blue-900 dark:text-blue-100">
                        {e.kind === "RESERVED" ? "Reserva" : "Cancelamento de reserva"}
                      </div>
                      <div className="text-xs text-blue-800/90 dark:text-blue-200/90">
                        {e.recipient} · {batch?.batch_number ?? "—"} ·{" "}
                        {formatIsoToBrDateTime(e.event_date)}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      )}

      {showEntradas && (
        <section className="mt-2">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Entradas (lotes)
          </h3>
          <ul className="space-y-2">
            {entriesList.map(({ batch, alloy }) => (
              <li
                key={batch.id}
                className="rounded-2xl border border-emerald-200/80 bg-emerald-50/40 px-4 py-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/25"
              >
                <div className="font-semibold text-emerald-900 dark:text-emerald-100">
                  {alloy?.name ?? "Liga"} — Lote {batch.batch_number}
                </div>
                <div className="mt-1 text-xs text-emerald-800/90 dark:text-emerald-200/90">
                  Chegada {formatIsoToBrDate(batch.arrival_date)} · Inicial {batch.initial_total_bars} br /{" "}
                  {batch.initial_total_weight} kg
                </div>
              </li>
            ))}
            {entriesList.length === 0 && (
              <p className="text-sm text-zinc-500">Nenhuma entrada encontrada.</p>
            )}
          </ul>
        </section>
      )}
    </div>
  );
}
