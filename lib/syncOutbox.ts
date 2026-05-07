import { db } from "@/lib/db";
import type { SyncEntityTable, SyncOutboxRow } from "@/lib/types";

/** Enfileira upsert da linha atual do Dexie para envio ao Supabase. */
export async function enqueueUpsert(table: SyncEntityTable, row: { id: string }): Promise<void> {
  const rowSync: SyncOutboxRow = {
    entity_table: table,
    entity_id: row.id,
    op: "upsert",
    payload_json: JSON.stringify(row),
    created_at: new Date().toISOString(),
    attempt_count: 0,
    last_error: null,
  };
  await db.syncOutbox.add(rowSync);
}

/** Enfileira exclusão remota (após exclusão local bem-sucedida). */
export async function enqueueDelete(table: SyncEntityTable, entityId: string): Promise<void> {
  const rowSync: SyncOutboxRow = {
    entity_table: table,
    entity_id: entityId,
    op: "delete",
    payload_json: JSON.stringify({ id: entityId }),
    created_at: new Date().toISOString(),
    attempt_count: 0,
    last_error: null,
  };
  await db.syncOutbox.add(rowSync);
}
