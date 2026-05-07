import { db } from "@/lib/db";
import type {
  LeadAlloy,
  LeadBatch,
  LeadPile,
} from "@/lib/types";
import { uuidV4 } from "@/lib/uuid";

/** Popula dados de demonstração se o banco estiver vazio. */
export async function seedIfEmpty(): Promise<void> {
  const count = await db.leadAlloys.count();
  if (count > 0) return;

  const alloy0: LeadAlloy = {
    id: uuidV4(),
    name: "Liga 0",
  };
  const alloy5: LeadAlloy = {
    id: uuidV4(),
    name: "Liga 5",
  };

  const batchA: LeadBatch = {
    id: uuidV4(),
    alloy_id: alloy0.id,
    batch_number: "LOTE-2025-014",
    arrival_date: "2025-03-12",
    initial_total_weight: 750,
    initial_total_bars: 150,
  };

  const batchB: LeadBatch = {
    id: uuidV4(),
    alloy_id: alloy5.id,
    batch_number: "LOTE-2025-022",
    arrival_date: "2025-04-01",
    initial_total_weight: 500,
    initial_total_bars: 100,
  };

  const pilesA: LeadPile[] = [
    {
      id: uuidV4(),
      batch_id: batchA.id,
      current_weight: 250,
      current_bars: 50,
      grid_position_x: 0,
      grid_position_y: 0,
      status: "AVAILABLE",
      reserved_for: null,
      reserved_at: null,
    },
    {
      id: uuidV4(),
      batch_id: batchA.id,
      current_weight: 250,
      current_bars: 50,
      grid_position_x: 1,
      grid_position_y: 0,
      status: "AVAILABLE",
      reserved_for: null,
      reserved_at: null,
    },
    {
      id: uuidV4(),
      batch_id: batchA.id,
      current_weight: 250,
      current_bars: 50,
      grid_position_x: 2,
      grid_position_y: 0,
      status: "AVAILABLE",
      reserved_for: null,
      reserved_at: null,
    },
  ];

  const pilesB: LeadPile[] = [
    {
      id: uuidV4(),
      batch_id: batchB.id,
      current_weight: 300,
      current_bars: 60,
      grid_position_x: 0,
      grid_position_y: 0,
      status: "AVAILABLE",
      reserved_for: null,
      reserved_at: null,
    },
    {
      id: uuidV4(),
      batch_id: batchB.id,
      current_weight: 200,
      current_bars: 40,
      grid_position_x: 1,
      grid_position_y: 0,
      status: "PARTIAL",
      reserved_for: null,
      reserved_at: null,
    },
  ];

  await db.transaction(
    "rw",
    db.leadAlloys,
    db.leadBatches,
    db.leadPiles,
    async () => {
      await db.leadAlloys.bulkAdd([alloy0, alloy5]);
      await db.leadBatches.bulkAdd([batchA, batchB]);
      await db.leadPiles.bulkAdd([...pilesA, ...pilesB]);
    },
  );
}
