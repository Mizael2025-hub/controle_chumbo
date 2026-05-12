import { db } from "@/lib/db";
import type { LeadBatch, LeadPile } from "@/lib/types";
import { enqueueUpsert } from "@/lib/syncOutbox";

function stamp(): string {
  return new Date().toISOString();
}

export async function updateBatchMetadata(
  batchId: string,
  patch: { arrival_date?: string; batch_number?: string },
): Promise<void> {
  const batch = await db.leadBatches.get(batchId);
  if (!batch) throw new Error("Lote não encontrado.");

  const ad = (patch.arrival_date ?? batch.arrival_date).trim();
  const bn = (patch.batch_number ?? batch.batch_number).trim();
  if (!bn) throw new Error("Informe o número do lote.");
  if (!ad) throw new Error("Informe a data de chegada.");

  const sameAlloy = await db.leadBatches.where("alloy_id").equals(batch.alloy_id).toArray();
  if (sameAlloy.some((b) => b.id !== batchId && b.batch_number.trim().toLowerCase() === bn.toLowerCase())) {
    throw new Error("Já existe um lote com este número nesta liga.");
  }

  const next: LeadBatch = {
    ...batch,
    arrival_date: ad,
    batch_number: bn,
    updated_at: stamp(),
  };
  await db.leadBatches.put(next);
  await enqueueUpsert("leadBatches", next);
}

async function batchHasAnyTransactions(batchId: string): Promise<boolean> {
  const piles = await db.leadPiles.where("batch_id").equals(batchId).toArray();
  for (const p of piles) {
    const n = await db.leadTransactions.where("pile_id").equals(p.id).count();
    if (n > 0) return true;
  }
  return false;
}

async function recomputeInitialTotalsIfPristine(batchId: string): Promise<void> {
  if (await batchHasAnyTransactions(batchId)) return;

  const piles = await db.leadPiles.where("batch_id").equals(batchId).toArray();
  const batch = await db.leadBatches.get(batchId);
  if (!batch) return;

  const initial_total_weight = Number(piles.reduce((s, p) => s + p.current_weight, 0).toFixed(3));
  const initial_total_bars = piles.reduce((s, p) => s + p.current_bars, 0);

  const next: LeadBatch = {
    ...batch,
    initial_total_weight,
    initial_total_bars,
    updated_at: stamp(),
  };
  await db.leadBatches.put(next);
  await enqueueUpsert("leadBatches", next);
}

export async function updatePileQuantities(
  pileId: string,
  input: { current_weight: number; current_bars: number },
): Promise<void> {
  const pile = await db.leadPiles.get(pileId);
  if (!pile) throw new Error("Monte não encontrado.");

  if (pile.status === "CONSUMED") {
    throw new Error("Não é possível corrigir um monte já consumido.");
  }
  if (pile.status === "PARTIAL") {
    throw new Error(
      "Não é possível corrigir peso/barras de um monte parcialmente baixado. Corrija apenas antes de liberações.",
    );
  }
  if (pile.status !== "AVAILABLE" && pile.status !== "RESERVED") {
    throw new Error("Este estado do monte não permite correção de quantidade.");
  }

  const txCount = await db.leadTransactions.where("pile_id").equals(pileId).count();
  if (txCount > 0) {
    throw new Error(
      "Este monte já tem baixas registradas; não é possível alterar peso ou barras sem quebrar o histórico.",
    );
  }

  const w = input.current_weight;
  const b = input.current_bars;
  if (!Number.isFinite(w) || w <= 0) throw new Error("Peso (kg) deve ser maior que 0.");
  if (!Number.isFinite(b) || !Number.isInteger(b) || b <= 0) {
    throw new Error("Barras deve ser um inteiro maior que 0.");
  }

  const next: LeadPile = {
    ...pile,
    current_weight: Number(w.toFixed(3)),
    current_bars: b,
    updated_at: stamp(),
  };
  await db.leadPiles.put(next);
  await enqueueUpsert("leadPiles", next);

  await recomputeInitialTotalsIfPristine(pile.batch_id);
}
