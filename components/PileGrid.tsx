"use client";

import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LeadPile } from "@/lib/types";
import { GRID_COLS, GRID_ROWS } from "@/lib/gridLayout";
import { formatIntPtBr, formatKgPtBr } from "@/lib/formatPtBr";
import { applyGridMove } from "@/lib/swapGridPositions";

type CellMeta = { batchId: string; x: number; y: number };

function DroppableCell({
  batchId,
  x,
  y,
  children,
}: {
  batchId: string;
  x: number;
  y: number;
  children: React.ReactNode;
}) {
  const meta: CellMeta = { batchId, x, y };
  const { setNodeRef, isOver } = useDroppable({
    id: `cell:${batchId}:${x}:${y}`,
    data: meta,
  });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-[48px] rounded-lg border-2 border-dashed p-1 transition-colors ${
        isOver
          ? "border-blue-500 bg-blue-50/60 dark:border-blue-400 dark:bg-blue-950/40"
          : "border-zinc-200 bg-zinc-50/50 dark:border-zinc-700 dark:bg-zinc-900/40"
      }`}
    >
      {children}
    </div>
  );
}

function truncateLabel(s: string | null, max: number) {
  if (!s) return "";
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function PileCell({
  pile,
  batchId,
  selected,
  onTogglePile,
  moveMode,
  onOpenMenu,
}: {
  pile: LeadPile;
  batchId: string;
  selected: boolean;
  onTogglePile: (pileId: string) => void;
  moveMode: boolean;
  onOpenMenu: (pileId: string, anchorRect: DOMRect) => void;
}) {
  const consumed = pile.status === "CONSUMED";
  const reserved = pile.reserved_for != null || pile.status === "RESERVED";
  const partial = pile.status === "PARTIAL";

  const { attributes, listeners, setNodeRef } = useDraggable({
    id: `pile:${pile.id}`,
    disabled: consumed || !moveMode,
    data: { pileId: pile.id },
  });

  const cardTone = consumed
    ? "border-red-400 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100"
    : reserved
      ? `border-blue-400 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/40${partial ? " border-l-4 border-l-amber-400 pl-1.5" : ""}`
      : partial
        ? "border-amber-400 bg-amber-50 dark:border-amber-600 dark:bg-amber-950/40"
        : "border-emerald-300 bg-white dark:border-emerald-800 dark:bg-zinc-950";

  return (
    <DroppableCell batchId={batchId} x={pile.grid_position_x} y={pile.grid_position_y}>
      <div className={`relative flex h-full min-h-[40px] flex-col rounded-md border p-2 pt-5 shadow-sm ${cardTone}`}>
        {reserved && pile.reserved_for && (
          <span
            className="absolute left-1 top-1 max-w-[calc(100%-8px)] truncate rounded bg-blue-700/90 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-tight text-white dark:bg-blue-600/90"
            title={pile.reserved_for}
          >
            RES · {truncateLabel(pile.reserved_for, 8)}
          </span>
        )}
        {reserved && !pile.reserved_for && (
          <span className="absolute left-1 top-1 rounded bg-blue-700/90 px-1 py-0.5 text-[9px] font-semibold text-white">
            RESERVADO
          </span>
        )}
        <button
          type="button"
          disabled={consumed}
          data-pile-id={pile.id}
          onClick={(e) => {
            // Primeiro clique: seleciona. Segundo clique (já selecionado): abre menu.
            if (consumed) return;
            if (!selected) {
              onTogglePile(pile.id);
              return;
            }
            const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
            onOpenMenu(pile.id, rect);
          }}
          ref={setNodeRef}
          {...(moveMode && !consumed ? listeners : {})}
          {...(moveMode && !consumed ? attributes : {})}
          className={`flex flex-1 flex-col text-left disabled:cursor-not-allowed ${
            selected && !consumed ? "outline outline-2 outline-blue-500" : ""
          } ${moveMode && !consumed ? "cursor-grab active:cursor-grabbing" : ""}`}
        >
          <span className="w-full whitespace-nowrap overflow-hidden text-[13px] font-bold tabular-nums leading-tight sm:text-base">
            {consumed ? "0" : formatKgPtBr(pile.current_weight)}
            <span className="text-xs font-normal text-zinc-500"> kg</span>
          </span>
          <span className="mt-auto self-end text-xs tabular-nums text-zinc-600 dark:text-zinc-400">
            {consumed ? "0" : formatIntPtBr(pile.current_bars)} br
          </span>
        </button>
      </div>
    </DroppableCell>
  );
}

function EmptyCell({
  batchId,
  x,
  y,
}: {
  batchId: string;
  x: number;
  y: number;
}) {
  return (
    <DroppableCell batchId={batchId} x={x} y={y}>
      <div className="flex h-full min-h-[40px] items-center justify-center text-[11px] text-zinc-400">
        vazio
      </div>
    </DroppableCell>
  );
}

type Props = {
  batchId: string;
  piles: LeadPile[];
  selectedPileIds: Set<string>;
  onTogglePile: (pileId: string) => void;
  onMoveError: (msg: string) => void;
  onRequestRelease: (pileIds: string[]) => void;
  onRequestReserve: (pileIds: string[]) => void;
  onRequestCancelReservation: (pileId: string) => void;
  onRequestHistory: (pileId: string) => void;
  onRequestSelectMore: () => void;
  onRequestEditPile?: (pileId: string) => void;
};

/** Grade até 7×4; seleção por clique; menu por 2º clique. */
export function PileGrid({
  batchId,
  piles,
  selectedPileIds,
  onTogglePile,
  onMoveError,
  onRequestRelease,
  onRequestReserve,
  onRequestCancelReservation,
  onRequestHistory,
  onRequestSelectMore,
  onRequestEditPile,
}: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  const byPos = new Map<string, LeadPile>();
  for (const p of piles) {
    byPos.set(`${p.grid_position_x},${p.grid_position_y}`, p);
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const pileId = event.active.data.current?.pileId as string | undefined;
    const over = event.over;
    if (!pileId || !over?.data.current) return;
    const cell = over.data.current as CellMeta;
    if (cell.batchId !== batchId) return;
    try {
      await applyGridMove({
        draggedPileId: pileId,
        targetCellX: cell.x,
        targetCellY: cell.y,
        batchId,
      });
    } catch (err) {
      console.error("[PileGrid] Erro ao mover na grade:", err);
      const msg = err instanceof Error ? err.message : "Não foi possível mover o monte.";
      onMoveError(msg);
    }
  };

  const [menuPileId, setMenuPileId] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [moveMode, setMoveMode] = useState(false);

  const selectedIds = useMemo(() => Array.from(selectedPileIds), [selectedPileIds]);

  const menuPile = menuPileId ? piles.find((p) => p.id === menuPileId) : null;
  const canReserveFromMenu = menuPile?.status === "AVAILABLE";
  const canCancelReservation =
    menuPile &&
    menuPile.status !== "CONSUMED" &&
    (menuPile.reserved_for != null || menuPile.status === "RESERVED");
  const canEditQuantities =
    Boolean(onRequestEditPile) &&
    menuPile &&
    (menuPile.status === "AVAILABLE" || menuPile.status === "RESERVED");

  const openMenu = (pileId: string, anchorRect: DOMRect) => {
    setMenuPileId(pileId);
    setMenuAnchor(anchorRect);
  };

  const closeMenu = () => {
    setMenuPileId(null);
    setMenuAnchor(null);
    setMenuPos(null);
  };

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

  const recomputeMenuPos = () => {
    if (!menuPileId || !menuAnchor) return;
    const el = menuRef.current;
    const menuW = el?.offsetWidth ?? 220;
    const menuH = el?.offsetHeight ?? 240;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pad = 8;

    const left = clamp(menuAnchor.left, pad, Math.max(pad, vw - menuW - pad));

    const belowTop = menuAnchor.bottom + 6;
    const fitsBelow = belowTop + menuH <= vh - pad;
    const aboveTop = menuAnchor.top - menuH - 6;
    const preferredTop = fitsBelow ? belowTop : aboveTop;
    const top = clamp(preferredTop, pad, Math.max(pad, vh - menuH - pad));

    setMenuPos({ top, left });
  };

  useEffect(() => {
    if (!menuPileId || !menuAnchor) return;
    // 1) calcula no próximo frame (quando o menu já tem tamanho real)
    const raf = window.requestAnimationFrame(recomputeMenuPos);
    // 2) recalcula em resize/scroll enquanto aberto
    const onResize = () => recomputeMenuPos();
    const onScroll = () => recomputeMenuPos();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuPileId, menuAnchor]);

  const cells: React.ReactNode[] = [];
  for (let y = 0; y < GRID_ROWS; y++) {
    for (let x = 0; x < GRID_COLS; x++) {
      const pile = byPos.get(`${x},${y}`);
      const key = `${batchId}-${x}-${y}`;
      if (pile) {
        cells.push(
          <PileCell
            key={key}
            pile={pile}
            batchId={batchId}
            selected={selectedPileIds.has(pile.id)}
            onTogglePile={onTogglePile}
            moveMode={moveMode}
            onOpenMenu={openMenu}
          />,
        );
      } else {
        cells.push(<EmptyCell key={key} batchId={batchId} x={x} y={y} />);
      }
    }
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <p className="mb-2 text-xs text-zinc-500">
        Toque no monte para selecionar. Toque novamente (já selecionado) para abrir opções.
        {moveMode ? " Modo mover ativo: arraste o monte pelo bloco." : ""}
      </p>
      <div className="-mx-1 overflow-x-auto overscroll-x-contain px-1 pb-1 [scrollbar-gutter:stable]">
        <div className="grid gap-2 [grid-template-columns:repeat(7,90px)] sm:[grid-template-columns:repeat(7,minmax(0,1fr))]">
          {cells}
        </div>
      </div>

      {menuPileId && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Fechar menu"
            className="absolute inset-0 cursor-default"
            onClick={closeMenu}
          />
          <div
            ref={menuRef}
            className="absolute w-[220px] rounded-xl border border-zinc-200 bg-white p-2 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
            style={{
              top: (menuPos?.top ?? 0) || undefined,
              left: (menuPos?.left ?? 0) || undefined,
              visibility: menuPos ? "visible" : "hidden",
            }}
          >
            <div className="px-2 pb-1 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Ações do monte
            </div>
            <div className="grid gap-1">
              {canEditQuantities && (
                <button
                  type="button"
                  className="rounded-lg px-2 py-2 text-left text-sm font-medium text-zinc-800 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800"
                  onClick={() => {
                    onRequestEditPile?.(menuPileId);
                    closeMenu();
                  }}
                >
                  Corrigir peso/barras
                </button>
              )}
              {canReserveFromMenu && (
                <button
                  type="button"
                  className="rounded-lg px-2 py-2 text-left text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  onClick={() => {
                    const ids = selectedPileIds.has(menuPileId) ? selectedIds : [menuPileId];
                    onRequestReserve(ids);
                    closeMenu();
                  }}
                >
                  Reservar
                </button>
              )}
              {canCancelReservation && (
                <button
                  type="button"
                  className="rounded-lg px-2 py-2 text-left text-sm font-medium text-blue-800 hover:bg-zinc-100 dark:text-blue-300 dark:hover:bg-zinc-800"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Cancelar a reserva deste monte? Ele volta a ficar disponível para outros (saldo inalterado).",
                      )
                    ) {
                      onRequestCancelReservation(menuPileId);
                    }
                    closeMenu();
                  }}
                >
                  Cancelar reserva
                </button>
              )}
              <button
                type="button"
                className="rounded-lg px-2 py-2 text-left text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
                onClick={() => {
                  const ids = selectedPileIds.has(menuPileId) ? selectedIds : [menuPileId];
                  onRequestRelease(ids);
                  closeMenu();
                }}
              >
                Liberar
              </button>
              <button
                type="button"
                className="rounded-lg px-2 py-2 text-left text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
                onClick={() => {
                  setMoveMode(true);
                  closeMenu();
                }}
              >
                Mover
              </button>
              <button
                type="button"
                className="rounded-lg px-2 py-2 text-left text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
                onClick={() => {
                  onRequestSelectMore();
                  closeMenu();
                }}
              >
                Selecionar mais
              </button>
              <button
                type="button"
                className="rounded-lg px-2 py-2 text-left text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
                onClick={() => {
                  if (selectedPileIds.has(menuPileId)) onTogglePile(menuPileId);
                  closeMenu();
                }}
              >
                Desselecionar
              </button>
              <button
                type="button"
                className="rounded-lg px-2 py-2 text-left text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
                onClick={() => {
                  onRequestHistory(menuPileId);
                  closeMenu();
                }}
              >
                Histórico
              </button>
              {moveMode && (
                <button
                  type="button"
                  className="rounded-lg px-2 py-2 text-left text-sm font-medium text-amber-700 hover:bg-zinc-100 dark:text-amber-300 dark:hover:bg-zinc-800"
                  onClick={() => {
                    setMoveMode(false);
                    closeMenu();
                  }}
                >
                  Sair do modo mover
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </DndContext>
  );
}
