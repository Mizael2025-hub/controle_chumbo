import { db } from "@/lib/db";
import type { LeadTransaction } from "@/lib/types";
import { enqueueUpsert } from "@/lib/syncOutbox";
import { uuidV4 } from "@/lib/uuid";

export type ReleasePilesInput = {
  pileIds: string[];
  recipient: string;
  transactionDateIso: string;
};

/**
 * Libera (consome) totalmente os montes selecionados.
 *
 * - Cria 1 transação por monte (histórico).
 * - Zera peso/barras e marca status CONSUMED (§4.1).
 * - Não exige somar manualmente; usa o saldo atual de cada monte.
 */
export async function releasePiles(input: ReleasePilesInput): Promise<void> {
  const { pileIds, recipient, transactionDateIso } = input;

  const ids = Array.from(new Set(pileIds)).filter(Boolean);
  if (ids.length === 0) {
    throw new Error("Selecione pelo menos um monte para liberar.");
  }
  const r = recipient.trim();
  if (!r) {
    throw new Error("Informe para quem foi liberado.");
  }
  if (!transactionDateIso.trim()) {
    throw new Error("Informe a data/hora da liberação.");
  }

  const txs: LeadTransaction[] = [];
  const releaseGroupId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  await db.transaction("rw", db.leadPiles, db.leadTransactions, async () => {
    const piles = await db.leadPiles.bulkGet(ids);
    const valid = piles.filter(Boolean);

    if (valid.length === 0) {
      throw new Error("Nenhum monte válido foi encontrado.");
    }

    for (const pile of valid) {
      if (!pile) continue;
      if (pile.status === "CONSUMED") continue;

      const txRow: LeadTransaction = {
        id: uuidV4(),
        pile_id: pile.id,
        deducted_weight: pile.current_weight,
        deducted_bars: pile.current_bars,
        destination: r, // neste MVP, usamos destination como "para quem foi liberado"
        transaction_date: transactionDateIso,
        release_group_id: releaseGroupId,
      };
      await db.leadTransactions.add(txRow);
      txs.push(txRow);

      await db.leadPiles.update(pile.id, {
        current_weight: 0,
        current_bars: 0,
        status: "CONSUMED",
        reserved_for: null,
        reserved_at: null,
      });
    }
  });

  for (const t of txs) await enqueueUpsert("leadTransactions", t);
  for (const id of ids) {
    const p = await db.leadPiles.get(id);
    if (p) await enqueueUpsert("leadPiles", p);
  }
}

