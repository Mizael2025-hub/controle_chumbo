import { db } from "@/lib/db";
import type { LeadBatch, LeadPile } from "@/lib/types";
import { splitBatchIntoPiles } from "@/lib/splitBatchIntoPiles";
import { enqueueUpsert } from "@/lib/syncOutbox";
import { uuidV4 } from "@/lib/uuid";

export type CreateBatchInput = {
  alloy_id: string;
  batch_number: string;
  arrival_date: string;
  initial_total_bars: number;
  initial_total_weight: number;
  pile_count: number;
};

/** Cria lote e montes na grade (entrada de material). */
export async function createBatchWithPiles(
  input: CreateBatchInput,
): Promise<string> {
  const {
    alloy_id,
    batch_number,
    arrival_date,
    initial_total_bars,
    initial_total_weight,
    pile_count,
  } = input;

  const alloy = await db.leadAlloys.get(alloy_id);
  if (!alloy) {
    throw new Error("Liga não encontrada.");
  }

  const bn = batch_number.trim();
  if (!bn) {
    throw new Error("Informe o número do lote.");
  }
  if (!arrival_date.trim()) {
    throw new Error("Informe a data de chegada.");
  }

  const sameAlloy = await db.leadBatches
    .where("alloy_id")
    .equals(alloy_id)
    .toArray();
  if (
    sameAlloy.some(
      (b) => b.batch_number.trim().toLowerCase() === bn.toLowerCase(),
    )
  ) {
    throw new Error("Já existe um lote com este número nesta liga.");
  }

  const splits = splitBatchIntoPiles(
    initial_total_bars,
    initial_total_weight,
    pile_count,
  );

  const batchId = uuidV4();
  const batch: LeadBatch = {
    id: batchId,
    alloy_id,
    batch_number: bn,
    arrival_date: arrival_date.trim(),
    initial_total_weight,
    initial_total_bars,
  };

  const piles: LeadPile[] = splits.map((s) => ({
    id: uuidV4(),
    batch_id: batchId,
    current_weight: s.weightKg,
    current_bars: s.bars,
    grid_position_x: s.x,
    grid_position_y: s.y,
    status: "AVAILABLE" as const,
    reserved_for: null,
    reserved_at: null,
  }));

  await db.transaction("rw", db.leadBatches, db.leadPiles, async () => {
    await db.leadBatches.add(batch);
    await db.leadPiles.bulkAdd(piles);
  });

  await enqueueUpsert("leadBatches", batch);
  for (const p of piles) await enqueueUpsert("leadPiles", p);

  return batchId;
}
