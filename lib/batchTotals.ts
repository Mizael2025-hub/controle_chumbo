import type { LeadPile } from "@/lib/types";

/** Disponível + reservado + total físico no estoque (exclui só CONSUMED). */
export function computeBatchStock(piles: LeadPile[]): {
  available_weight: number;
  available_bars: number;
  reserved_weight: number;
  reserved_bars: number;
  stock_weight: number;
  stock_bars: number;
} {
  let available_weight = 0;
  let available_bars = 0;
  let reserved_weight = 0;
  let reserved_bars = 0;
  let stock_weight = 0;
  let stock_bars = 0;

  for (const p of piles) {
    if (p.status === "CONSUMED") continue;
    const w = p.current_weight;
    const b = p.current_bars;
    stock_weight += w;
    stock_bars += b;

    const isReserved = p.reserved_for != null || p.status === "RESERVED";
    if (isReserved) {
      reserved_weight += w;
      reserved_bars += b;
    } else if (p.status === "AVAILABLE" || p.status === "PARTIAL") {
      available_weight += w;
      available_bars += b;
    }
  }

  return {
    available_weight,
    available_bars,
    reserved_weight,
    reserved_bars,
    stock_weight,
    stock_bars,
  };
}

/**
 * Compatibilidade: total ainda no estoque (disponível + reservado).
 * Antes: só AVAILABLE + PARTIAL; agora inclui RESERVED e montes com reserva ativa.
 */
export function computeBatchRemaining(piles: LeadPile[]): {
  remaining_weight: number;
  remaining_bars: number;
} {
  const s = computeBatchStock(piles);
  return {
    remaining_weight: s.stock_weight,
    remaining_bars: s.stock_bars,
  };
}
