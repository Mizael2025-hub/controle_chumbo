"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { computeBatchStock } from "@/lib/batchTotals";
import { cancelReservation } from "@/lib/reservePiles";
import type { LeadAlloy, LeadBatch, LeadPile, LeadTransaction } from "@/lib/types";
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
import { CloudSyncButton } from "@/components/CloudSyncButton";
import { isNetworkError, runManualCloudReconciliation } from "@/lib/syncEngine";

import { AlloyDashboard, type AlloyDashboardRow } from "@/components/AlloyDashboard";
import { ReleaseReportView } from "@/components/ReleaseReportView";
import { AppBottomNav, type AppSection } from "@/components/layout/AppBottomNav";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { QuickActionSheet } from "@/components/layout/QuickActionSheet";
import { useDesktopLayout } from "@/hooks/useDesktopLayout";

const EMPTY_PILES: LeadPile[] = [];
const EMPTY_ALLOYS: LeadAlloy[] = [];
const EMPTY_BATCHES: LeadBatch[] = [];

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
  const desktop = useDesktopLayout();
  const [appSection, setAppSection] = useState<AppSection>("dashboard");
  const [loteTab, setLoteTab] = useState<"ativos" | "encerrados">("ativos");
  const [quickSheetOpen, setQuickSheetOpen] = useState(false);
  const [reportPileId, setReportPileId] = useState<string | null>(null);
  const [cadastroMode, setCadastroMode] = useState<"full" | "ligas" | "entrada">("ligas");
  const [appErrors, setAppErrors] = useState<AppErrorBannerEntry[]>([]);
  const [selectedAlloyId, setSelectedAlloyId] = useState<string | null>(null);
  const [expandedBatchIds, setExpandedBatchIds] = useState<Set<string>>(() => new Set());
  const [selectedPileIds, setSelectedPileIds] = useState<Set<string>>(() => new Set());
  const [pileMenuRequest, setPileMenuRequest] = useState<{
    batchId: string;
    pileId: string;
    anchorRect: DOMRect;
  } | null>(null);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [reservationOpen, setReservationOpen] = useState(false);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [syncFailed, setSyncFailed] = useState(false);
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
    setSyncFailed(true);
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
    setSelectedPileIds(new Set());
    setPileMenuRequest(null);
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

  const allBatchesRaw = useLiveQuery(() => db.leadBatches.toArray(), []);
  const allPilesRaw = useLiveQuery(() => db.leadPiles.toArray(), []);

  const alloyDashboardRows = useMemo((): AlloyDashboardRow[] => {
    const batchList = allBatchesRaw ?? EMPTY_BATCHES;
    const pileList = allPilesRaw ?? EMPTY_PILES;
    return alloys.map((alloy) => {
      const batchesFor = batchList.filter((b) => b.alloy_id === alloy.id);
      let available_weight = 0;
      let available_bars = 0;
      let stock_weight = 0;
      let stock_bars = 0;
      for (const b of batchesFor) {
        const ps = pileList.filter((p) => p.batch_id === b.id);
        const st = computeBatchStock(ps);
        available_weight += st.available_weight;
        available_bars += st.available_bars;
        stock_weight += st.stock_weight;
        stock_bars += st.stock_bars;
      }
      return {
        alloy,
        available_weight,
        available_bars,
        stock_weight,
        stock_bars,
      };
    });
  }, [alloys, allBatchesRaw, allPilesRaw]);

  const batchesVisible = useMemo(() => {
    return batchUi.filter((x) => (loteTab === "ativos" ? !x.finished : x.finished));
  }, [batchUi, loteTab]);

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

  const onTogglePile = useCallback(
    (pileId: string) => {
      const pile = pilesRaw?.find((p) => p.id === pileId);
      if (!pile) return;
      const expandedId =
        expandedBatchIds.size > 0 ? Array.from(expandedBatchIds)[0] : null;
      if (expandedId && pile.batch_id !== expandedId) return;
      setSelectedPileIds((prev) => {
        const next = new Set(prev);
        if (next.has(pileId)) next.delete(pileId);
        else next.add(pileId);
        return next;
      });
    },
    [pilesRaw, expandedBatchIds],
  );

  if (!mounted || !ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-zinc-600">
        Inicializando banco local…
      </div>
    );
  }

  return (
    <div
      className={`flex min-h-[100svh] w-full bg-[var(--background)] text-[var(--foreground)] ${
        desktop ? "flex-row" : "flex-col"
      }`}
    >
      {desktop && (
        <AppSidebar
          section={appSection}
          onNavigate={(s) => {
            setAppSection(s);
            if (s === "cadastros") setCadastroMode("ligas");
            if (s === "relatorio") setReportPileId(null);
          }}
          onQuickEntrada={() => {
            setAppSection("cadastros");
            setCadastroMode("entrada");
          }}
          onQuickLigas={() => {
            setAppSection("cadastros");
            setCadastroMode("ligas");
          }}
          onQuickSaida={() => {
            setAppSection("estoque");
          }}
        />
      )}

      <div
        className={`flex min-h-0 min-w-0 flex-1 flex-col ${
          desktop ? "" : "pb-[calc(5.5rem+env(safe-area-inset-bottom))]"
        }`}
      >
        <div className="ios-blur sticky top-0 z-20 border-b border-zinc-200/80 bg-[var(--background)]/90 px-4 pt-4 backdrop-blur-md dark:border-zinc-800/80">
          <header className="relative mb-3 flex min-h-[2.75rem] items-center justify-center">
            <h1 className="px-24 text-center text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-2xl">
              Controle de chumbo
            </h1>
            {userId && supabase && (
              <div className="absolute right-0 flex items-center gap-2">
                <CloudSyncButton
                  manualBusy={cloudBusy}
                  lastFailed={syncFailed}
                  onSync={async () => {
                    setCloudBusy(true);
                    try {
                      await runManualCloudReconciliation(supabase, userId, {
                        onPushError: (m) => {
                          setSyncFailed(true);
                          reportMessage(m);
                        },
                      });
                      setSyncFailed(false);
                    } catch (e) {
                      if (isNetworkError(e)) return;
                      setSyncFailed(true);
                      reportCaught("Falha ao sincronizar com a nuvem", e);
                    } finally {
                      setCloudBusy(false);
                    }
                  }}
                />
                <button
                  type="button"
                  className="rounded-full border-2 border-red-500 bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-red-700 active:scale-95 dark:border-red-600 dark:bg-red-700 dark:hover:bg-red-800"
                  onClick={() => {
                    if (window.confirm("Deseja realmente sair da sua conta?")) {
                      void supabase.auth.signOut();
                    }
                  }}
                >
                  Sair
                </button>
              </div>
            )}
          </header>

          <ErrorBanner
            entries={appErrors}
            onDismiss={(id) => setAppErrors((prev) => prev.filter((e) => e.id !== id))}
            onDismissAll={() => setAppErrors([])}
          />
        </div>

        <main className="mx-auto flex w-full min-h-0 max-w-6xl flex-1 flex-col px-4 pb-8 pt-4">
          {appSection === "dashboard" && (
            <AlloyDashboard
              rows={alloyDashboardRows}
              selectedAlloyId={selectedAlloyId}
              onSelectAlloy={(id) => {
                setSelectedAlloyId(id);
                setAppSection("estoque");
              }}
            />
          )}

          {appSection === "cadastros" && (
            <div className="min-h-0 flex-1 overflow-auto">
              <CadastrosView
                mode={cadastroMode}
                onError={(msg) => reportMessage(msg)}
                onGoToEstoque={(alloyId) => {
                  setAppSection("estoque");
                  if (alloyId) setSelectedAlloyId(alloyId);
                }}
              />
            </div>
          )}

          {appSection === "relatorio" && (
            <ReleaseReportView
              pileIdFilter={reportPileId}
              onClearPileFilter={() => setReportPileId(null)}
              onError={(msg) => reportMessage(msg)}
            />
          )}

          {appSection === "estoque" && (
            <>
              <nav className="mb-4 flex flex-wrap gap-2">
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

              <div className="mb-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setLoteTab("ativos")}
                  className={`rounded-full px-4 py-2 text-sm font-semibold ${
                    loteTab === "ativos"
                      ? "bg-[var(--ios-blue)] text-white"
                      : "bg-zinc-200/80 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
                  }`}
                >
                  Lotes ativos
                </button>
                <button
                  type="button"
                  onClick={() => setLoteTab("encerrados")}
                  className={`rounded-full px-4 py-2 text-sm font-semibold ${
                    loteTab === "encerrados"
                      ? "bg-[var(--ios-blue)] text-white"
                      : "bg-zinc-200/80 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
                  }`}
                >
                  Lotes encerrados
                </button>
              </div>

              <div className="space-y-4">
                {alloys.length === 0 && (
                  <p className="text-sm text-zinc-500">
                    Nenhuma liga cadastrada. Use o menu <strong>Novo (+)</strong> para cadastrar ligas e lotes.
                  </p>
                )}
                {batches.length === 0 && selectedAlloyId && alloys.length > 0 && (
                  <p className="text-sm text-zinc-500">Nenhum lote para esta liga.</p>
                )}
                {loteTab === "encerrados" && batchesVisible.length === 0 && selectedAlloyId && (
                  <p className="text-sm text-zinc-500">Nenhum lote encerrado nesta liga.</p>
                )}
                {batchUi.length > 0 && (
                  <section className="rounded-2xl border border-zinc-200/90 bg-white px-3 py-2 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/50">
                    <div className="flex flex-wrap items-baseline justify-between gap-1.5">
                      <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                        Total da liga (todos os lotes)
                      </div>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        No estoque físico = disponível + reservado
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-1.5">
                      <div className="rounded-xl bg-emerald-50 px-2 py-1.5 dark:bg-emerald-950/30">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                          Disponível
                        </div>
                        <div className="text-[12px] font-semibold leading-tight text-emerald-900 dark:text-emerald-100">
                          {formatIntPtBr(alloyStockTotals.available_bars)} br ·{" "}
                          {formatKgPtBr(alloyStockTotals.available_weight)} kg
                        </div>
                      </div>
                      <div className="rounded-xl bg-blue-50 px-2 py-1.5 dark:bg-blue-950/30">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
                          Reservado
                        </div>
                        <div className="text-[12px] font-semibold leading-tight text-blue-900 dark:text-blue-100">
                          {formatIntPtBr(alloyStockTotals.reserved_bars)} br ·{" "}
                          {formatKgPtBr(alloyStockTotals.reserved_weight)} kg
                        </div>
                      </div>
                      <div className="rounded-xl bg-zinc-100 px-2 py-1.5 dark:bg-zinc-800/60">
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
                {batchesVisible.map(({ batch, piles, stock, finished }) => {
                  const open = expandedBatchIds.has(batch.id);
                  return (
                    <section
                      key={batch.id}
                      className={`rounded-2xl border bg-white shadow-sm dark:bg-zinc-900/50 ${
                        finished
                          ? "border-zinc-200/80 opacity-80 dark:border-zinc-700/80"
                          : "border-zinc-200 dark:border-zinc-700"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleBatch(batch.id)}
                        className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-zinc-50 active:bg-zinc-100 dark:hover:bg-zinc-800/50"
                      >
                        <span className="font-semibold text-zinc-900 dark:text-zinc-50">
                          Lote {batch.batch_number}
                          {finished ? (
                            <span className="ml-1.5 text-xs font-normal text-zinc-500">· Encerrado</span>
                          ) : null}
                        </span>
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs sm:text-sm">
                          <span className="font-medium text-emerald-800 dark:text-emerald-400">
                            Disp. {formatIntPtBr(stock.available_bars)} br ·{" "}
                            {formatKgPtBr(stock.available_weight)} kg
                          </span>
                          <span className="font-medium text-blue-700 dark:text-blue-400">
                            Res. {formatIntPtBr(stock.reserved_bars)} br ·{" "}
                            {formatKgPtBr(stock.reserved_weight)} kg
                          </span>
                        </span>
                      </button>
                      {open && (
                        <div className="border-t border-zinc-100 px-3 pb-4 pt-2 dark:border-zinc-800">
                          <div className="mb-2 flex flex-wrap items-start justify-between gap-2 text-xs text-zinc-500">
                            <span>
                              Chegada: {formatIsoToBrDate(batch.arrival_date)} · Inicial:{" "}
                              {batch.initial_total_bars} br / {batch.initial_total_weight} kg
                            </span>
                            <span>
                              No estoque: {formatIntPtBr(stock.stock_bars)} br ·{" "}
                              {formatKgPtBr(stock.stock_weight)} kg
                            </span>
                          </div>
                          <div className="mb-2 flex justify-end gap-3">
                            <button
                              type="button"
                              className="text-xs font-medium text-emerald-800 hover:underline dark:text-emerald-400"
                              onClick={() => setEditBatch(batch)}
                            >
                              Editar lote
                            </button>
                            {piles.some((p) => selectedPileIds.has(p.id)) ? (
                              <button
                                type="button"
                                className="rounded-lg border border-zinc-300 bg-white px-3 py-1 text-xs font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
                                onClick={(e) => {
                                  const first = piles.find((p) => selectedPileIds.has(p.id));
                                  if (!first) return;
                                  setPileMenuRequest({
                                    batchId: batch.id,
                                    pileId: first.id,
                                    anchorRect: e.currentTarget.getBoundingClientRect(),
                                  });
                                }}
                              >
                                Menu
                              </button>
                            ) : null}
                          </div>
                          <PileGrid
                            batchId={batch.id}
                            piles={piles}
                            selectedPileIds={selectedPileIds}
                            onTogglePile={onTogglePile}
                            menuOpenRequest={
                              pileMenuRequest?.batchId === batch.id
                                ? {
                                    pileId: pileMenuRequest.pileId,
                                    anchorRect: pileMenuRequest.anchorRect,
                                  }
                                : null
                            }
                            onMenuOpenRequestHandled={() => setPileMenuRequest(null)}
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
                              setReportPileId(pileId);
                              setAppSection("relatorio");
                            }}
                            onRequestSelectMore={() => {}}
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
            </>
          )}
        </main>
      </div>

      {!desktop && (
        <AppBottomNav
          section={appSection}
          onNavigate={(s) => {
            setAppSection(s);
            if (s === "cadastros") setCadastroMode("ligas");
            if (s === "relatorio") setReportPileId(null);
          }}
          onOpenQuickActions={() => setQuickSheetOpen(true)}
        />
      )}

      <QuickActionSheet
        open={quickSheetOpen}
        onClose={() => setQuickSheetOpen(false)}
        onEntrada={() => {
          setAppSection("cadastros");
          setCadastroMode("entrada");
        }}
        onLigas={() => {
          setAppSection("cadastros");
          setCadastroMode("ligas");
        }}
        onSaida={() => {
          setAppSection("estoque");
        }}
      />

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
