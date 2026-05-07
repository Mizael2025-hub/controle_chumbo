import { db } from "@/lib/db";
import type { LeadPileEvent } from "@/lib/types";
import { enqueueUpsert } from "@/lib/syncOutbox";
import { uuidV4 } from "@/lib/uuid";

export type ReservePilesInput = {
  pileIds: string[];
  recipient: string;
  reservationDateIso: string;
};

/**
 * Marca montes como reservados (inteiro): permanecem no estoque com mesmo peso/barras.
 * Apenas pilhas AVAILABLE.
 */
export async function reservePiles(input: ReservePilesInput): Promise<void> {
  const { pileIds, recipient, reservationDateIso } = input;

  const ids = Array.from(new Set(pileIds)).filter(Boolean);
  if (ids.length === 0) throw new Error("Selecione pelo menos um monte para reservar.");

  const r = recipient.trim();
  if (!r) throw new Error("Informe para quem está reservando.");
  if (!reservationDateIso.trim()) throw new Error("Informe a data/hora da reserva.");

  const d = new Date(reservationDateIso);
  if (Number.isNaN(d.getTime())) throw new Error("Data/hora da reserva inválida.");

  const eventsAcc: LeadPileEvent[] = [];

  await db.transaction("rw", db.leadPiles, db.leadPileEvents, async () => {
    const piles = await db.leadPiles.bulkGet(ids);

    for (let i = 0; i < ids.length; i++) {
      const pile = piles[i];
      if (!pile) {
        throw new Error("Um ou mais montes não foram encontrados.");
      }
      if (pile.status === "CONSUMED") {
        throw new Error("Não é possível reservar um monte já consumido.");
      }
      if (pile.status !== "AVAILABLE") {
        throw new Error(
          "Só é possível reservar montes totalmente disponíveis (não parciais nem já reservados).",
        );
      }
    }

    for (const pile of piles) {
      if (!pile) continue;
      await db.leadPiles.update(pile.id, {
        status: "RESERVED",
        reserved_for: r,
        reserved_at: d.toISOString(),
      });

      const ev: LeadPileEvent = {
        id: uuidV4(),
        pile_id: pile.id,
        kind: "RESERVED",
        recipient: r,
        event_date: d.toISOString(),
      };
      await db.leadPileEvents.add(ev);
      eventsAcc.push(ev);
    }
  });

  for (const id of ids) {
    const p = await db.leadPiles.get(id);
    if (p) await enqueueUpsert("leadPiles", p);
  }
  for (const ev of eventsAcc) await enqueueUpsert("leadPileEvents", ev);
}

/** Remove a reserva: RESERVED volta a AVAILABLE; PARTIAL com reserva permanece PARTIAL. */
export async function cancelReservation(pileId: string): Promise<void> {
  if (!pileId.trim()) throw new Error("Monte inválido.");

  let cancelEv: LeadPileEvent | null = null;

  await db.transaction("rw", db.leadPiles, db.leadPileEvents, async () => {
    const pile = await db.leadPiles.get(pileId);
    if (!pile) throw new Error("Monte não encontrado.");
    if (pile.reserved_for == null && pile.status !== "RESERVED") {
      throw new Error("Este monte não está reservado.");
    }
    if (pile.status === "CONSUMED") {
      throw new Error("Monte consumido não pode ter reserva cancelada.");
    }

    const nextStatus = pile.status === "RESERVED" ? "AVAILABLE" : pile.status;
    const rec = pile.reserved_for ?? "";

    await db.leadPiles.update(pileId, {
      status: nextStatus,
      reserved_for: null,
      reserved_at: null,
    });

    cancelEv = {
      id: uuidV4(),
      pile_id: pileId,
      kind: "CANCELLED_RESERVATION",
      recipient: rec,
      event_date: new Date().toISOString(),
    };
    await db.leadPileEvents.add(cancelEv);
  });

  const pileAfter = await db.leadPiles.get(pileId);
  if (pileAfter) await enqueueUpsert("leadPiles", pileAfter);
  if (cancelEv) await enqueueUpsert("leadPileEvents", cancelEv);
}
