import { normalizeAlloyColorKey, nextDefaultColorKey, type AlloyColorKey } from "@/lib/alloyColors";
import { db } from "@/lib/db";
import { enqueueDelete, enqueueUpsert } from "@/lib/syncOutbox";
import { uuidV4 } from "@/lib/uuid";

/** Cadastra nova liga. */
export async function addAlloy(name: string, colorKey?: AlloyColorKey): Promise<string> {
  const t = name.trim();
  if (!t) {
    throw new Error("Informe o nome da liga.");
  }
  const existing = await db.leadAlloys.toArray();
  const key = colorKey ?? nextDefaultColorKey(existing.map((a) => a.color_key));
  const id = uuidV4();
  const row = { id, name: t, color_key: normalizeAlloyColorKey(key) };
  await db.leadAlloys.add(row);
  await enqueueUpsert("leadAlloys", row);
  return id;
}

/** Atualiza a cor oficial da liga. */
export async function updateAlloyColor(alloyId: string, colorKey: AlloyColorKey): Promise<void> {
  const prev = await db.leadAlloys.get(alloyId);
  if (!prev) {
    throw new Error("Liga não encontrada.");
  }
  const next = {
    ...prev,
    color_key: normalizeAlloyColorKey(colorKey),
    updated_at: new Date().toISOString(),
  };
  await db.leadAlloys.put(next);
  await enqueueUpsert("leadAlloys", next);
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
