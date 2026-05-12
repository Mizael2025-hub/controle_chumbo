import { db } from "@/lib/db";
import { notifyOutboxMayHaveNewWork } from "@/lib/syncFlushScheduler";
import type { SyncEntityTable, SyncOutboxRow } from "@/lib/types";

function outboxLog(action: string, detail: Record<string, unknown>): void {
  const ts = new Date().toISOString();
  console.log(`[syncOutbox ${ts}] ${action}`, detail);
}

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
  const pending = await db.syncOutbox.count();
  outboxLog("enqueueUpsert", {
    entity_table: table,
    entity_id: row.id,
    pending_rows: pending,
  });
  notifyOutboxMayHaveNewWork();
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
  const pending = await db.syncOutbox.count();
  outboxLog("enqueueDelete", {
    entity_table: table,
    entity_id: entityId,
    pending_rows: pending,
  });
  notifyOutboxMayHaveNewWork();
}
