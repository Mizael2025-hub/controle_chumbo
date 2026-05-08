"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { computeBatchStock } from "@/lib/batchTotals";
import { cancelReservation } from "@/lib/reservePiles";
import type { LeadAlloy, LeadBatch, LeadPile, LeadPileEvent, LeadTransaction } from "@/lib/types";
import { formatIntPtBr, formatKgPtBr } from "@/lib/formatPtBr";
import { ErrorBanner } from "@/components/ErrorBanner";
import { PileGrid } from "@/components/PileGrid";
import { CadastrosView } from "@/components/CadastrosView";
import { ReleaseModal } from "@/components/ReleaseModal";
import { ReservationModal } from "@/components/ReservationModal";
import { useAuthUser } from "@/components/AuthUserContext";
import { SyncStatusIndicator } from "@/components/SyncStatusIndicator";
import { enqueueAllDexieRows } from "@/lib/bulkEnqueueDexie";
import { flushOutbox, forceFullPush, forceFullSync } from "@/lib/syncEngine";

const EMPTY_PILES: LeadPile[] = [];
const EMPTY_ALLOYS: LeadAlloy[] = [];

type MainNav = "estoque" | "cadastros";

type LeadAppProps = {
  /** Erros fatais da fila de sync (push). */
  syncFatalMessage?: string | null;
  onClearSyncFatal?: () => void;
};

/** Aplicação principal: abas por liga, lotes expansíveis, grade local. */
export function LeadApp(props: LeadAppProps = {}) {
  const { syncFatalMessage, onClearSyncFatal } = props;
  const [mounted, setMounted] = useState(false);
  const [ready, setReady] = useState(false);
  const [mainNav, setMainNav] = useState<MainNav>("estoque");
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [selectedAlloyId, setSelectedAlloyId] = useState<string | null>(null);
  const [expandedBatchIds, setExpandedBatchIds] = useState<Set<string>>(() => new Set());
  const [selectedPileIds, setSelectedPileIds] = useState<Set<string>>(() => new Set());
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [reservationOpen, setReservationOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyFilter, setHistoryFilter] = useState("");
  const [historyPileId, setHistoryPileId] = useState<string | null>(null);
  const [cloudBusy, setCloudBusy] = useState(false);

  const { userId, supabase } = useAuthUser();

  useEffect(() => {
    setMounted(true);
    // Acesso "early" ao IndexedDB ajuda alguns WebKit a inicializar melhor.
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    globalThis.indexedDB;
  }, []);

  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;
    (async () => {
      try {
        if (cancelled) return;
        const all = await db.leadAlloys.orderBy("name").toArray();
        const firstId = all[0]?.id ?? null;
        setSelectedAlloyId((prev) => prev ?? firstId);
      } catch (e) {
        console.error("[LeadApp] Falha ao preparar banco local:", e);
        setGlobalError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mounted]);

  useEffect(() => {
    if (!selectedAlloyId) return;
    setSelectedPileIds(new Set());
    let cancelled = false;
    void (async () => {
      try {
        const list = await db.leadBatches
          .where("alloy_id")
          .equals(selectedAlloyId)
          .toArray();
        if (cancelled || list.length === 0) return;
        setExpandedBatchIds((prev) => {
          const next = new Set(prev);
          next.add(list[0].id);
          return next;
        });
      } catch (e) {
        console.error("[LeadApp] Falha ao expandir primeiro lote:", e);
        setGlobalError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedAlloyId]);

  const alloysRaw = useLiveQuery(() => db.leadAlloys.orderBy("name").toArray(), []);
  const alloys = useMemo(() => alloysRaw ?? EMPTY_ALLOYS, [alloysRaw]);

  useEffect(() => {
    if (alloys.length === 0) {
      setSelectedAlloyId(null);
      return;
    }
    setSelectedAlloyId((prev) =>
      prev && alloys.some((a) => a.id === prev) ? prev : alloys[0].id,
    );
  }, [alloys]);

  const batchesRaw = useLiveQuery(
      () =>
        selectedAlloyId
          ? db.leadBatches.where("alloy_id").equals(selectedAlloyId).toArray()
          : Promise.resolve([] as LeadBatch[]),
      [selectedAlloyId],
    );

  const batches = useMemo(() => batchesRaw ?? [], [batchesRaw]);

  const pilesRaw = useLiveQuery(() => db.leadPiles.toArray(), []);
  const transactionsRaw = useLiveQuery(() => db.leadTransactions.toArray(), []);
  const pileEventsRaw = useLiveQuery(() => db.leadPileEvents.toArray(), []);

  const pilesByBatch = useMemo(() => {
    const list = pilesRaw ?? EMPTY_PILES;
    const m = new Map<string, LeadPile[]>();
    for (const p of list) {
      const arr = m.get(p.batch_id) ?? [];
      arr.push(p);
      m.set(p.batch_id, arr);
    }
    return m;
  }, [pilesRaw]);

  const toggleBatch = useCallback((id: string) => {
    setExpandedBatchIds((prev) => {
      if (prev.has(id)) return new Set();
      return new Set([id]);
    });
  }, []);

  const selectedPiles = Array.from(selectedPileIds)
    .map((id) => pilesRaw?.find((p) => p.id === id))
    .filter(Boolean) as LeadPile[];

  const formatIsoToBrDate = (isoDate: string): string => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
    if (!m) return isoDate;
    const [, yyyy, mm, dd] = m;
    return `${dd}/${mm}/${yyyy}`;
  };

  const formatIsoToBrDateTime = (iso: string): string => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  };

  const batchUi = useMemo(() => {
    return batches
      .map((batch) => {
        const piles = pilesByBatch.get(batch.id) ?? [];
        const stock = computeBatchStock(piles);
        const finished = stock.stock_bars === 0 && stock.stock_weight === 0;
        return { batch, piles, stock, finished };
      })
      .sort((a, b) => {
        if (a.finished !== b.finished) return a.finished ? 1 : -1;
        const byDate = b.batch.arrival_date.localeCompare(a.batch.arrival_date);
        if (byDate !== 0) return byDate;
        return a.batch.batch_number.localeCompare(b.batch.batch_number);
      });
  }, [batches, pilesByBatch]);

  const alloyStockTotals = useMemo(() => {
    return batchUi.reduce(
      (acc, { stock }) => ({
        available_weight: acc.available_weight + stock.available_weight,
        available_bars: acc.available_bars + stock.available_bars,
        reserved_weight: acc.reserved_weight + stock.reserved_weight,
        reserved_bars: acc.reserved_bars + stock.reserved_bars,
        stock_weight: acc.stock_weight + stock.stock_weight,
        stock_bars: acc.stock_bars + stock.stock_bars,
      }),
      {
        available_weight: 0,
        available_bars: 0,
        reserved_weight: 0,
        reserved_bars: 0,
        stock_weight: 0,
        stock_bars: 0,
      },
    );
  }, [batchUi]);

  useEffect(() => {
    setExpandedBatchIds((prev) => {
      if (prev.size === 0) return prev;
      const openId = Array.from(prev)[0];
      const found = batchUi.find((x) => x.batch.id === openId);
      if (!found) return new Set();
      if (found.finished) return new Set();
      return prev;
    });
  }, [batchUi]);

  const releaseHistory = useMemo(() => {
    const txs = (transactionsRaw ?? []) as LeadTransaction[];
    const events = (pileEventsRaw ?? []) as LeadPileEvent[];
    const piles = pilesRaw ?? [];
    const pileById = new Map(piles.map((p) => [p.id, p]));
    const batchById = new Map(batches.map((b) => [b.id, b]));

    const q = historyFilter.trim().toLowerCase();

    const merged: Array<
      | { kind: "RELEASE"; date: string; pileId: string; payload: LeadTransaction; pile?: LeadPile; batch?: LeadBatch }
      | { kind: "RESERVATION"; date: string; pileId: string; payload: LeadPileEvent; pile?: LeadPile; batch?: LeadBatch }
    > = [];

    for (const t of txs) {
      const pile = pileById.get(t.pile_id);
      const batch = pile ? batchById.get(pile.batch_id) : undefined;
      merged.push({ kind: "RELEASE", date: t.transaction_date, pileId: t.pile_id, payload: t, pile, batch });
    }

    for (const e of events) {
      const pile = pileById.get(e.pile_id);
      const batch = pile ? batchById.get(pile.batch_id) : undefined;
      merged.push({ kind: "RESERVATION", date: e.event_date, pileId: e.pile_id, payload: e, pile, batch });
    }

    return merged
      .filter((x) => (historyPileId ? x.pileId === historyPileId : true))
      .filter(({ batch }) => (selectedAlloyId ? batch?.alloy_id === selectedAlloyId : true))
      .filter((x) => {
        if (!q) return true;
        const bn = x.batch?.batch_number?.toLowerCase?.() ?? "";
        if (x.kind === "RELEASE") {
          const dest = x.payload.destination?.toLowerCase?.() ?? "";
          return dest.includes(q) || bn.includes(q);
        }
        const rec = x.payload.recipient?.toLowerCase?.() ?? "";
        return rec.includes(q) || bn.includes(q) || "reserva".includes(q);
      })
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 120);
  }, [transactionsRaw, pileEventsRaw, pilesRaw, batches, selectedAlloyId, historyFilter, historyPileId]);

  const onTogglePile = (pileId: string) => {
    setSelectedPileIds((prev) => {
      const next = new Set(prev);
      if (next.has(pileId)) next.delete(pileId);
      else next.add(pileId);
      return next;
    });
  };

  if (!mounted || !ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-zinc-600">
        Inicializando banco local…
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[100svh] max-w-6xl flex-col px-4 pb-6">
      <div className="sticky top-0 z-30 -mx-4 border-b border-zinc-200 bg-white/90 px-4 pt-6 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <header className="mb-4">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            Controle de chumbo
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Protótipo offline (Dexie). Os dados ficam armazenados neste navegador.
          </p>
        </header>

        <ErrorBanner
          message={globalError ?? syncFatalMessage ?? null}
          onDismiss={() => {
            setGlobalError(null);
            onClearSyncFatal?.();
          }}
        />

        {userId && supabase && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900/50">
            <span className="text-zinc-600 dark:text-zinc-400">Nuvem (Supabase):</span>
            <button
              type="button"
              disabled={cloudBusy}
              onClick={async () => {
                setCloudBusy(true);
                try {
                  await enqueueAllDexieRows();
                  await flushOutbox(supabase, userId, {
                    onPushError: (m) => setGlobalError(m),
                  });
                  window.alert("Dados locais enfileirados e enviados (confira se está online).");
                } catch (e) {
                  console.error("[LeadApp] upload nuvem:", e);
                  setGlobalError(e instanceof Error ? e.message : "Falha ao enviar para a nuvem.");
                } finally {
                  setCloudBusy(false);
                }
              }}
              className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 dark:bg-emerald-600"
            >
              {cloudBusy ? "Enviando…" : "Subir dados locais para a nuvem"}
            </button>
            <button
              type="button"
              disabled={cloudBusy}
              onClick={async () => {
                setCloudBusy(true);
                try {
                  await forceFullPush(supabase, userId);
                  await flushOutbox(supabase, userId, {
                    onPushError: (m) => setGlobalError(m),
                  });
                  window.alert("Forçando sincronia: dados enfileirados e enviados (confira se está online).");
                } catch (e) {
                  console.error("[LeadApp] forçar sincronia:", e);
                  setGlobalError(e instanceof Error ? e.message : "Falha ao forçar sincronia.");
                } finally {
                  setCloudBusy(false);
                }
              }}
              className="inline-flex items-center gap-2 rounded-md bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-800 disabled:opacity-50 dark:bg-sky-600 dark:hover:bg-sky-500"
              title="Enfileira upsert de tudo que existe no banco local e tenta enviar agora."
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden
              >
                <path
                  d="M7 18a4 4 0 01.8-7.9A5 5 0 0117 9a4 4 0 011 7H7z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Forçar Sincronia
            </button>
            <button
              type="button"
              disabled={cloudBusy}
              onClick={async () => {
                setCloudBusy(true);
                try {
                  await forceFullSync(supabase, userId);
                  await flushOutbox(supabase, userId, {
                    onPushError: (m) => setGlobalError(m),
                  });
                  window.alert("Sincronização completa enfileirada e enviada (confira se está online).");
                } catch (e) {
                  console.error("[LeadApp] sync tudo:", e);
                  setGlobalError(e instanceof Error ? e.message : "Falha ao sincronizar tudo.");
                } finally {
                  setCloudBusy(false);
                }
              }}
              className="inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950/40 dark:text-zinc-100 dark:hover:bg-zinc-800"
              title="Varre tudo no banco local e reenfileira o que está sem updated_at ou ainda não existe no servidor."
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden
              >
                <path
                  d="M7 18a4 4 0 01.8-7.9A5 5 0 0117 9a4 4 0 011 7H7z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Sincronizar Agora
            </button>
            <button
              type="button"
              className="ml-auto rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
              onClick={() => void supabase.auth.signOut()}
            >
              Sair
            </button>
          </div>
        )}

        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMainNav("estoque")}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${
              mainNav === "estoque"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200"
            }`}
          >
            Estoque e baixas
          </button>
          <button
            type="button"
            onClick={() => setMainNav("cadastros")}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${
              mainNav === "cadastros"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200"
            }`}
          >
            Cadastros
          </button>
        </div>

        {mainNav === "estoque" && (
          <>
            <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
              Selecione a liga abaixo para ver todos os lotes ativos e registrar baixas nos montes.
            </p>
            <nav className="mb-4 flex flex-wrap gap-2 pb-4">
              {alloys.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelectedAlloyId(a.id)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                    selectedAlloyId === a.id
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                  }`}
                >
                  {a.name}
                </button>
              ))}
            </nav>
          </>
        )}
      </div>

      <div className="mt-6 flex-1 min-h-0">
        {mainNav === "cadastros" && (
          <div className="h-full overflow-hidden">
            <CadastrosView
              onError={(msg) => setGlobalError(msg)}
              onGoToEstoque={(alloyId) => {
                setMainNav("estoque");
                if (alloyId) setSelectedAlloyId(alloyId);
              }}
            />
          </div>
        )}

        {mainNav === "estoque" && (
          <>
            <div className="space-y-4">
            {alloys.length === 0 && (
              <p className="text-sm text-zinc-500">
                Nenhuma liga cadastrada. Use <strong>Cadastros</strong> para criar ligas e lotes.
              </p>
            )}
            {batches.length === 0 && selectedAlloyId && alloys.length > 0 && (
              <p className="text-sm text-zinc-500">Nenhum lote para esta liga.</p>
            )}
            {batchUi.length > 0 && (
              <section className="rounded-xl border border-zinc-200 bg-white px-3 py-2 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/50">
                <div className="flex flex-wrap items-baseline justify-between gap-1.5">
                  <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Total da liga (todos os lotes)
                  </div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    No estoque físico = disponível + reservado
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  <div className="rounded-lg bg-emerald-50 px-2 py-1.5 dark:bg-emerald-950/30">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                      Disponível
                    </div>
                    <div className="text-[12px] font-semibold leading-tight text-emerald-900 dark:text-emerald-100">
                      {formatIntPtBr(alloyStockTotals.available_bars)} br ·{" "}
                      {formatKgPtBr(alloyStockTotals.available_weight)} kg
                    </div>
                  </div>
                  <div className="rounded-lg bg-blue-50 px-2 py-1.5 dark:bg-blue-950/30">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
                      Reservado
                    </div>
                    <div className="text-[12px] font-semibold leading-tight text-blue-900 dark:text-blue-100">
                      {formatIntPtBr(alloyStockTotals.reserved_bars)} br ·{" "}
                      {formatKgPtBr(alloyStockTotals.reserved_weight)} kg
                    </div>
                  </div>
                  <div className="rounded-lg bg-zinc-100 px-2 py-1.5 dark:bg-zinc-800/60">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
                      Total geral estoque
                    </div>
                    <div className="text-[12px] font-semibold leading-tight text-zinc-900 dark:text-zinc-50">
                      {formatIntPtBr(alloyStockTotals.stock_bars)} br ·{" "}
                      {formatKgPtBr(alloyStockTotals.stock_weight)} kg
                    </div>
                  </div>
                </div>
              </section>
            )}
            {batchUi.map(({ batch, piles, stock }) => {
              const open = expandedBatchIds.has(batch.id);
              return (
                <section
                  key={batch.id}
                  className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900/50"
                >
                  <button
                    type="button"
                    onClick={() => toggleBatch(batch.id)}
                    className="flex w-full flex-wrap items-center justify-between gap-4 px-4 py-3 text-left"
                  >
                    <div>
                      <div className="font-semibold text-zinc-900 dark:text-zinc-50">
                        Lote {batch.batch_number}
                      </div>
                      <div className="text-xs text-zinc-500">
                        Chegada: {formatIsoToBrDate(batch.arrival_date)} · Inicial:{" "}
                        {batch.initial_total_bars} br / {batch.initial_total_weight} kg
                      </div>
                    </div>
                    <div className="space-y-0.5 text-right text-sm">
                      <div className="font-medium text-zinc-800 dark:text-zinc-200">
                        Disponível: {formatIntPtBr(stock.available_bars)} br ·{" "}
                        {formatKgPtBr(stock.available_weight)} kg
                      </div>
                      <div className="text-xs font-medium text-blue-700 dark:text-blue-400">
                        Reservado: {formatIntPtBr(stock.reserved_bars)} br ·{" "}
                        {formatKgPtBr(stock.reserved_weight)} kg
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">
                        No estoque: {formatIntPtBr(stock.stock_bars)} br ·{" "}
                        {formatKgPtBr(stock.stock_weight)} kg
                      </div>
                      <div className="text-xs text-zinc-400">{open ? "Recolher" : "Expandir"}</div>
                    </div>
                  </button>
                  {open && (
                    <div className="border-t border-zinc-100 px-3 pb-4 pt-2 dark:border-zinc-800">
                      <PileGrid
                        batchId={batch.id}
                        piles={piles}
                        selectedPileIds={selectedPileIds}
                        onTogglePile={onTogglePile}
                        onMoveError={(msg) => setGlobalError(msg)}
                        onRequestRelease={(pileIds) => {
                          setSelectedPileIds(new Set(pileIds));
                          setReleaseOpen(true);
                        }}
                        onRequestReserve={(pileIds) => {
                          setSelectedPileIds(new Set(pileIds));
                          setReservationOpen(true);
                        }}
                        onRequestCancelReservation={async (pileId) => {
                          try {
                            await cancelReservation(pileId);
                          } catch (err) {
                            console.error("[LeadApp] Erro ao cancelar reserva:", err);
                            setGlobalError(
                              err instanceof Error ? err.message : "Falha ao cancelar reserva.",
                            );
                          }
                        }}
                        onRequestHistory={(pileId) => {
                          setHistoryPileId(pileId);
                          setHistoryOpen(true);
                        }}
                        onRequestSelectMore={() => {
                          // nada: apenas fecha o menu no grid
                        }}
                      />
                    </div>
                  )}
                </section>
              );
            })}
            </div>

            <section className="mt-8 rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900/50">
            <button
              type="button"
              onClick={() => setHistoryOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
            >
              <div>
                <div className="font-semibold text-zinc-900 dark:text-zinc-50">
                  Histórico de liberações
                </div>
                <div className="text-xs text-zinc-500">
                  Mostrando as últimas {releaseHistory.length} (filtra por destino ou lote).
                </div>
              </div>
              <div className="text-xs text-zinc-400">{historyOpen ? "Recolher" : "Expandir"}</div>
            </button>

            {historyOpen && (
              <div className="border-t border-zinc-100 px-4 pb-4 pt-3 dark:border-zinc-800">
                {historyPileId && (
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100">
                    <div>
                      Filtrando por um monte específico.
                    </div>
                    <button
                      type="button"
                      onClick={() => setHistoryPileId(null)}
                      className="rounded-md border border-blue-300 px-2 py-1 font-semibold hover:bg-blue-100 dark:border-blue-800 dark:hover:bg-blue-900/40"
                    >
                      Limpar filtro do monte
                    </button>
                  </div>
                )}
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Filtrar (destino ou lote)
                  <input
                    type="text"
                    value={historyFilter}
                    onChange={(e) => setHistoryFilter(e.target.value)}
                    placeholder="Ex.: Produção / João / LOTE-2025"
                    className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
                  />
                </label>

                <div className="mt-3 max-h-[50vh] space-y-2 overflow-y-auto pr-1">
                  {releaseHistory.map((item) => {
                    const pile = item.pile;
                    const batch = item.batch;
                    if (item.kind === "RELEASE") {
                      const t = item.payload;
                      return (
                        <div
                          key={`tx:${t.id}`}
                          className="rounded-lg border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="font-medium text-zinc-900 dark:text-zinc-50">
                              {formatKgPtBr(t.deducted_weight)} kg ·{" "}
                              {formatIntPtBr(t.deducted_bars)} br
                            </div>
                            <div className="text-xs text-zinc-500">
                              {formatIsoToBrDateTime(t.transaction_date)}
                            </div>
                          </div>
                          <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                            Para: <span className="font-medium">{t.destination}</span>
                            {batch ? (
                              <>
                                {" "}
                                · Lote: <span className="font-medium">{batch.batch_number}</span>
                              </>
                            ) : null}
                            {pile ? (
                              <>
                                {" "}
                                · Monte:{" "}
                                <span className="font-medium">
                                  {pile.grid_position_x + 1},{pile.grid_position_y + 1}
                                </span>
                              </>
                            ) : null}
                          </div>
                        </div>
                      );
                    }

                    const e = item.payload;
                    const label =
                      e.kind === "RESERVED" ? "Reserva" : "Cancelamento de reserva";
                    return (
                      <div
                        key={`ev:${e.id}`}
                        className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm dark:border-blue-900 dark:bg-blue-950/40"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-medium text-blue-900 dark:text-blue-100">
                            {label}
                          </div>
                          <div className="text-xs text-blue-800/80 dark:text-blue-200/80">
                            {formatIsoToBrDateTime(e.event_date)}
                          </div>
                        </div>
                        <div className="mt-1 text-xs text-blue-900/90 dark:text-blue-100/90">
                          Para: <span className="font-medium">{e.recipient || "-"}</span>
                          {batch ? (
                            <>
                              {" "}
                              · Lote: <span className="font-medium">{batch.batch_number}</span>
                            </>
                          ) : null}
                          {pile ? (
                            <>
                              {" "}
                              · Monte:{" "}
                              <span className="font-medium">
                                {pile.grid_position_x + 1},{pile.grid_position_y + 1}
                              </span>
                            </>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                  {releaseHistory.length === 0 && (
                    <div className="text-sm text-zinc-500">Nenhum histórico encontrado.</div>
                  )}
                </div>
              </div>
            )}
          </section>
          </>
        )}
      </div>

      <SyncStatusIndicator />

      <ReleaseModal
        open={releaseOpen}
        piles={selectedPiles}
        onClose={() => setReleaseOpen(false)}
        onSuccess={() => setSelectedPileIds(new Set())}
        onError={(msg) => setGlobalError(msg)}
      />

      <ReservationModal
        open={reservationOpen}
        piles={selectedPiles}
        onClose={() => setReservationOpen(false)}
        onSuccess={() => setSelectedPileIds(new Set())}
        onError={(msg) => setGlobalError(msg)}
      />
    </div>
  );
}
