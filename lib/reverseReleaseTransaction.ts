import { db } from "@/lib/db";
import type { LeadPile } from "@/lib/types";
import { enqueueDelete, enqueueUpsert } from "@/lib/syncOutbox";

/**
 * Remove uma liberação (linha em leadTransactions), devolve peso/barras ao monte
 * e ajusta status conforme transações restantes no mesmo monte.
 */
export async function reverseReleaseTransaction(transactionId: string): Promise<void> {
  const tx = await db.leadTransactions.get(transactionId);
  if (!tx) throw new Error("Liberação não encontrada.");

  const pile = await db.leadPiles.get(tx.pile_id);
  if (!pile) throw new Error("Monte não encontrado para esta liberação.");

  await db.transaction("rw", db.leadPiles, db.leadTransactions, async () => {
    const t = await db.leadTransactions.get(transactionId);
    if (!t) throw new Error("Liberação já foi removida.");

    const p = await db.leadPiles.get(t.pile_id);
    if (!p) throw new Error("Monte não encontrado.");

    const nw = Number((p.current_weight + t.deducted_weight).toFixed(3));
    const nb = p.current_bars + t.deducted_bars;

    if (!Number.isFinite(nw) || nw < 0) throw new Error("Saldo de peso inválido após estorno.");
    if (!Number.isInteger(nb) || nb < 0) throw new Error("Saldo de barras inválido após estorno.");

    await db.leadTransactions.delete(transactionId);

    const remaining = await db.leadTransactions.where("pile_id").equals(p.id).toArray();
    const hasOtherReleases = remaining.length > 0;

    let status: LeadPile["status"];
    if (nw === 0 && nb === 0) {
      status = "CONSUMED";
    } else if (hasOtherReleases) {
      status = "PARTIAL";
    } else {
      const reserved = p.reserved_for != null || p.status === "RESERVED";
      status = reserved ? "RESERVED" : "AVAILABLE";
    }

    await db.leadPiles.update(p.id, {
      current_weight: nw,
      current_bars: nb,
      status,
    });
  });

  await enqueueDelete("leadTransactions", transactionId);
  const updated = await db.leadPiles.get(pile.id);
  if (updated) await enqueueUpsert("leadPiles", updated);
}
