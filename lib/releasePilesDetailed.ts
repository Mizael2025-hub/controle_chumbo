import { db } from "@/lib/db";
import type { LeadPile, LeadTransaction } from "@/lib/types";
import { enqueueUpsert } from "@/lib/syncOutbox";
import { uuidV4 } from "@/lib/uuid";

export type ReleasePileAction =
  | { pileId: string; kind: "FULL" }
  | { pileId: string; kind: "PARTIAL"; deducted_weight: number; deducted_bars: number };

export type ReleasePilesDetailedInput = {
  actions: ReleasePileAction[];
  recipient: string;
  transactionDateIso: string;
  /** Um UUID por envio do modal; todas as linhas de transação recebem o mesmo valor. */
  releaseGroupId: string;
};

/**
 * Libera montes selecionados (total ou parcial).
 *
 * - Cria 1 transação por ação (histórico).
 * - Em parcial, subtrai kg/br do saldo e marca status PARTIAL (ou CONSUMED se zerar).
 * - Em total, zera e marca CONSUMED.
 */
export async function releasePilesDetailed(input: ReleasePilesDetailedInput): Promise<void> {
  const { actions, recipient, transactionDateIso, releaseGroupId } = input;

  const gid = releaseGroupId.trim();
  if (!gid) throw new Error("Identificador do grupo de liberação inválido.");

  const ids = Array.from(new Set(actions.map((a) => a.pileId))).filter(Boolean);
  if (ids.length === 0) throw new Error("Selecione pelo menos um monte para liberar.");

  const r = recipient.trim();
  if (!r) throw new Error("Informe para quem foi liberado.");
  if (!transactionDateIso.trim()) throw new Error("Informe a data/hora da liberação.");

  const txsOut: LeadTransaction[] = [];
  const pileIdsTouched = new Set<string>();

  await db.transaction("rw", db.leadPiles, db.leadTransactions, async () => {
    const piles = await db.leadPiles.bulkGet(ids);
    const byId = new Map(piles.filter(Boolean).map((p) => [p!.id, p!]));

    if (byId.size === 0) throw new Error("Nenhum monte válido foi encontrado.");

    for (const action of actions) {
      const pile = byId.get(action.pileId);
      if (!pile) continue;
      if (pile.status === "CONSUMED") continue;

      const deducted_weight =
        action.kind === "FULL" ? pile.current_weight : action.deducted_weight;
      const deducted_bars = action.kind === "FULL" ? pile.current_bars : action.deducted_bars;

      if (!Number.isFinite(deducted_weight) || deducted_weight <= 0) {
        throw new Error("Peso para liberação deve ser maior que 0.");
      }
      if (!Number.isFinite(deducted_bars) || !Number.isInteger(deducted_bars) || deducted_bars <= 0) {
        throw new Error("Barras para liberação deve ser um inteiro maior que 0.");
      }

      if (deducted_weight > pile.current_weight + 1e-9) {
        throw new Error("Peso informado excede o saldo do monte.");
      }
      if (deducted_bars > pile.current_bars) {
        throw new Error("Barras informadas excedem o saldo do monte.");
      }

      const nextWeight = Math.max(0, Number((pile.current_weight - deducted_weight).toFixed(3)));
      const nextBars = Math.max(0, pile.current_bars - deducted_bars);
      const consumed = nextWeight === 0 && nextBars === 0;
      const hadReservation = pile.reserved_for != null;

      const txRow: LeadTransaction = {
        id: uuidV4(),
        pile_id: pile.id,
        deducted_weight,
        deducted_bars,
        destination: r,
        transaction_date: transactionDateIso,
        release_group_id: gid,
      };
      await db.leadTransactions.add(txRow);
      txsOut.push(txRow);
      pileIdsTouched.add(pile.id);

      if (consumed) {
        await db.leadPiles.update(pile.id, {
          current_weight: 0,
          current_bars: 0,
          status: "CONSUMED",
          reserved_for: null,
          reserved_at: null,
        });
      } else {
        const patch: Partial<LeadPile> = {
          current_weight: nextWeight,
          current_bars: nextBars,
          status: "PARTIAL",
        };
        if (!hadReservation) {
          patch.reserved_for = null;
          patch.reserved_at = null;
        }
        await db.leadPiles.update(pile.id, patch);
      }
    }
  });

  for (const t of txsOut) await enqueueUpsert("leadTransactions", t);
  for (const pid of pileIdsTouched) {
    const p = await db.leadPiles.get(pid);
    if (p) await enqueueUpsert("leadPiles", p);
  }
}

