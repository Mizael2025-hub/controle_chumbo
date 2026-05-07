import {
  MAX_PILES_PER_BATCH,
  gridCoordsFromIndex,
} from "@/lib/gridLayout";

export type PileSplit = { bars: number; weightKg: number; x: number; y: number };

/**
 * Divide totais do lote em N montes (peso em gramas internamente para somar certo).
 * Posições: linha a linha, esquerda → direita (§5.1).
 */
export function splitBatchIntoPiles(
  totalBars: number,
  totalWeightKg: number,
  pileCount: number,
): PileSplit[] {
  if (pileCount < 1 || pileCount > MAX_PILES_PER_BATCH) {
    throw new Error(
      `Quantidade de montes deve ser entre 1 e ${MAX_PILES_PER_BATCH}.`,
    );
  }
  if (!Number.isInteger(totalBars) || totalBars < 1) {
    throw new Error("Total de barras deve ser um número inteiro ≥ 1.");
  }
  if (totalWeightKg <= 0 || !Number.isFinite(totalWeightKg)) {
    throw new Error("Peso total deve ser um número maior que zero.");
  }

  const barsBase = Math.floor(totalBars / pileCount);
  const barsRem = totalBars % pileCount;
  const gramsTotal = Math.round(totalWeightKg * 1000);
  if (gramsTotal < 1) {
    throw new Error("Peso total muito pequeno após arredondamento.");
  }
  const gramsBase = Math.floor(gramsTotal / pileCount);
  const gramsRem = gramsTotal % pileCount;

  const out: PileSplit[] = [];
  for (let i = 0; i < pileCount; i++) {
    const bars = barsBase + (i < barsRem ? 1 : 0);
    const grams = gramsBase + (i < gramsRem ? 1 : 0);
    const { x, y } = gridCoordsFromIndex(i);
    out.push({
      bars,
      weightKg: grams / 1000,
      x,
      y,
    });
  }

  const sumBars = out.reduce((s, p) => s + p.bars, 0);
  if (sumBars !== totalBars) {
    throw new Error("Erro interno na distribuição de barras.");
  }
  return out;
}
