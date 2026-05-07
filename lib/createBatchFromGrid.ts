import { db } from "@/lib/db";
import type { LeadBatch, LeadPile } from "@/lib/types";
import { enqueueUpsert } from "@/lib/syncOutbox";
import { uuidV4 } from "@/lib/uuid";
import { GRID_COLS, GRID_ROWS } from "@/lib/gridLayout";

export type CreateBatchFromGridInput = {
  alloy_id: string;
  batch_number: string;
  arrival_date: string; // ISO yyyy-mm-dd
  piles: Array<{
    x: number;
    y: number;
    weightKg: number;
    bars: number;
  }>;
};

/** Cria lote e montes informados manualmente por célula da grade. */
export async function createBatchFromGrid(input: CreateBatchFromGridInput): Promise<string> {
  const { alloy_id, batch_number, arrival_date, piles } = input;

  const alloy = await db.leadAlloys.get(alloy_id);
  if (!alloy) throw new Error("Liga não encontrada.");

  const bn = batch_number.trim();
  if (!bn) throw new Error("Informe o número do lote.");
  const ad = arrival_date.trim();
  if (!ad) throw new Error("Informe a data de chegada.");

  const list = Array.from(piles ?? []);
  if (list.length === 0) throw new Error("Informe pelo menos um monte na grade.");

  const seen = new Set<string>();
  for (const p of list) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new Error("Posição inválida na grade.");
    if (p.x < 0 || p.x >= GRID_COLS || p.y < 0 || p.y >= GRID_ROWS) {
      throw new Error("Posição fora da grade.");
    }
    const key = `${p.x},${p.y}`;
    if (seen.has(key)) throw new Error("Existem montes duplicados na mesma célula.");
    seen.add(key);

    if (!Number.isFinite(p.weightKg) || p.weightKg <= 0) {
      throw new Error("Peso (kg) deve ser maior que 0 em todos os montes informados.");
    }
    if (!Number.isFinite(p.bars) || !Number.isInteger(p.bars) || p.bars <= 0) {
      throw new Error("Barras deve ser um inteiro maior que 0 em todos os montes informados.");
    }
  }

  const sameAlloy = await db.leadBatches.where("alloy_id").equals(alloy_id).toArray();
  if (sameAlloy.some((b) => b.batch_number.trim().toLowerCase() === bn.toLowerCase())) {
    throw new Error("Já existe um lote com este número nesta liga.");
  }

  const initial_total_weight = Number(
    list.reduce((s, p) => s + p.weightKg, 0).toFixed(3),
  );
  const initial_total_bars = list.reduce((s, p) => s + p.bars, 0);

  const batchId = uuidV4();
  const batch: LeadBatch = {
    id: batchId,
    alloy_id,
    batch_number: bn,
    arrival_date: ad,
    initial_total_weight,
    initial_total_bars,
  };

  const pileRows: LeadPile[] = list.map((p) => ({
    id: uuidV4(),
    batch_id: batchId,
    current_weight: p.weightKg,
    current_bars: p.bars,
    grid_position_x: p.x,
    grid_position_y: p.y,
    status: "AVAILABLE",
    reserved_for: null,
    reserved_at: null,
  }));

  await db.transaction("rw", db.leadBatches, db.leadPiles, async () => {
    await db.leadBatches.add(batch);
    await db.leadPiles.bulkAdd(pileRows);
  });

  await enqueueUpsert("leadBatches", batch);
  for (const p of pileRows) await enqueueUpsert("leadPiles", p);

  return batchId;
}

