import { db } from "@/lib/db";
import type { SyncEntityTable } from "@/lib/types";

type EntityRef = { table: SyncEntityTable; id: string };

async function purgeOutboxRows(refs: EntityRef[]): Promise<void> {
  if (refs.length === 0) return;
  const byTable = new Map<SyncEntityTable, Set<string>>();
  for (const { table, id } of refs) {
    let set = byTable.get(table);
    if (!set) {
      set = new Set();
      byTable.set(table, set);
    }
    set.add(id);
  }

  await db.transaction("rw", db.syncOutbox, async () => {
    for (const [table, ids] of byTable) {
      const rows = await db.syncOutbox.where("entity_table").equals(table).toArray();
      for (const r of rows) {
        if (r.id != null && ids.has(r.entity_id)) {
          await db.syncOutbox.delete(r.id);
        }
      }
    }
  });
}

/** Remove transações e eventos ligados ao monte e o próprio monte. */
export async function deleteLocalPileCascade(pileId: string): Promise<void> {
  const refs: EntityRef[] = [];

  await db.transaction(
    "rw",
    db.leadTransactions,
    db.leadPileEvents,
    db.leadPiles,
    async () => {
      const txs = await db.leadTransactions.where("pile_id").equals(pileId).toArray();
      for (const t of txs) {
        await db.leadTransactions.delete(t.id);
        refs.push({ table: "leadTransactions", id: t.id });
      }
      const evs = await db.leadPileEvents.where("pile_id").equals(pileId).toArray();
      for (const e of evs) {
        await db.leadPileEvents.delete(e.id);
        refs.push({ table: "leadPileEvents", id: e.id });
      }
      await db.leadPiles.delete(pileId);
      refs.push({ table: "leadPiles", id: pileId });
    },
  );

  await purgeOutboxRows(refs);
}

/** Remove lote e, em cascata, montes, transações e eventos vinculados. */
export async function deleteLocalBatchCascade(batchId: string): Promise<void> {
  const refs: EntityRef[] = [];

  await db.transaction(
    "rw",
    db.leadTransactions,
    db.leadPileEvents,
    db.leadPiles,
    db.leadBatches,
    async () => {
      const piles = await db.leadPiles.where("batch_id").equals(batchId).toArray();
      for (const p of piles) {
        const txs = await db.leadTransactions.where("pile_id").equals(p.id).toArray();
        for (const t of txs) {
          await db.leadTransactions.delete(t.id);
          refs.push({ table: "leadTransactions", id: t.id });
        }
        const evs = await db.leadPileEvents.where("pile_id").equals(p.id).toArray();
        for (const e of evs) {
          await db.leadPileEvents.delete(e.id);
          refs.push({ table: "leadPileEvents", id: e.id });
        }
        await db.leadPiles.delete(p.id);
        refs.push({ table: "leadPiles", id: p.id });
      }
      await db.leadBatches.delete(batchId);
      refs.push({ table: "leadBatches", id: batchId });
    },
  );

  await purgeOutboxRows(refs);
}
