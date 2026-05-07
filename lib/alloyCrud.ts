import { db } from "@/lib/db";
import { enqueueDelete, enqueueUpsert } from "@/lib/syncOutbox";
import { uuidV4 } from "@/lib/uuid";

/** Cadastra nova liga. */
export async function addAlloy(name: string): Promise<string> {
  const t = name.trim();
  if (!t) {
    throw new Error("Informe o nome da liga.");
  }
  const id = uuidV4();
  const row = { id, name: t };
  await db.leadAlloys.add(row);
  await enqueueUpsert("leadAlloys", row);
  return id;
}

/** Remove liga somente se não houver lotes vinculados. */
export async function deleteAlloy(alloyId: string): Promise<void> {
  const n = await db.leadBatches.where("alloy_id").equals(alloyId).count();
  if (n > 0) {
    throw new Error(
      "Não é possível excluir: existem lotes nesta liga. Remova ou transfira os lotes antes.",
    );
  }
  await db.leadAlloys.delete(alloyId);
  await enqueueDelete("leadAlloys", alloyId);
}
