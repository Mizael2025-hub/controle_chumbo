"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { computeBatchStock } from "@/lib/batchTotals";
import { cancelReservation } from "@/lib/reservePiles";
import type { LeadAlloy, LeadBatch, LeadPile, LeadPileEvent, LeadTransaction } from "@/lib/types";
import { formatIntPtBr, formatKgPtBr } from "@/lib/formatPtBr";
import { updateBatchMetadata, updatePileQuantities } from "@/lib/inventoryEdit";
import { ErrorBanner, type AppErrorBannerEntry } from "@/components/ErrorBanner";
import {
  formatBannerDetail,
  formatBannerSummary,
  logAppError,
  newErrorId,
} from "@/lib/appError";
import { PileGrid } from "@/components/PileGrid";
import { CadastrosView } from "@/components/CadastrosView";
import { ReleaseModal } from "@/components/ReleaseModal";
import { ReservationModal } from "@/components/ReservationModal";
import { useAuthUser } from "@/components/AuthUserContext";
import { SyncStatusIndicator } from "@/components/SyncStatusIndicator";
import { runManualCloudReconciliation } from "@/lib/syncEngine";

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
  const [appErrors, setAppErrors] = useState<AppErrorBannerEntry[]>([]);
  const [selectedAlloyId, setSelectedAlloyId] = useState<string | null>(null);
  const [expandedBatchIds, setExpandedBatchIds] = useState<Set<string>>(() => new Set());
  const [selectedPileIds, setSelectedPileIds] = useState<Set<string>>(() => new Set());
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [reservationOpen, setReservationOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyFilter, setHistoryFilter] = useState("");
  const [historyPileId, setHistoryPileId] = useState<string | null>(null);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [lastManualSyncAt, setLastManualSyncAt] = useState<Date | null>(null);
  const [editBatch, setEditBatch] = useState<LeadBatch | null>(null);
  const [editPile, setEditPile] = useState<LeadPile | null>(null);
  const [batchEditNum, setBatchEditNum] = useState("");
  const [batchEditArrival, setBatchEditArrival] = useState("");
  const [pileKg, setPileKg] = useState("");
  const [pileBars, setPileBars] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const { userId, supabase } = useAuthUser();

  const pushErrorEntry = useCallback((summary: string, detail?: string) => {
    const id = newErrorId();
    setAppErrors((prev) => [...prev, { id, summary, detail }]);
  }, []);

  const reportMessage = useCallback(
    (summary: string, detail?: string) => {
      console.error("[LeadApp]", summary, detail ?? "");
      pushErrorEntry(summary, detail);
    },
    [pushErrorEntry],
  );

  const reportCaught = useCallback(
    (contextPtBr: string, err: unknown) => {
      logAppError(contextPtBr, err);
      pushErrorEntry(formatBannerSummary(contextPtBr, err), formatBannerDetail(err));
    },
    [pushErrorEntry],
  );

  useEffect(() => {
    const m = syncFatalMessage?.trim();
    if (!m) return;
    console.error("[LeadApp] Erro de sincronização (fluxo Auth/Sync)", m);
    pushErrorEntry(m);
    onClearSyncFatal?.();
  }, [syncFatalMessage, onClearSyncFatal, pushErrorEntry]);

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
        await db.leadAlloys.orderBy("name").limit(1).toArray();
      } catch (e) {
        reportCaught("Falha ao preparar o banco local (IndexedDB)", e);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mounted, reportCaught]);

  useEffect(() => {
    setExpandedBatchIds(new Set());
    setSelectedPileIds(new Set());
  }, [selectedAlloyId]);

  const alloysRaw = useLiveQuery(() => db.leadAlloys.orderBy("name").toArray(), []);
  const alloys = useMemo(() => alloysRaw ?? EMPTY_ALLOYS, [alloysRaw]);

  useEffect(() => {
    if (alloys.length === 0) {
      setSelectedAlloyId(null);
      return;
    }
    setSelectedAlloyId((prev) =>
      prev && alloys.some((a) => a.id === prev) ? prev : null,
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

  const batchIdsKey = useMemo(() => batches.map((b) => b.id).join("|"), [batches]);

  const pilesRaw = useLiveQuery(
    () => {
      const ids = batchIdsKey.split("|").filter(Boolean);
      if (ids.length === 0) return Promise.resolve(EMPTY_PILES);
      return Promise.all(ids.map((id) => db.leadPiles.where("batch_id").equals(id).toArray())).then(
        (parts) => parts.flat(),
      );
    },
    [batchIdsKey],
  );

  const pileIdsInAlloyKey = useMemo(() => {
    const list = pilesRaw ?? EMPTY_PILES;
    return list
      .map((p) => p.id)
      .sort()
      .join("|");
  }, [pilesRaw]);

  const transactionsRaw = useLiveQuery(
    () => {
      const pileIds = pileIdsInAlloyKey.split("|").filter(Boolean);
      if (pileIds.length === 0) return Promise.resolve([] as LeadTransaction[]);
      return db.leadTransactions.where("pile_id").anyOf(pileIds).toArray();
    },
    [pileIdsInAlloyKey],
  );

  const pileEventsRaw = useLiveQuery(
    () => {
      const pileIds = pileIdsInAlloyKey.split("|").filter(Boolean);
      if (pileIds.length === 0) return Promise.resolve([] as LeadPileEvent[]);
      return db.leadPileEvents.where("pile_id").anyOf(pileIds).toArray();
    },
    [pileIdsInAlloyKey],
  );

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

  useEffect(() => {
    if (!editBatch) return;
    setBatchEditNum(editBatch.batch_number);
    setBatchEditArrival(editBatch.arrival_date);
  }, [editBatch]);

  useEffect(() => {
    if (!editPile) return;
    setPileKg(String(editPile.current_weight).replace(".", ","));
    setPileBars(String(editPile.current_bars));
  }, [editPile]);

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

  const lastManualSyncLabel =
    lastManualSyncAt == null
      ? null
      : `Última sincronização manual: ${formatIsoToBrDateTime(lastManualSyncAt.toISOString())}`;

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
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
              Controle de chumbo
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Protótipo offline (Dexie). Os dados ficam armazenados neste navegador.
            </p>
          </div>
          {userId && supabase && (
            <button
              type="button"
              className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
              onClick={() => void supabase.auth.signOut()}
            >
              Sair
            </button>
          )}
        </header>

        <ErrorBanner
          entries={appErrors}
          onDismiss={(id) => setAppErrors((prev) => prev.filter((e) => e.id !== id))}
          onDismissAll={() => setAppErrors([])}
        />

        {userId && supabase && (
          <SyncStatusIndicator
            variant="header"
            manualSyncBusy={cloudBusy}
            lastManualSyncLabel={lastManualSyncLabel}
            onManualSync={async () => {
              setCloudBusy(true);
              try {
                await runManualCloudReconciliation(supabase, userId, {
                  onPushError: (m) => reportMessage(m),
                });
                setLastManualSyncAt(new Date());
              } catch (e) {
                reportCaught("Falha ao sincronizar com a nuvem", e);
              } finally {
                setCloudBusy(false);
              }
            }}
          />
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
              Toque numa liga para carregar os lotes desta liga. Expanda um lote para ver a grade de
              montes.
            </p>
            {alloys.length > 0 && !selectedAlloyId && (
              <p className="mb-3 text-sm text-amber-800 dark:text-amber-200/90">
                Nenhuma liga selecionada — escolha uma aba acima.
              </p>
            )}
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
              onError={(msg) => reportMessage(msg)}
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
                  <div className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-4">
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
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap justify-end gap-4 border-t border-zinc-100 pt-2 text-xs dark:border-zinc-800">
                      <button
                        type="button"
                        className="font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                        onClick={() => toggleBatch(batch.id)}
                      >
                        {open ? "Recolher grade" : "Expandir grade"}
                      </button>
                      <button
                        type="button"
                        className="font-medium text-emerald-800 hover:underline dark:text-emerald-400"
                        onClick={() => setEditBatch(batch)}
                      >
                        Editar lote
                      </button>
                    </div>
                  </div>
                  {open && (
                    <div className="border-t border-zinc-100 px-3 pb-4 pt-2 dark:border-zinc-800">
                      <PileGrid
                        batchId={batch.id}
                        piles={piles}
                        selectedPileIds={selectedPileIds}
                        onTogglePile={onTogglePile}
                        onMoveError={(msg) => reportMessage(msg)}
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
                            reportCaught("Falha ao cancelar reserva do monte", err);
                          }
                        }}
                        onRequestHistory={(pileId) => {
                          setHistoryPileId(pileId);
                          setHistoryOpen(true);
                        }}
                        onRequestSelectMore={() => {
                          // nada: apenas fecha o menu no grid
                        }}
                        onRequestEditPile={(pileId) => {
                          const p = piles.find((x) => x.id === pileId);
                          if (p) setEditPile(p);
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

      {editBatch && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-batch-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Fechar"
            onClick={() => setEditBatch(null)}
          />
          <div className="relative w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
            <h2 id="edit-batch-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Editar lote
            </h2>
            <form
              className="mt-4 space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                setEditSaving(true);
                try {
                  await updateBatchMetadata(editBatch.id, {
                    batch_number: batchEditNum,
                    arrival_date: batchEditArrival,
                  });
                  setEditBatch(null);
                } catch (err) {
                  reportCaught("Não foi possível salvar o lote", err);
                } finally {
                  setEditSaving(false);
                }
              }}
            >
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Número do lote
                <input
                  type="text"
                  required
                  value={batchEditNum}
                  onChange={(e) => setBatchEditNum(e.target.value)}
                  className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
                />
              </label>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Data de chegada
                <input
                  type="date"
                  required
                  value={batchEditArrival}
                  onChange={(e) => setBatchEditArrival(e.target.value)}
                  className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
                />
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditBatch(null)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={editSaving}
                  className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  {editSaving ? "Salvando…" : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editPile && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-pile-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Fechar"
            onClick={() => setEditPile(null)}
          />
          <div className="relative w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
            <h2 id="edit-pile-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Corrigir monte ({editPile.grid_position_x + 1},{editPile.grid_position_y + 1})
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Só é permitido se o monte não tiver baixas registradas. Disponível ou reservado.
            </p>
            <form
              className="mt-4 space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                setEditSaving(true);
                try {
                  const w = Number.parseFloat(pileKg.replace(",", "."));
                  const b = Number.parseInt(pileBars, 10);
                  await updatePileQuantities(editPile.id, {
                    current_weight: w,
                    current_bars: b,
                  });
                  setEditPile(null);
                } catch (err) {
                  reportCaught("Não foi possível salvar o monte", err);
                } finally {
                  setEditSaving(false);
                }
              }}
            >
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Peso (kg)
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  value={pileKg}
                  onChange={(e) => setPileKg(e.target.value)}
                  className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
                />
              </label>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Barras
                <input
                  type="number"
                  min={1}
                  step={1}
                  required
                  value={pileBars}
                  onChange={(e) => setPileBars(e.target.value)}
                  className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800"
                />
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditPile(null)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={editSaving}
                  className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  {editSaving ? "Salvando…" : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ReleaseModal
        open={releaseOpen}
        piles={selectedPiles}
        onClose={() => setReleaseOpen(false)}
        onSuccess={() => setSelectedPileIds(new Set())}
        onError={(msg) => reportMessage(msg)}
      />

      <ReservationModal
        open={reservationOpen}
        piles={selectedPiles}
        onClose={() => setReservationOpen(false)}
        onSuccess={() => setSelectedPileIds(new Set())}
        onError={(msg) => reportMessage(msg)}
      />
    </div>
  );
}
