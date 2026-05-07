import { db } from "@/lib/db";
import { enqueueUpsert } from "@/lib/syncOutbox";

/** Enfileira upsert de todas as linhas locais (para migração inicial / backup manual na nuvem). Ordem respeita FKs. */
export async function enqueueAllDexieRows(): Promise<void> {
  const alloys = await db.leadAlloys.toArray();
  for (const r of alloys) await enqueueUpsert("leadAlloys", r);

  const batches = await db.leadBatches.toArray();
  for (const r of batches) await enqueueUpsert("leadBatches", r);

  const piles = await db.leadPiles.toArray();
  for (const r of piles) await enqueueUpsert("leadPiles", r);

  const txs = await db.leadTransactions.toArray();
  for (const r of txs) await enqueueUpsert("leadTransactions", r);

  const evs = await db.leadPileEvents.toArray();
  for (const r of evs) await enqueueUpsert("leadPileEvents", r);
}
