import { db } from "@/lib/db";
import { enqueueUpsert } from "@/lib/syncOutbox";

/**
 * Troca posições na grade entre dois montes do mesmo lote,
 * ou move um monte para célula vazia (target sem monte).
 */
export async function applyGridMove(params: {
  draggedPileId: string;
  targetCellX: number;
  targetCellY: number;
  batchId: string;
}): Promise<void> {
  const { draggedPileId, targetCellX, targetCellY, batchId } = params;

  const affected = new Set<string>();

  await db.transaction("rw", db.leadPiles, async () => {
    const dragged = await db.leadPiles.get(draggedPileId);
    if (!dragged || dragged.batch_id !== batchId) {
      throw new Error("Monte inválido para esta grade.");
    }
    if (dragged.status === "CONSUMED") {
      throw new Error("Montes consumidos não podem ser movidos.");
    }

    const pilesInBatch = await db.leadPiles
      .where("batch_id")
      .equals(batchId)
      .toArray();

    const targetPile = pilesInBatch.find(
      (p) =>
        p.grid_position_x === targetCellX &&
        p.grid_position_y === targetCellY &&
        p.id !== draggedPileId,
    );

    if (targetPile) {
      if (targetPile.status === "CONSUMED") {
        throw new Error("Não é possível trocar com posição ocupada por monte consumido.");
      }
      affected.add(dragged.id);
      affected.add(targetPile.id);
      const ox = dragged.grid_position_x;
      const oy = dragged.grid_position_y;
      await db.leadPiles.update(dragged.id, {
        grid_position_x: targetPile.grid_position_x,
        grid_position_y: targetPile.grid_position_y,
      });
      await db.leadPiles.update(targetPile.id, {
        grid_position_x: ox,
        grid_position_y: oy,
      });
      return;
    }

    affected.add(dragged.id);
    await db.leadPiles.update(dragged.id, {
      grid_position_x: targetCellX,
      grid_position_y: targetCellY,
    });
  });

  for (const pid of affected) {
    const p = await db.leadPiles.get(pid);
    if (p) await enqueueUpsert("leadPiles", p);
  }
}
